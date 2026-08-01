import { NextRequest, NextResponse } from "next/server";
import { verifyEasyStoreHmac, isValidEasyStoreShopDomain, buildAuthorizeUrl } from "@/lib/easystore/oauth";
import { easystoreConfig } from "@/lib/easystore/config";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

/**
 * The real EasyStore entry point. Confirmed from EasyStore's docs:
 * whenever a user logged into the App Store opens or installs this
 * app, EasyStore issues a GET request to the App URL registered in
 * the Partner Dashboard (our root "/") carrying `shop`, `host_url`,
 * `timestamp`, and `hmac` query params. Our root page forwards that
 * request here (see src/app/page.tsx) since Server Components can't
 * set cookies directly.
 *
 * - Unknown/never-installed shop -> send them into the OAuth authorize
 *   prompt (buildAuthorizeUrl), same as clicking "Install".
 * - Already-installed shop -> this is just the merchant reopening the
 *   app from their admin; sign them into /admin directly rather than
 *   re-running the OAuth dance every time.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  if (!verifyEasyStoreHmac(params)) {
    return NextResponse.json({ error: "Invalid HMAC — request rejected" }, { status: 401 });
  }

  const shopDomain = params.get("shop");
  if (!shopDomain || !isValidEasyStoreShopDomain(shopDomain)) {
    return NextResponse.json({ error: "Missing or invalid shop parameter" }, { status: 400 });
  }

  const shop = await db.shop.findUnique({ where: { domain: shopDomain } });

  if (shop && !shop.uninstalledAt) {
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

  return NextResponse.redirect(buildAuthorizeUrl());
}
