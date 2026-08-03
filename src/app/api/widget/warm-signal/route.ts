import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { triggerNextWarmIfIdle } from "@/lib/warm/run";

export function OPTIONS() {
  return corsPreflight();
}

interface WarmSignalBody {
  shop?: string;
  pageUrl?: string;
}

/**
 * Called by the widget only when a shopper is viewing the storefront
 * in its original language (see public/widget/translator.js) — i.e.
 * this specific visitor isn't generating any live /api/translate
 * demand. That's the deliberate trigger point for auto-warm: kicking
 * off (or progressing) the background crawl here, rather than
 * alongside a real shopper's own translation request, means it never
 * competes with someone who's actually waiting on a translation right
 * now. A no-op most of the time (nothing configured, everything
 * already warmed, or a crawl already running) — cheap to call on
 * every original-language pageview.
 */
export async function POST(req: NextRequest) {
  let body: WarmSignalBody;
  try {
    body = (await req.json()) as WarmSignalBody;
  } catch {
    return corsJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { shop: shopDomain, pageUrl } = body;
  if (!shopDomain || !pageUrl) {
    return corsJson({ error: "Missing shop or pageUrl" }, { status: 400 });
  }

  try {
    const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop || shop.uninstalledAt || !shop.autoWarmOnFirstUse) {
      return corsJson({ ok: true });
    }

    const enabledLocales: string[] = JSON.parse(shop.enabledLocales || "[]");
    await triggerNextWarmIfIdle(shop.id, enabledLocales, pageUrl);
    return corsJson({ ok: true });
  } catch (err) {
    console.error("[api/widget/warm-signal]", err);
    return corsJson({ error: "Failed" }, { status: 500 });
  }
}
