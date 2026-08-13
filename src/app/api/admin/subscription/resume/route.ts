import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionShop } from "@/lib/adminAuth";
import { resumeStripeSubscription } from "@/lib/stripe/api";

/** Un-cancels a subscription still in its cancel_at_period_end grace period. */
export async function POST() {
  const shop = await getSessionShop();
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!shop.cancelAtPeriodEnd || !shop.stripeSubscriptionId) {
    return NextResponse.json({ error: "No cancellation in progress to resume" }, { status: 400 });
  }

  try {
    await resumeStripeSubscription(shop.stripeSubscriptionId);
  } catch (err) {
    console.error("[api/admin/subscription/resume] Stripe resume failed", err);
    return NextResponse.json({ error: "Failed to resume subscription with Stripe" }, { status: 502 });
  }

  await db.shop.update({
    where: { id: shop.id },
    data: { cancelAtPeriodEnd: false },
  });

  return NextResponse.json({ ok: true });
}
