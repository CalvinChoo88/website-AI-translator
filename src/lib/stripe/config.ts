function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const stripeConfig = {
  // Only needed for calls that mutate Stripe directly (e.g. canceling a
  // subscription from /admin/subscription) — the webhook itself only
  // ever needs STRIPE_WEBHOOK_SECRET, not this.
  get secretKey() {
    return requireEnv("STRIPE_SECRET_KEY");
  },
};
