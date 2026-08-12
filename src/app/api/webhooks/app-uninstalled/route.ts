import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/easystore/webhooks";
import { db } from "@/lib/db";

/**
 * Receives the "app/uninstall" topic (confirmed via EasyStore's
 * Postman docs — note no trailing "-ed", unlike this route's own
 * name/path). There's no Partner Dashboard field for registering
 * this — it's subscribed via POST /api/3.0/webhooks.json, called from
 * api/auth/callback right after OAuth completes. The exact JSON body
 * shape EasyStore posts here on a real uninstall was still unconfirmed
 * as of this comment (their webhooks docs page 403'd during
 * development), so the `domain`/`shop` field lookup below is a
 * best-effort guess — the logging above will show the real shape from
 * the next actual uninstall event, if this fallback ever needs
 * adjusting.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("EasyStore-Hmac-SHA256");

  // Temporary, verbose on purpose: the real shape of this payload has
  // never been confirmed against an actual EasyStore webhook (their
  // docs 403'd during development), so every field/header is logged
  // here to nail it down from a real event instead of guessing again.
  console.log("[webhooks/app-uninstalled] headers", Object.fromEntries(req.headers.entries()));
  console.log("[webhooks/app-uninstalled] raw body", rawBody);

  if (!verifyWebhookHmac(rawBody, hmacHeader)) {
    console.error("[webhooks/app-uninstalled] HMAC verification failed", { hmacHeader });
    return NextResponse.json({ error: "Invalid HMAC — request rejected" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const domain =
    (payload.domain as string | undefined) ??
    (payload.shop as string | undefined) ??
    ((payload.store as { domain?: string } | undefined)?.domain);

  if (!domain) {
    console.error("[webhooks/app-uninstalled] could not resolve shop domain", { payload });
    return NextResponse.json({ error: "Could not resolve shop domain from payload" }, { status: 400 });
  }

  const updated = await db.shop.updateMany({
    where: { domain },
    data: { uninstalledAt: new Date() },
  });
  console.log("[webhooks/app-uninstalled] updated", { domain, matchedRows: updated.count });

  return NextResponse.json({ ok: true });
}
