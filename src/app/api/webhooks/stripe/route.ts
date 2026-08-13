import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe/webhook";
import type { Plan } from "@/lib/plans";

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

  if (!shopId || !plan) {
    console.error(
      "[webhooks/stripe] checkout.session.completed missing shop id or unrecognized payment link",
      { shopId, paymentLinkId },
    );
    return;
  }

  await db.shop.updateMany({
    where: { id: shopId },
    data: { plan, ...(stripeCustomerId && { stripeCustomerId }) },
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

  const status = typeof subscription.status === "string" ? subscription.status : null;
  const periodEndUnix =
    typeof subscription.current_period_end === "number" ? subscription.current_period_end : null;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;

  await db.shop.updateMany({
    where: { stripeCustomerId },
    data: {
      ...(status && { subscriptionStatus: status }),
      ...(periodEndUnix && { currentPeriodEnd: new Date(periodEndUnix * 1000) }),
      cancelAtPeriodEnd,
    },
  });
}

/** Subscription fully ended (canceled, or payment ultimately failed) — drop back to free. */
async function handleSubscriptionDeleted(subscription: Record<string, unknown>) {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!stripeCustomerId) return;

  await db.shop.updateMany({
    where: { stripeCustomerId },
    data: {
      plan: "free",
      subscriptionStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });
}
