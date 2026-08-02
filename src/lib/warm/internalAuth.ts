import crypto from "node:crypto";

// Guards /api/internal/* routes, which are only ever called by this
// app itself (self-chaining background crawl batches) — not part of
// the widget-facing or merchant-facing API surface.
export const INTERNAL_SECRET_HEADER = "x-internal-job-secret";

function requireSecret(): string {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) throw new Error("Missing required env var: INTERNAL_JOB_SECRET");
  return secret;
}

export function verifyInternalSecret(headerValue: string | null): boolean {
  if (!headerValue) return false;
  const expected = requireSecret();
  const a = Buffer.from(headerValue, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function internalSecretHeaderValue(): string {
  return requireSecret();
}
