import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

/** Resolve the merchant shop tied to the admin session cookie, if any. */
export async function getSessionShop() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;

  const shop = await db.shop.findUnique({ where: { id: session.shopId } });
  if (!shop || shop.uninstalledAt) return null;
  return shop;
}
