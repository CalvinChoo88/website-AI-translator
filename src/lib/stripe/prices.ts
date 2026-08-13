import type { Plan } from "@/lib/plans";

/**
 * Stripe Price IDs (price_...), one per paid tier — distinct from the
 * Payment Link IDs (plink_...). Needed for Subscription Schedules,
 * which reference prices directly rather than a Payment Link.
 */
export function priceIdForPlan(plan: Plan): string | null {
  if (plan === "starter") return process.env.STRIPE_PRICE_ID_STARTER ?? null;
  if (plan === "business") return process.env.STRIPE_PRICE_ID_BUSINESS ?? null;
  if (plan === "elite") return process.env.STRIPE_PRICE_ID_ELITE ?? null;
  return null;
}

export function planForPriceId(priceId: string | null): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) return "business";
  if (priceId === process.env.STRIPE_PRICE_ID_ELITE) return "elite";
  return null;
}
