import type { TranslationProvider } from "./provider";

// Azure AI Translator v3.0 (REST, subscription-key auth). Free tier
// (F0) is 2M characters/month, indefinitely — not a trial — with
// broad language coverage, which is why this is the default provider.
// https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/reference
const ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";
const API_VERSION = "3.0";

// Confirmed service limits: max 1000 array elements and max 50,000
// total characters per request (single target language). Chunk on
// both dimensions, with headroom under the character cap.
const MAX_ITEMS_PER_REQUEST = 100;
const MAX_CHARS_PER_REQUEST = 40000;

// Our language catalog (src/lib/languages.ts) mostly uses Google
// Translate-style codes; Azure uses BCP-47 codes that diverge for a
// handful of languages. Confirmed divergences only — everything else
// is passed through unchanged (the two code sets agree for the vast
// majority of languages, e.g. en, fr, de, ja, ko, ar, hi).
const AZURE_LOCALE_OVERRIDES: Record<string, string> = {
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
  no: "nb", // Norwegian Bokmål — Azure has no generic "no" code.
};

function toAzureLocale(code: string): string {
  return AZURE_LOCALE_OVERRIDES[code] ?? code;
}

interface AzureTranslateResponseItem {
  translations: { text: string; to: string }[];
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

export class AzureTranslateProvider implements TranslationProvider {
  constructor(
    private readonly subscriptionKey: string,
    // Only required for regional (non-"global") Translator resources.
    private readonly region?: string,
  ) {}

  async translateBatch(
    texts: string[],
    targetLocale: string,
    sourceLocale: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const to = toAzureLocale(targetLocale);
    const from = toAzureLocale(sourceLocale);

    const results: string[] = [];
    for (const batch of chunkByCountAndChars(texts)) {
      const url = `${ENDPOINT}?api-version=${API_VERSION}&from=${from}&to=${to}`;
      const headers: Record<string, string> = {
        "Ocp-Apim-Subscription-Key": this.subscriptionKey,
        "Content-Type": "application/json",
      };
      if (this.region) headers["Ocp-Apim-Subscription-Region"] = this.region;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(batch.map((text) => ({ Text: text }))),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Azure Translator request failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as AzureTranslateResponseItem[];
      results.push(...data.map((item) => item.translations[0]?.text ?? ""));
    }
    return results;
  }
}
