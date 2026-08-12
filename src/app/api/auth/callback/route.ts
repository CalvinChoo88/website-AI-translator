import { NextRequest, NextResponse } from "next/server";
import { verifyEasyStoreHmac, isValidEasyStoreShopDomain, exchangeCodeForToken } from "@/lib/easystore/oauth";
import { EasyStoreAdminClient } from "@/lib/easystore/client";
import { easystoreConfig } from "@/lib/easystore/config";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  if (!verifyEasyStoreHmac(params)) {
    return NextResponse.json({ error: "Invalid HMAC — request rejected" }, { status: 401 });
  }

  const code = params.get("code");
  const shopDomain = params.get("shop");
  if (!code || !shopDomain || !isValidEasyStoreShopDomain(shopDomain)) {
    return NextResponse.json({ error: "Missing code or invalid shop" }, { status: 400 });
  }

  const { access_token, scope } = await exchangeCodeForToken(shopDomain, code);
  const client = new EasyStoreAdminClient(shopDomain, access_token);

  let sourceLocale = "en";
  try {
    const { store } = await client.getStore();
    if (store.language) sourceLocale = store.language;
  } catch {
    // Non-fatal — fall back to "en" and let the merchant correct it in settings.
  }

  try {
    // Re-subscribed on every install/reinstall, not just the first —
    // cheap idempotency isn't available without a list-webhooks call
    // to dedupe against, and a stray duplicate subscription is harmless
    // (our receiving endpoint is idempotent: it just sets a timestamp).
    // Topic is "app/uninstall", NOT "app/uninstalled" — this webhook
    // was never actually registered before, silently, because nothing
    // called this API at all.
    await client.createWebhook("app/uninstall", `${easystoreConfig.appUrl}/api/webhooks/app-uninstalled`);
  } catch (err) {
    // Non-fatal — install still succeeds, but log loudly since a
    // failure here means uninstalls won't be detected for this shop.
    console.error("[auth/callback] failed to register app/uninstall webhook", err);
  }

  const shop = await db.shop.upsert({
    where: { domain: shopDomain },
    create: {
      domain: shopDomain,
      accessToken: access_token,
      scope: scope ?? easystoreConfig.scopes,
      sourceLocale,
    },
    update: {
      accessToken: access_token,
      scope: scope ?? easystoreConfig.scopes,
      uninstalledAt: null,
    },
  });

  const token = createSessionToken(shop.id, shop.domain);
  const res = NextResponse.redirect(`${easystoreConfig.appUrl}/admin`);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    // "none" (not "lax") because EasyStore can load /admin inside an
    // iframe on admin.easystore.co when "Embedded in EasyStore Control
    // Panel" is enabled — that's a cross-site request from the
    // browser's point of view, and "lax" cookies are withheld there.
    // Requires secure:true, which is already set.
    sameSite: "none",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
