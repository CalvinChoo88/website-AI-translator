import { COUNTRY_TO_LOCALE } from "@/lib/languages";

/**
 * Country-of-visitor detection, used only to pre-select a language
 * suggestion — never to identify or track the shopper. This does NOT
 * attempt to unmask a VPN/proxy's real client IP: that isn't something
 * a website can legitimately do, and the closest techniques (WebRTC
 * leak probing, browser exploits) are deanonymization tools this app
 * won't ship. When a visitor is on a VPN, we detect the VPN exit
 * node's country like any other site would, and the shopper can
 * always override the suggestion via the dropdown.
 */

export function getClientIp(headers: Headers): string | null {
  // Vercel/most proxies set this to "client, proxy1, proxy2, ...".
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return null;
}

/**
 * Resolve the visitor's country as an ISO 3166-1 alpha-2 code.
 * Prefers platform-provided geolocation (e.g. Vercel's edge network,
 * which sets `x-vercel-ip-country` without any extra network call or
 * third-party dependency); falls back to a geo-IP lookup API for
 * other hosts.
 */
export async function detectCountry(headers: Headers): Promise<string | null> {
  const vercelCountry = headers.get("x-vercel-ip-country");
  if (vercelCountry) return vercelCountry.toUpperCase();

  const ip = getClientIp(headers);
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;

  const base = process.env.GEOIP_FALLBACK_API_URL || "https://ipapi.co";
  try {
    const res = await fetch(`${base}/${ip}/json/`, {
      // Keep this fast — it's blocking a first-visit widget config call.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string; error?: boolean };
    if (data.error || !data.country_code) return null;
    return data.country_code.toUpperCase();
  } catch {
    return null;
  }
}

export function defaultLocaleForCountry(
  country: string | null,
  fallback: string,
): string {
  if (!country) return fallback;
  return COUNTRY_TO_LOCALE[country] ?? fallback;
}
