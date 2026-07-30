import type { TranslationProvider } from "./provider";
import { GoogleTranslateProvider } from "./google";

export function getTranslationProvider(): TranslationProvider {
  const which = process.env.TRANSLATION_PROVIDER ?? "google";

  switch (which) {
    case "google": {
      const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
      if (!apiKey) throw new Error("Missing required env var: GOOGLE_TRANSLATE_API_KEY");
      return new GoogleTranslateProvider(apiKey);
    }
    default:
      throw new Error(`Unknown TRANSLATION_PROVIDER: ${which}`);
  }
}

export type { TranslationProvider } from "./provider";
