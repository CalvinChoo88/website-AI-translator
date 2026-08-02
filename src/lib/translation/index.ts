import type { TranslationProvider } from "./provider";
import { GoogleTranslateProvider } from "./google";
import { AzureTranslateProvider } from "./azure";
import { DeepLTranslateProvider, DEEPL_SUPPORTED_LOCALES } from "./deepl";

export function getTranslationProviderName(): string {
  return process.env.TRANSLATION_PROVIDER ?? "deepl";
}

function buildProvider(which: string): TranslationProvider {
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

export function getTranslationProvider(): TranslationProvider {
  return buildProvider(getTranslationProviderName());
}

/**
 * Optional second provider used only for locales the primary
 * (TRANSLATION_PROVIDER) doesn't cover. Only meaningful when the
 * primary is "deepl" (~35 languages) — set
 * TRANSLATION_FALLBACK_PROVIDER=azure or =google to automatically
 * fill in the rest of the ~130-language catalog with that provider,
 * rather than a merchant having to give up DeepL's quality entirely
 * just to reach a language it doesn't support.
 */
export function getFallbackProviderName(): string | null {
  return process.env.TRANSLATION_FALLBACK_PROVIDER || null;
}

function getFallbackProvider(): TranslationProvider | null {
  const which = getFallbackProviderName();
  return which ? buildProvider(which) : null;
}

/** Resolves which provider instance should actually handle a specific target locale. */
export function getTranslationProviderForLocale(locale: string): TranslationProvider {
  const primaryName = getTranslationProviderName();
  if (primaryName === "deepl" && !DEEPL_SUPPORTED_LOCALES.includes(locale)) {
    const fallback = getFallbackProvider();
    if (fallback) return fallback;
  }
  return buildProvider(primaryName);
}

/**
 * Locale codes the active provider setup can actually translate, or
 * `null` if it supports (effectively) the whole catalog. Used to keep
 * the admin's language picker — and settings validation — from
 * offering a language nothing configured can translate. A fallback
 * provider, once configured, covers the rest of the catalog DeepL
 * doesn't, so the restriction lifts entirely.
 */
export function getProviderSupportedLocales(): string[] | null {
  if (getTranslationProviderName() === "deepl" && !getFallbackProviderName()) {
    return DEEPL_SUPPORTED_LOCALES;
  }
  return null;
}

export type { TranslationProvider } from "./provider";
