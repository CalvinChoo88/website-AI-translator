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
