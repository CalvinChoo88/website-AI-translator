import { stripeConfig } from "./config";

/**
 * Turns off auto-renewal without ending access early — the merchant
 * keeps their current plan through the already-paid period, and Stripe
 * finalizes the actual cancellation on its own at that period's end
 * (firing customer.subscription.deleted, which is what actually drops
 * the shop to Free — see webhooks/stripe/route.ts). No SDK dependency,
 * matching this codebase's style elsewhere.
 * https://docs.stripe.com/api/subscriptions/update
 */
export async function scheduleStripeSubscriptionCancellation(subscriptionId: string): Promise<void> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeConfig.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "cancel_at_period_end=true",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Stripe schedule-cancel subscription failed (${res.status}): ${body}`);
  }
}

/**
 * Un-cancels a subscription that's still in its cancel_at_period_end
 * grace period (hasn't actually ended yet) — same subscription ID,
 * same billing dates, no new charge. This is how a merchant gets back
 * onto the exact plan they were just cancelling, instead of a Payment
 * Link creating a second, separate subscription with a disconnected
 * start date.
 */
export async function resumeStripeSubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeConfig.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "cancel_at_period_end=false",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Stripe resume subscription failed (${res.status}): ${body}`);
  }
}
