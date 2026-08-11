import Link from "next/link";
import { getSessionShop } from "@/lib/adminAuth";
import { getProviderSupportedLocales } from "@/lib/translation";
import { easystoreConfig } from "@/lib/easystore/config";
import { AdminSettingsForm } from "./AdminSettingsForm";

export default async function AdminPage() {
  const shop = await getSessionShop();

  if (!shop) {
    return (
      <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
        <h1>Not connected</h1>
        <p>
          Open this app from your EasyStore admin&rsquo;s Apps page (or
          re-install it) to manage translation settings.
        </p>
        <p>
          <Link href="/admin/faq">View the FAQ</Link>
        </p>
      </main>
    );
  }

  const plans = [
    { key: "starter", name: "Starter", price: "$12/mo", url: process.env.STRIPE_PAYMENT_LINK_STARTER },
    { key: "business", name: "Business", price: "$29/mo", url: process.env.STRIPE_PAYMENT_LINK_BUSINESS },
    { key: "elite", name: "Elite", price: "$59/mo", url: process.env.STRIPE_PAYMENT_LINK_ELITE },
  ].filter(
    (plan): plan is { key: string; name: string; price: string; url: string } => Boolean(plan.url),
  );

  return (
    <>
      <AdminSettingsForm
        domain={shop.domain}
        appUrl={easystoreConfig.appUrl}
        initialSourceLocale={shop.sourceLocale}
        initialEnabledLocales={JSON.parse(shop.enabledLocales || "[]")}
        initialAutoDetect={shop.autoDetect}
        initialAutoWarmOnFirstUse={shop.autoWarmOnFirstUse}
        plan={shop.plan}
        providerSupportedLocales={getProviderSupportedLocales()}
      />
      {plans.length > 0 && (
        <section style={{ maxWidth: 720, margin: "0 auto 40px", padding: "0 24px" }}>
          <h2 style={{ fontSize: 18 }}>Upgrade plan</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {plans.map((plan) =>
              plan.key === shop.plan ? (
                <span
                  key={plan.key}
                  style={{
                    display: "block",
                    padding: "10px 16px",
                    border: "1px solid #111",
                    borderRadius: 6,
                    background: "#111",
                    color: "#fff",
                  }}
                >
                  <strong>{plan.name}</strong> &mdash; Current plan
                </span>
              ) : (
                <a
                  key={plan.key}
                  href={`${plan.url}?client_reference_id=${encodeURIComponent(shop.domain)}`}
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
                  <strong>{plan.name}</strong> &mdash; {plan.price}
                </a>
              ),
            )}
          </div>
        </section>
      )}
    </>
  );
}
