import { NextRequest, NextResponse } from "next/server";
import { verifyCallbackHmac, exchangeCodeForToken } from "@/lib/easystore/oauth";
import { EasyStoreAdminClient } from "@/lib/easystore/client";
import { easystoreConfig } from "@/lib/easystore/config";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  if (!verifyCallbackHmac(params)) {
    return NextResponse.json({ error: "Invalid HMAC — request rejected" }, { status: 401 });
  }

  const code = params.get("code");
  const shopDomain = params.get("host_url");
  if (!code || !shopDomain) {
    return NextResponse.json({ error: "Missing code or host_url" }, { status: 400 });
  }

  const { access_token, scope } = await exchangeCodeForToken(shopDomain, code);

  let sourceLocale = "en";
  try {
    const client = new EasyStoreAdminClient(shopDomain, access_token);
    const { store } = await client.getStore();
    if (store.language) sourceLocale = store.language;
  } catch {
    // Non-fatal — fall back to "en" and let the merchant correct it in settings.
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
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
