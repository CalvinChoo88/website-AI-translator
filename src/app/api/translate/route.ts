import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { translateBatchCached } from "@/lib/translation/cache";
import { getProviderSupportedLocales } from "@/lib/translation";

export function OPTIONS() {
  return corsPreflight();
}

const MAX_TEXTS_PER_REQUEST = 200;
const MAX_TEXT_LENGTH = 2000;

interface TranslateRequestBody {
  shop?: string;
  locale?: string;
  texts?: string[];
}

/**
 * Called by the storefront widget once a target locale is chosen:
 * batches every unique visible text node on the page and asks for
 * translations, which are cached per shop+locale so the same string
 * is only sent to the provider once.
 *
 * NOTE: this is a public, unauthenticated endpoint by necessity (it's
 * called from anonymous shopper browsers). It's scoped to shops that
 * installed the app and to their enabled locales, and request size is
 * capped, but production use should add IP/shop-based rate limiting
 * to bound translation-provider spend against abuse.
 */
export async function POST(req: NextRequest) {
  let body: TranslateRequestBody;
  try {
    body = (await req.json()) as TranslateRequestBody;
  } catch {
    return corsJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { shop: shopDomain, locale, texts } = body;
  if (!shopDomain || !locale || !Array.isArray(texts)) {
    return corsJson({ error: "Missing shop, locale, or texts[]" }, { status: 400 });
  }
  if (texts.length === 0) {
    return corsJson({ translations: [] });
  }
  if (texts.length > MAX_TEXTS_PER_REQUEST) {
    return corsJson({ error: `Too many texts (max ${MAX_TEXTS_PER_REQUEST})` }, { status: 400 });
  }
  if (texts.some((t) => typeof t !== "string" || t.length > MAX_TEXT_LENGTH)) {
    return corsJson({ error: `Each text must be a string up to ${MAX_TEXT_LENGTH} chars` }, { status: 400 });
  }

  const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop || shop.uninstalledAt) {
    return corsJson({ error: "Unknown or uninstalled shop" }, { status: 404 });
  }

  const enabledCodes: string[] = JSON.parse(shop.enabledLocales || "[]");
  const providerSupported = getProviderSupportedLocales();
  if (!enabledCodes.includes(locale) || (providerSupported && !providerSupported.includes(locale))) {
    return corsJson({ error: "Locale not enabled for this shop" }, { status: 400 });
  }

  // Deliberately does NOT trigger auto-warm here. This request means
  // a real shopper needs a live translation right now — starting a
  // background crawl at this exact moment would compete with them for
  // the same DeepL concurrency and DB connection pool. Auto-warm is
  // instead triggered from /api/widget/warm-signal, only when a
  // shopper is on the original language (see that route for why).

  try {
    const translations = await translateBatchCached(shop.id, shop.sourceLocale, locale, texts);
    return corsJson({ translations });
  } catch (err) {
    // Without this catch, an uncaught throw here falls through to
    // Next's default error response, which carries none of corsJson's
    // CORS headers — the browser then reports it as a CORS failure,
    // masking whatever actually went wrong server-side.
    console.error("[api/translate]", err);
    return corsJson({ error: "Translation failed" }, { status: 500 });
  }
}
