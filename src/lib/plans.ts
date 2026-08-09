export type Plan = "free" | "starter" | "business" | "elite";

const PLAN_LOCALE_LIMITS: Record<Plan, number | null> = {
  free: 1,
  starter: 3,
  business: 8,
  elite: null, // null = unlimited
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  starter: "Starter",
  business: "Business",
  elite: "Elite",
};

function isPlan(value: string): value is Plan {
  return value in PLAN_LOCALE_LIMITS;
}

/** Falls back to the free-tier limit for an unrecognized/legacy plan value. */
export function localeLimitForPlan(plan: string): number | null {
  return isPlan(plan) ? PLAN_LOCALE_LIMITS[plan] : PLAN_LOCALE_LIMITS.free;
}

export function planLabel(plan: string): string {
  return isPlan(plan) ? PLAN_LABELS[plan] : PLAN_LABELS.free;
}
