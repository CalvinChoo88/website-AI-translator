import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/easystore/webhooks";
import { db } from "@/lib/db";

/**
 * Receives the "app/uninstall" topic (confirmed via EasyStore's
 * Postman docs — note no trailing "-ed", unlike this route's own
 * name/path). There's no Partner Dashboard field for registering
 * this — it's subscribed via POST /api/3.0/webhooks.json, called from
 * api/auth/callback right after OAuth completes.
 *
 * Confirmed from a real delivery: the shop domain arrives via the
 * `Easystore-Shop-Domain` header, NOT the JSON body — the body is
 * tiny (~16 bytes) and doesn't carry it. The body-field fallback below
 * is kept only in case that ever changes.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("EasyStore-Hmac-SHA256");

  if (!verifyWebhookHmac(rawBody, hmacHeader)) {
    console.error("[webhooks/app-uninstalled] HMAC verification failed", { hmacHeader });
    return NextResponse.json({ error: "Invalid HMAC — request rejected" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // Non-fatal — the domain normally comes from the header anyway.
  }

  const domain =
    req.headers.get("Easystore-Shop-Domain") ??
    (payload.domain as string | undefined) ??
    (payload.shop as string | undefined) ??
    ((payload.store as { domain?: string } | undefined)?.domain);

  if (!domain) {
    console.error("[webhooks/app-uninstalled] could not resolve shop domain", {
      headers: Object.fromEntries(req.headers.entries()),
      payload,
    });
    return NextResponse.json({ error: "Could not resolve shop domain from payload" }, { status: 400 });
  }

  const updated = await db.shop.updateMany({
    where: { domain },
    data: { uninstalledAt: new Date() },
  });
  console.log("[webhooks/app-uninstalled] updated", { domain, matchedRows: updated.count });

  return NextResponse.json({ ok: true });
}
