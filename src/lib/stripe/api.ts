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

interface StripeSchedulePhase {
  start_date: number;
  end_date: number | null;
  items: { price: string }[];
}

interface StripeSubscriptionSchedule {
  id: string;
  phases: StripeSchedulePhase[];
}

async function stripePost<T>(path: string, body: URLSearchParams): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeConfig.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stripe request failed (${res.status}) for ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * Schedules a plan change to take effect only once the subscription's
 * current (already-paid) period ends — the merchant keeps their
 * existing plan's access until then, and Stripe automatically switches
 * the price and bills accordingly on that date. Only meaningful for a
 * subscription that's already mid-cancellation (cancel_at set): the
 * schedule Stripe creates "from" the subscription copies its current
 * phase, including that same end date, which is what phase 2 is
 * anchored to below — a subscription with no defined end wouldn't have
 * one to anchor to.
 * https://docs.stripe.com/api/subscription_schedules
 */
export async function scheduleStripePlanChange(
  subscriptionId: string,
  newPriceId: string,
): Promise<string> {
  const created = await stripePost<StripeSubscriptionSchedule>(
    "subscription_schedules",
    new URLSearchParams({ from_subscription: subscriptionId }),
  );

  const currentPhase = created.phases[0];
  const currentPrice = currentPhase?.items[0]?.price;
  if (!currentPhase || !currentPhase.end_date || !currentPrice) {
    throw new Error(
      `Subscription ${subscriptionId} has no defined current-phase end date to anchor a plan change to — is it actually mid-cancellation?`,
    );
  }

  const body = new URLSearchParams();
  body.set("phases[0][items][0][price]", currentPrice);
  body.set("phases[0][start_date]", String(currentPhase.start_date));
  body.set("phases[0][end_date]", String(currentPhase.end_date));
  body.set("phases[1][items][0][price]", newPriceId);
  // No end_date/iterations on phase 2 — an open-ended final phase that
  // Stripe auto-renews indefinitely at newPriceId's own interval.

  await stripePost(`subscription_schedules/${created.id}`, body);
  return created.id;
}
