import crypto from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify an incoming request actually came from Stripe, without pulling
 * in the `stripe` SDK just for this. Scheme (https://docs.stripe.com/webhooks/signature):
 * the `Stripe-Signature` header is "t=<unix seconds>,v1=<hex hmac>[,v0=...]";
 * the signed payload is "<timestamp>.<raw body>", HMAC-SHA256 keyed by
 * the endpoint's signing secret. Must run over the *raw* body — a
 * parsed-then-reserialized JSON payload won't produce the same digest.
 */
export function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): boolean {
  if (!sigHeader) return false;

  const parts: Record<string, string> = {};
  for (const pair of sigHeader.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value) parts[key] = value;
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Rejects replayed requests — a captured valid signature can't be
  // resent indefinitely.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
