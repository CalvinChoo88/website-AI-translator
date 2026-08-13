import Link from "next/link";
import { getSessionShop } from "@/lib/adminAuth";
import { SubscriptionManager } from "./SubscriptionManager";

export default async function SubscriptionPage() {
  const shop = await getSessionShop();

  if (!shop) {
    return (
      <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
        <h1>Not connected</h1>
        <p>
          Open this app from your EasyStore admin&rsquo;s Apps page (or
          re-install it) to manage your subscription.
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
    <SubscriptionManager
      shopId={shop.id}
      initialPlan={shop.plan}
      subscriptionStartDate={shop.subscriptionStartDate ? shop.subscriptionStartDate.toISOString() : null}
      currentPeriodEnd={shop.currentPeriodEnd ? shop.currentPeriodEnd.toISOString() : null}
      initialCancelAtPeriodEnd={shop.cancelAtPeriodEnd}
      plans={plans}
    />
  );
}
