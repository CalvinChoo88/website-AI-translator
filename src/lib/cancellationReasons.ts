export const CANCELLATION_REASONS = [
  "Too expensive",
  "Missing features I need",
  "Switching to a different translation solution",
  "No longer need this service",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export function isCancellationReason(value: string): value is CancellationReason {
  return (CANCELLATION_REASONS as readonly string[]).includes(value);
}
