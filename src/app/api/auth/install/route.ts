import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/easystore/oauth";

/**
 * Entry point for "Install app" links (from the Partner Dashboard
 * listing, or a merchant's own admin > Apps page). Unlike some
 * platforms, EasyStore's authorize endpoint is not shop-scoped in the
 * URL (no ?shop= it needs from us) — it's launched from within the
 * merchant's own logged-in admin, which is what associates the OAuth
 * grant with their store. The shop domain comes back to us on the
 * callback via `host_url`.
 */
export async function GET() {
  return NextResponse.redirect(buildAuthorizeUrl());
}
