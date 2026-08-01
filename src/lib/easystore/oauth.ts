import crypto from "node:crypto";
import { easystoreConfig, EASYSTORE_AUTHORIZE_HOST, adminApiUrl } from "./config";

/**
 * Step 1 entry point: EasyStore itself sends the merchant's browser to
 * this app's App URL (registered in the Partner Dashboard — our root
 * "/", see src/app/page.tsx + src/app/api/auth/launch/route.ts) with
 * `shop`, `host_url`, `timestamp`, `hmac` query params whenever a user
 * logged into the App Store opens/installs the app. After verifying
 * that request, if the shop isn't installed yet, redirect here to show
 * EasyStore's authorize prompt.
 * Confirmed against EasyStore's authentication docs.
 */
export function buildAuthorizeUrl(): string {
  const url = new URL("/oauth/authorize", EASYSTORE_AUTHORIZE_HOST);
  url.searchParams.set("app_id", easystoreConfig.clientId);
  url.searchParams.set("scope", easystoreConfig.scopes);
  url.searchParams.set("redirect_uri", easystoreConfig.redirectUri);
  return url.toString();
}

/**
 * Step 2: after the merchant approves, EasyStore redirects to
 * redirect_uri with `code`, `host_url`, `shop`, `hmac`, and `timestamp`.
 * The shop's domain is carried in `shop` (not `host_url`, which is a
 * generic EasyStore admin URL, e.g. https://admin.easystore.co).
 *
 * Verify the hmac before trusting any of it — it's signed with the
 * app's client secret over the other query params. Escaping rules
 * confirmed against EasyStore's authentication docs: within both keys
 * and values, "%" -> "%25" and "&" -> "%26"; additionally, within keys
 * only, "=" -> "%3D". Remaining params are then sorted lexicographically
 * and joined as key=value pairs with "&".
 */
function escapeHmacValue(value: string): string {
  return value.replace(/%/g, "%25").replace(/&/g, "%26");
}

function escapeHmacKey(key: string): string {
  return escapeHmacValue(key).replace(/=/g, "%3D");
}

export function verifyEasyStoreHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${escapeHmacKey(key)}=${escapeHmacValue(value)}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const digest = crypto
    .createHmac("sha256", easystoreConfig.clientSecret)
    .update(message)
    .digest("hex");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Confirmed security check from EasyStore's docs: shop must end with "easy.co". */
export function isValidEasyStoreShopDomain(shop: string): boolean {
  return shop.endsWith(".easy.co");
}

interface AccessTokenResponse {
  access_token: string;
  scope?: string;
}

/**
 * Step 3: exchange the authorization code for a permanent access
 * token. Confirmed endpoint: POST https://{shop}/api/3.0/oauth/access_token.json
 */
export async function exchangeCodeForToken(
  shopDomain: string,
  code: string,
): Promise<AccessTokenResponse> {
  const res = await fetch(adminApiUrl(shopDomain, "oauth/access_token.json"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: easystoreConfig.clientId,
      client_secret: easystoreConfig.clientSecret,
      code,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EasyStore token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as AccessTokenResponse;
  if (!data.access_token) {
    throw new Error("EasyStore token exchange response missing access_token");
  }
  return data;
}
