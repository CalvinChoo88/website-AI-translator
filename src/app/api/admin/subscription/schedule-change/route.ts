import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionShop } from "@/lib/adminAuth";
import { scheduleStripePlanChange } from "@/lib/stripe/api";
import { priceIdForPlan } from "@/lib/stripe/prices";
import { isPlan, type Plan } from "@/lib/plans";

interface ScheduleChangeBody {
  plan?: string;
}

/**
 * Schedules a switch to a different paid tier, taking effect only once
 * the current (already-paid) period ends — for a merchant who's mid-
 * cancellation and wants a different plan instead of lapsing to Free.
 * Only valid in that specific state: see scheduleStripePlanChange for
 * why (it needs the subscription to already have a defined end date to
 * anchor the switch to).
 */
export async function POST(req: NextRequest) {
  const shop = await getSessionShop();
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json()) as ScheduleChangeBody;
  const newPlan: Plan | undefined = body.plan && isPlan(body.plan) ? body.plan : undefined;
  if (!newPlan || newPlan === "free") {
    return NextResponse.json({ error: "A valid paid plan is required" }, { status: 400 });
  }
  if (newPlan === shop.plan) {
    return NextResponse.json({ error: "Already on this plan — use Resume instead" }, { status: 400 });
  }

  if (!shop.cancelAtPeriodEnd || !shop.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "Scheduling a plan switch is only available while a cancellation is pending" },
      { status: 400 },
    );
  }

  const newPriceId = priceIdForPlan(newPlan);
  if (!newPriceId) {
    return NextResponse.json({ error: `${newPlan} isn't configured for plan switching` }, { status: 400 });
  }

  let scheduleId: string;
  try {
    scheduleId = await scheduleStripePlanChange(shop.stripeSubscriptionId, newPriceId);
  } catch (err) {
    console.error("[api/admin/subscription/schedule-change] Stripe schedule failed", err);
    return NextResponse.json({ error: "Failed to schedule the plan change with Stripe" }, { status: 502 });
  }

  await db.shop.update({
    where: { id: shop.id },
    data: { pendingPlan: newPlan, stripeScheduleId: scheduleId },
  });

  return NextResponse.json({ ok: true });
}
