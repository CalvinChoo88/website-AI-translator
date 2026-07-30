import type { TranslationProvider } from "./provider";

// Google Cloud Translation v2 (REST, API-key auth) — simplest integration
// path and broadest language coverage (~130 languages), matching the
// "translate to most languages in the world" requirement.
// https://cloud.google.com/translate/docs/reference/rest/v2/translate
const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

// Keep well under Google's per-request q[] / payload limits.
const BATCH_SIZE = 100;

interface GoogleTranslateResponse {
  data: { translations: { translatedText: string }[] };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class GoogleTranslateProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translateBatch(
    texts: string[],
    targetLocale: string,
    sourceLocale: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const results: string[] = [];
    for (const batch of chunk(texts, BATCH_SIZE)) {
      const params = new URLSearchParams({
        key: this.apiKey,
        target: targetLocale,
        source: sourceLocale,
        format: "text",
      });
      for (const text of batch) params.append("q", text);

      const res = await fetch(`${ENDPOINT}?${params.toString()}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Google Translate request failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as GoogleTranslateResponse;
      results.push(...data.data.translations.map((t) => t.translatedText));
    }
    return results;
  }
}
