import type { TranslationProvider } from "./provider";
import { mapWithConcurrency } from "./concurrency";

// DeepL API v2 (REST, "DeepL-Auth-Key" header auth). Free tier is
// 500,000 characters/month. Narrower language coverage than
// Azure/Google (~35 languages vs ~130) but generally higher
// translation quality for the languages it does support.
// https://developers.deepl.com/docs/api-reference/translate
const FREE_BASE_URL = "https://api-free.deepl.com";
const PRO_BASE_URL = "https://api.deepl.com";

// Confirmed limits: max 50 texts and max 128 KiB per /v2/translate request.
const MAX_ITEMS_PER_REQUEST = 50;
const MAX_CHARS_PER_REQUEST = 40000;

// How many chunk requests to run in parallel. Kept conservative for
// DeepL specifically — their free tier gets flaky above ~5-10
// simultaneous requests, per their own docs.
const CHUNK_CONCURRENCY = 3;

// Without this, a slow/hung DeepL response has nothing capping it and
// blocks the shopper's request indefinitely.
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Our language catalog (src/lib/languages.ts) covers ~130 languages;
 * DeepL only supports a subset. Source lang codes don't need a
 * regional variant, but target codes for English/Portuguese/Chinese
 * must specify one (DeepL rejects plain "EN"/"PT"/"ZH" as a target).
 * Verified against https://developers.deepl.com/docs/getting-started/supported-languages
 * — re-check before relying on this list, DeepL adds languages over time.
 */
const DEEPL_LOCALE_MAP: Record<string, { source: string; target: string }> = {
  ar: { source: "AR", target: "AR" },
  bg: { source: "BG", target: "BG" },
  cs: { source: "CS", target: "CS" },
  da: { source: "DA", target: "DA" },
  de: { source: "DE", target: "DE" },
  el: { source: "EL", target: "EL" },
  en: { source: "EN", target: "EN-US" },
  es: { source: "ES", target: "ES" },
  et: { source: "ET", target: "ET" },
  fi: { source: "FI", target: "FI" },
  fr: { source: "FR", target: "FR" },
  he: { source: "HE", target: "HE" },
  hu: { source: "HU", target: "HU" },
  id: { source: "ID", target: "ID" },
  it: { source: "IT", target: "IT" },
  ja: { source: "JA", target: "JA" },
  ko: { source: "KO", target: "KO" },
  lt: { source: "LT", target: "LT" },
  lv: { source: "LV", target: "LV" },
  no: { source: "NB", target: "NB" },
  nl: { source: "NL", target: "NL" },
  pl: { source: "PL", target: "PL" },
  pt: { source: "PT", target: "PT-BR" },
  ro: { source: "RO", target: "RO" },
  ru: { source: "RU", target: "RU" },
  sk: { source: "SK", target: "SK" },
  sl: { source: "SL", target: "SL" },
  sv: { source: "SV", target: "SV" },
  th: { source: "TH", target: "TH" },
  tr: { source: "TR", target: "TR" },
  uk: { source: "UK", target: "UK" },
  vi: { source: "VI", target: "VI" },
  "zh-CN": { source: "ZH", target: "ZH-HANS" },
  "zh-TW": { source: "ZH", target: "ZH-HANT" },
};

export const DEEPL_SUPPORTED_LOCALES = Object.keys(DEEPL_LOCALE_MAP);

interface DeepLResponse {
  translations: { text: string }[];
}

function chunkByCountAndChars(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const wouldExceed =
      current.length >= MAX_ITEMS_PER_REQUEST || currentChars + text.length > MAX_CHARS_PER_REQUEST;
    if (wouldExceed && current.length > 0) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export class DeepLTranslateProvider implements TranslationProvider {
  private readonly baseUrl: string;

  constructor(private readonly apiKey: string) {
    // DeepL's own convention: Free-tier keys end in ":fx" and only
    // work against api-free.deepl.com; Pro keys use api.deepl.com.
    this.baseUrl = apiKey.endsWith(":fx") ? FREE_BASE_URL : PRO_BASE_URL;
  }

  async translateBatch(
    texts: string[],
    targetLocale: string,
    sourceLocale: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const target = DEEPL_LOCALE_MAP[targetLocale];
    if (!target) {
      throw new Error(
        `DeepL does not support locale "${targetLocale}" — filter it out of the admin's language picker, or switch TRANSLATION_PROVIDER.`,
      );
    }
    const source = DEEPL_LOCALE_MAP[sourceLocale];

    const chunks = chunkByCountAndChars(texts);
    const chunkResults = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (batch) => {
      const res = await fetch(`${this.baseUrl}/v2/translate`, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: batch,
          target_lang: target.target,
          ...(source && { source_lang: source.source }),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`DeepL request failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as DeepLResponse;
      return data.translations.map((t) => t.text);
    });
    return chunkResults.flat();
  }
}
