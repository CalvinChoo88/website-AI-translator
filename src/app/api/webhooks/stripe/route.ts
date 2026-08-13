import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe/webhook";
import type { Plan } from "@/lib/plans";
import { planForPriceId } from "@/lib/stripe/prices";

/**
 * Register this URL in the Stripe dashboard (Developers > Webhooks) for
 * the checkout.session.completed, customer.subscription.updated, and
 * customer.subscription.deleted events. A dashboard Payment Link never
 * calls back into this app on its own — this webhook is the only thing
 * that turns "someone paid in Stripe" into an actual plan change (and
 * renewal-date tracking) on the shop's row.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !verifyStripeSignature(rawBody, sigHeader, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(event.data.object);
  } else if (event.type === "customer.subscription.updated") {
    await handleSubscriptionUpdated(event.data.object);
  } else if (event.type === "customer.subscription.deleted") {
    await handleSubscriptionDeleted(event.data.object);
  }
  // Other event types are ignored — Stripe still expects a 2xx so it
  // doesn't retry them.

  return NextResponse.json({ received: true });
}

/** Matches the Payment Link used against the three configured env vars — no Stripe API call needed. */
function planForPaymentLinkId(paymentLinkId: string | null): Plan | null {
  if (!paymentLinkId) return null;
  if (paymentLinkId === process.env.STRIPE_PAYMENT_LINK_ID_STARTER) return "starter";
  if (paymentLinkId === process.env.STRIPE_PAYMENT_LINK_ID_BUSINESS) return "business";
  if (paymentLinkId === process.env.STRIPE_PAYMENT_LINK_ID_ELITE) return "elite";
  return null;
}

async function handleCheckoutCompleted(session: Record<string, unknown>) {
  if (session.mode !== "subscription") return;

  // shop.id (a plain alphanumeric cuid), not shop.domain — Stripe's
  // client_reference_id silently drops values with characters outside
  // alphanumeric/dash/underscore, and every shop domain contains dots.
  const shopId = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  const paymentLinkId = typeof session.payment_link === "string" ? session.payment_link : null;
  const plan = planForPaymentLinkId(paymentLinkId);
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
  const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  // Session.created is a close-enough estimate of the subscription's
  // start_date to show right away — customer.subscription.updated
  // corrects it with the authoritative value once that fires.
  const createdUnix = typeof session.created === "number" ? session.created : null;

  if (!shopId || !plan) {
    console.error(
      "[webhooks/stripe] checkout.session.completed missing shop id or unrecognized payment link",
      { shopId, paymentLinkId },
    );
    return;
  }

  await db.shop.updateMany({
    where: { id: shopId },
    data: {
      plan,
      ...(stripeCustomerId && { stripeCustomerId }),
      ...(stripeSubscriptionId && { stripeSubscriptionId }),
      ...(createdUnix && { subscriptionStartDate: new Date(createdUnix * 1000) }),
      cancelAtPeriodEnd: false,
      // A fresh purchase supersedes any previously-scheduled switch.
      pendingPlan: null,
      stripeScheduleId: null,
    },
  });
}

/**
 * Fires on renewal, a failed charge, a scheduled cancellation, and
 * other subscription changes — this is where the renewal date and
 * status shown in /admin get kept current. Not fired for the very
 * first subscription of a new checkout in time to matter: stripeCustomerId
 * isn't set until checkout.session.completed processes, and this event
 * commonly arrives first — but it self-corrects by the next update
 * (certainly by the first renewal), and a brand-new subscriber doesn't
 * need an "expiring soon" reminder anyway.
 */
async function handleSubscriptionUpdated(subscription: Record<string, unknown>) {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!stripeCustomerId) return;

  const stripeSubscriptionId = typeof subscription.id === "string" ? subscription.id : null;
  const status = typeof subscription.status === "string" ? subscription.status : null;
  // Fixed subscription start — unlike current_period_start, this
  // doesn't move forward on renewal. Confirmed present at the top
  // level in a real payload.
  const startDateUnix = typeof subscription.start_date === "number" ? subscription.start_date : null;

  // current_period_end lives on each subscription item, not the
  // subscription itself, in this API version — confirmed from a real
  // webhook payload where subscription.current_period_end was absent
  // but subscription.items.data[0].current_period_end had it.
  const items = subscription.items as
    | { data?: Array<{ current_period_end?: number; price?: { id?: string } }> }
    | undefined;
  const periodEndUnix = items?.data?.[0]?.current_period_end;

  // Detects a Subscription Schedule's phase transition actually taking
  // effect (the price on the subscription changed to a different known
  // plan's price) as much as it detects anything else — this is what
  // applies a pending plan switch scheduled from /admin/subscription,
  // without any special-cased "is this a schedule transition" check.
  const activePriceId = items?.data?.[0]?.price?.id ?? null;
  const planFromPrice = planForPriceId(activePriceId ?? null);

  // Stripe represents a scheduled cancellation two ways: the classic
  // cancel_at_period_end boolean, or a specific cancel_at timestamp —
  // confirmed from a real payload where cancel_at_period_end was false
  // but cancel_at was set (to the same timestamp as the period end).
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true || Boolean(subscription.cancel_at);

  const shop = await db.shop.findFirst({ where: { stripeCustomerId } });
  if (!shop) return;

  // Only clear the pending-switch bookkeeping once the active price
  // actually matches what was pending — attaching a schedule fires its
  // own update event immediately, while phase 1 (the OLD price) is
  // still in effect, which would otherwise clear this prematurely,
  // before the switch has really happened.
  const pendingSwitchApplied = Boolean(planFromPrice) && planFromPrice === shop.pendingPlan;

  await db.shop.update({
    where: { id: shop.id },
    data: {
      ...(stripeSubscriptionId && { stripeSubscriptionId }),
      ...(status && { subscriptionStatus: status }),
      ...(startDateUnix && { subscriptionStartDate: new Date(startDateUnix * 1000) }),
      ...(typeof periodEndUnix === "number" && { currentPeriodEnd: new Date(periodEndUnix * 1000) }),
      cancelAtPeriodEnd,
      ...(planFromPrice && { plan: planFromPrice }),
      ...(pendingSwitchApplied && { pendingPlan: null, stripeScheduleId: null }),
    },
  });
}

/**
 * Fires once the period a cancelled subscription was already paid
 * through actually ends (Stripe finalizes cancel_at_period_end
 * automatically) — this, not the cancel button itself, is what
 * actually drops the shop to Free.
 */
async function handleSubscriptionDeleted(subscription: Record<string, unknown>) {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!stripeCustomerId) return;

  await db.shop.updateMany({
    where: { stripeCustomerId },
    data: {
      plan: "free",
      subscriptionStatus: null,
      subscriptionStartDate: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
      pendingPlan: null,
      stripeScheduleId: null,
    },
  });
}
