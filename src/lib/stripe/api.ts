import { stripeConfig } from "./config";

/**
 * Cancels a subscription immediately (not at period end) via Stripe's
 * REST API directly — no SDK dependency, matching this codebase's
 * style elsewhere (DeepL/Azure/Google providers, EasyStoreAdminClient).
 * https://docs.stripe.com/api/subscriptions/cancel
 */
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${stripeConfig.secretKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Stripe cancel subscription failed (${res.status}): ${body}`);
  }
}
