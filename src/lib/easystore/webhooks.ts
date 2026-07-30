import crypto from "node:crypto";
import { easystoreConfig } from "./config";

/**
 * Verify an incoming webhook actually came from EasyStore. Confirmed
 * scheme (https://developers.easystore.co/docs/api/webhooks): the
 * `EasyStore-Hmac-SHA256` header holds hex(HMAC-SHA256(rawBody, clientSecret)).
 *
 * Must be computed over the *raw* request body — parse/re-stringify
 * JSON and the digest will no longer match.
 */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", easystoreConfig.clientSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
