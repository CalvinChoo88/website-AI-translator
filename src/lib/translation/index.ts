import type { TranslationProvider } from "./provider";
import { GoogleTranslateProvider } from "./google";
import { AzureTranslateProvider } from "./azure";
import { DeepLTranslateProvider, DEEPL_SUPPORTED_LOCALES } from "./deepl";

export function getTranslationProviderName(): string {
  return process.env.TRANSLATION_PROVIDER ?? "deepl";
}

export function getTranslationProvider(): TranslationProvider {
  const which = getTranslationProviderName();

  switch (which) {
    case "deepl": {
      const apiKey = process.env.DEEPL_API_KEY;
      if (!apiKey) throw new Error("Missing required env var: DEEPL_API_KEY");
      return new DeepLTranslateProvider(apiKey);
    }
    case "azure": {
      const apiKey = process.env.AZURE_TRANSLATOR_KEY;
      if (!apiKey) throw new Error("Missing required env var: AZURE_TRANSLATOR_KEY");
      return new AzureTranslateProvider(apiKey, process.env.AZURE_TRANSLATOR_REGION);
    }
    case "google": {
      const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
      if (!apiKey) throw new Error("Missing required env var: GOOGLE_TRANSLATE_API_KEY");
      return new GoogleTranslateProvider(apiKey);
    }
    default:
      throw new Error(`Unknown TRANSLATION_PROVIDER: ${which}`);
  }
}

/**
 * Locale codes the active provider can actually translate, or `null`
 * if the provider supports (effectively) the whole catalog. Used to
 * keep the admin's language picker — and settings validation — from
 * offering a language the configured provider will just error on.
 */
export function getProviderSupportedLocales(): string[] | null {
  return getTranslationProviderName() === "deepl" ? DEEPL_SUPPORTED_LOCALES : null;
}

export type { TranslationProvider } from "./provider";
