"use client";

import Link from "next/link";
import { useState } from "react";
import { planLabel } from "@/lib/plans";
import { CANCELLATION_REASONS, type CancellationReason } from "@/lib/cancellationReasons";

interface PlanOption {
  key: string;
  name: string;
  price: string;
  url: string;
}

interface Props {
  shopId: string;
  initialPlan: string;
  subscriptionStartDate: string | null;
  currentPeriodEnd: string | null;
  initialCancelAtPeriodEnd: boolean;
  plans: PlanOption[];
}

type ModalStep = "confirm" | "reason" | "canceling" | "done" | "error";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SubscriptionManager({
  shopId,
  initialPlan,
  subscriptionStartDate,
  currentPeriodEnd,
  initialCancelAtPeriodEnd,
  plans,
}: Props) {
  const plan = initialPlan;
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(initialCancelAtPeriodEnd);
  const [modalStep, setModalStep] = useState<ModalStep | null>(null);
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const startDateLabel = formatDate(subscriptionStartDate);
  const endDateLabel = formatDate(currentPeriodEnd);

  function openCancelFlow() {
    setReason(null);
    setErrorMessage(null);
    setModalStep("confirm");
  }

  function closeModal() {
    setModalStep(null);
  }

  async function resumeSubscription() {
    setResuming(true);
    setResumeError(null);
    try {
      const res = await fetch("/api/admin/subscription/resume", { method: "POST" });
      if (res.ok) {
        setCancelAtPeriodEnd(false);
      } else {
        const body = await res.json().catch(() => null);
        setResumeError(body?.error ?? "Failed to resume subscription.");
      }
    } catch {
      setResumeError("Failed to resume subscription.");
    } finally {
      setResuming(false);
    }
  }

  async function confirmCancel() {
    if (!reason) return;
    setModalStep("canceling");
    try {
      const res = await fetch("/api/admin/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setCancelAtPeriodEnd(true);
        setModalStep("done");
      } else {
        const body = await res.json().catch(() => null);
        setErrorMessage(body?.error ?? "Failed to cancel subscription.");
        setModalStep("error");
      }
    } catch {
      setErrorMessage("Failed to cancel subscription.");
      setModalStep("error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 24px", lineHeight: 1.5 }}>
      {modalStep && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 28,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            {modalStep === "confirm" && (
              <>
                <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
                  Turn off auto-renewal for {planLabel(plan)}?
                </h2>
                <p style={{ color: "#555", margin: "0 0 20px" }}>
                  This stops future billing only — you&rsquo;ll keep {planLabel(plan)}{" "}
                  access until{" "}
                  {endDateLabel ? <strong>{endDateLabel}</strong> : "the end of your current period"}
                  , then move to Free automatically unless you upgrade again before then. Your
                  current subscription period has already been paid and is non-refundable.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button onClick={closeModal} style={secondaryButtonStyle}>
                    Never mind
                  </button>
                  <button onClick={() => setModalStep("reason")} style={dangerButtonStyle}>
                    Continue
                  </button>
                </div>
              </>
            )}

            {(modalStep === "reason" || modalStep === "canceling" || modalStep === "error") && (
              <>
                <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Why are you cancelling?</h2>
                <p style={{ color: "#777", fontSize: 13, margin: "0 0 16px" }}>
                  Pick a reason to continue — this helps us improve the app.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {CANCELLATION_REASONS.map((r) => (
                    <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <input
                        type="radio"
                        name="cancellation-reason"
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        disabled={modalStep === "canceling"}
                      />
                      {r}
                    </label>
                  ))}
                </div>
                {modalStep === "error" && errorMessage && (
                  <p style={{ color: "crimson", fontSize: 13, margin: "0 0 12px" }}>{errorMessage}</p>
                )}
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={closeModal}
                    disabled={modalStep === "canceling"}
                    style={secondaryButtonStyle}
                  >
                    Never mind
                  </button>
                  <button
                    onClick={confirmCancel}
                    disabled={!reason || modalStep === "canceling"}
                    style={{
                      ...dangerButtonStyle,
                      opacity: !reason || modalStep === "canceling" ? 0.5 : 1,
                      cursor: !reason || modalStep === "canceling" ? "default" : "pointer",
                    }}
                  >
                    {modalStep === "canceling" ? "Cancelling…" : "Confirm cancellation"}
                  </button>
                </div>
              </>
            )}

            {modalStep === "done" && (
              <>
                <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Auto-renewal turned off</h2>
                <p style={{ color: "#555", margin: "0 0 20px" }}>
                  You&rsquo;ll keep {planLabel(plan)} access until{" "}
                  {endDateLabel ? <strong>{endDateLabel}</strong> : "your current period ends"}, then
                  move to the Free plan automatically. You can upgrade again any time before then to
                  keep your plan running.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={closeModal} style={dangerButtonStyleInverted}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Manage subscription</h1>
        <Link href="/admin" style={{ fontSize: 14 }}>
          &larr; Back to settings
        </Link>
      </div>
      <p style={{ color: "#555", margin: "4px 0" }}>
        Current plan: <strong>{planLabel(plan)}</strong>
      </p>
      {plan !== "free" && (startDateLabel || endDateLabel) && (
        <p style={{ color: "#777", fontSize: 13, margin: "4px 0 16px" }}>
          {startDateLabel && (
            <>
              Started: <strong>{startDateLabel}</strong>
            </>
          )}
          {startDateLabel && endDateLabel && " · "}
          {endDateLabel && (
            <>
              {cancelAtPeriodEnd ? "Access ends" : "Renews"}: <strong>{endDateLabel}</strong>
            </>
          )}
        </p>
      )}
      {cancelAtPeriodEnd && plan !== "free" && (
        <div
          style={{
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #b45309",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 14,
          }}
        >
          <p style={{ margin: "0 0 10px" }}>
            Auto-renewal is off. You&rsquo;ll keep {planLabel(plan)} until{" "}
            {endDateLabel ?? "your current period ends"}, then move to Free automatically.
          </p>
          {resumeError && <p style={{ color: "crimson", margin: "0 0 10px" }}>{resumeError}</p>}
          <button
            onClick={resumeSubscription}
            disabled={resuming}
            style={{
              padding: "6px 14px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: resuming ? "default" : "pointer",
              fontSize: 13,
              opacity: resuming ? 0.6 : 1,
            }}
          >
            {resuming ? "Resuming…" : `Resume ${planLabel(plan)} subscription`}
          </button>
        </div>
      )}

      <section style={{ margin: "24px 0" }}>
        <h2 style={{ fontSize: 18 }}>Plans</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {plans.map((p) =>
            p.key === plan ? (
              <span
                key={p.key}
                style={{
                  display: "block",
                  padding: "10px 16px",
                  border: "1px solid #111",
                  borderRadius: 6,
                  background: "#111",
                  color: "#fff",
                }}
              >
                <strong>{p.name}</strong> &mdash; {cancelAtPeriodEnd ? "Current plan, ending soon" : "Current plan"}
              </span>
            ) : (
              <a
                key={p.key}
                // Stripe's client_reference_id only allows
                // alphanumeric/dash/underscore and silently drops
                // anything else — a domain (which always has dots)
                // gets discarded, so shopId (a plain alphanumeric
                // cuid) is used instead. See webhooks/stripe/route.ts.
                href={`${p.url}?client_reference_id=${shopId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "10px 16px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <strong>{p.name}</strong> &mdash; {p.price}
              </a>
            ),
          )}
        </div>
      </section>

      {plan !== "free" && !cancelAtPeriodEnd && (
        <section style={{ margin: "32px 0 0", paddingTop: 24, borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: 18 }}>Cancel subscription</h2>
          <p style={{ color: "#777", fontSize: 14, marginBottom: 12 }}>
            Turn off auto-renewal — you&rsquo;ll keep your plan until the current period ends.
          </p>
          <button onClick={openCancelFlow} style={dangerButtonStyle}>
            Cancel subscription
          </button>
        </section>
      )}
    </main>
  );
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#dc2626",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};

const dangerButtonStyleInverted: React.CSSProperties = {
  padding: "8px 18px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#fff",
  color: "#111",
  border: "1px solid #ddd",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
