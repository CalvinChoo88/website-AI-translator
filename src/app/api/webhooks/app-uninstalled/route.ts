import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/easystore/webhooks";
import { db } from "@/lib/db";

/**
 * Register this URL in the Partner Dashboard for the "app/uninstalled"
 * topic. The exact header EasyStore uses to carry the shop domain
 * wasn't reachable in their docs during development (403'd), so this
 * reads the domain out of the JSON body instead, which is the more
 * platform-agnostic path — confirm the payload shape against
 * https://developers.easystore.co/docs/api/webhooks and adjust the
 * `domain`/`shop` field lookup below if it differs.
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
