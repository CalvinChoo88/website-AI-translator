import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { detectCountry, defaultLocaleForCountry } from "@/lib/geo";
import { LANGUAGES, getLanguageName } from "@/lib/languages";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Called by the storefront widget on first paint:
 * GET /api/widget/config?shop=mystore.easystore.co
 *
 * Returns the merchant's enabled languages plus a geo-based
 * suggestion. The widget only uses the suggestion when the shopper
 * has no saved preference yet, and always lets them override it.
 */
export async function GET(req: NextRequest) {
  const shopDomain = req.nextUrl.searchParams.get("shop");
  if (!shopDomain) {
    return corsJson({ error: "Missing shop parameter" }, { status: 400 });
  }

  const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop || shop.uninstalledAt) {
    return corsJson({ error: "Unknown or uninstalled shop" }, { status: 404 });
  }

  const enabledCodes: string[] = JSON.parse(shop.enabledLocales || "[]");
  const enabledLocales = enabledCodes
    .map((code) => ({ code, name: getLanguageName(code) ?? code }))
    .filter((l) => LANGUAGES.some((lang) => lang.code === l.code));

  let suggestedLocale = shop.sourceLocale;
  if (shop.autoDetect) {
    const country = await detectCountry(req.headers);
    const suggestion = defaultLocaleForCountry(country, shop.sourceLocale);
    if (enabledCodes.includes(suggestion)) suggestedLocale = suggestion;
  }

  return corsJson({
    sourceLocale: shop.sourceLocale,
    enabledLocales,
    autoDetect: shop.autoDetect,
    suggestedLocale,
  });
}
