import crypto from "node:crypto";
import { easystoreConfig, EASYSTORE_AUTHORIZE_HOST, adminApiUrl } from "./config";

/**
 * Step 1: send the merchant to EasyStore to approve the app.
 * Endpoint/params confirmed against EasyStore's authentication docs:
 * https://admin.easystore.co/oauth/authorize?app_id=...&scope=...&redirect_uri=...
 */
export function buildAuthorizeUrl(): string {
  const url = new URL("/oauth/authorize", EASYSTORE_AUTHORIZE_HOST);
  url.searchParams.set("app_id", easystoreConfig.clientId);
  url.searchParams.set("scope", easystoreConfig.scopes);
  url.searchParams.set("redirect_uri", easystoreConfig.redirectUri);
  return url.toString();
}

/**
 * Step 2: EasyStore redirects back to redirect_uri with `code`,
 * `host_url` (the shop domain), `hmac`, and `timestamp`. Verify the
 * hmac before trusting any of it — it's signed with the app's client
 * secret over the other query params.
 *
 * NOTE: EasyStore's exact param-serialization rule for this HMAC
 * wasn't reachable from their docs during development (403'd on
 * direct fetch). This follows the conventional OAuth-callback HMAC
 * scheme (sort remaining params, join as key=value with '&', HMAC-SHA256
 * hex with the client secret) — confirm against
 * https://developers.easystore.co/docs/api/authentication before
 * relying on it in production.
 */
export function verifyCallbackHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
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
