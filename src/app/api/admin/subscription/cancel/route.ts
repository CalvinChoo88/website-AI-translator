import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionShop } from "@/lib/adminAuth";
import { scheduleStripeSubscriptionCancellation } from "@/lib/stripe/api";
import { isCancellationReason } from "@/lib/cancellationReasons";

interface CancelBody {
  reason?: string;
}

/**
 * Turns off auto-renewal — the shop keeps its current plan through the
 * already-paid period. It's the later customer.subscription.deleted
 * webhook (fired by Stripe once that period actually ends) that drops
 * the shop to Free, not this route: if the merchant upgrades again
 * before then, this cancellation simply never takes effect.
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
    await scheduleStripeSubscriptionCancellation(shop.stripeSubscriptionId);
  } catch (err) {
    console.error("[api/admin/subscription/cancel] Stripe schedule-cancel failed", err);
    return NextResponse.json({ error: "Failed to cancel subscription with Stripe" }, { status: 502 });
  }

  await db.$transaction([
    db.cancellationFeedback.create({
      data: { shopId: shop.id, plan: shop.plan, reason: body.reason },
    }),
    // Optimistic — the next customer.subscription.updated will confirm
    // this same value, but setting it here means /admin/subscription
    // reflects it immediately instead of waiting on that webhook.
    db.shop.update({
      where: { id: shop.id },
      data: { cancelAtPeriodEnd: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
