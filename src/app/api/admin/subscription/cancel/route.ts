import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionShop } from "@/lib/adminAuth";
import { cancelStripeSubscription } from "@/lib/stripe/api";
import { isCancellationReason } from "@/lib/cancellationReasons";

interface CancelBody {
  reason?: string;
}

/**
 * Cancels immediately (not at period end) — the merchant drops back to
 * Free as soon as this succeeds. Already-paid time for the current
 * period is not refunded; the client is responsible for surfacing that
 * before calling this.
 */
export async function POST(req: NextRequest) {
  const shop = await getSessionShop();
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json()) as CancelBody;
  if (!body.reason || !isCancellationReason(body.reason)) {
    return NextResponse.json({ error: "A valid cancellation reason is required" }, { status: 400 });
  }

  if (shop.plan === "free" || !shop.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription to cancel" }, { status: 400 });
  }

  try {
    await cancelStripeSubscription(shop.stripeSubscriptionId);
  } catch (err) {
    console.error("[api/admin/subscription/cancel] Stripe cancel failed", err);
    return NextResponse.json({ error: "Failed to cancel subscription with Stripe" }, { status: 502 });
  }

  await db.$transaction([
    db.cancellationFeedback.create({
      data: { shopId: shop.id, plan: shop.plan, reason: body.reason },
    }),
    db.shop.update({
      where: { id: shop.id },
      data: {
        plan: "free",
        subscriptionStatus: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: null,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
