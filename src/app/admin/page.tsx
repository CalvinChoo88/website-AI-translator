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

  return (
    <AdminSettingsForm
      domain={shop.domain}
      appUrl={easystoreConfig.appUrl}
      initialSourceLocale={shop.sourceLocale}
      initialEnabledLocales={JSON.parse(shop.enabledLocales || "[]")}
      initialAutoDetect={shop.autoDetect}
      initialAutoWarmOnFirstUse={shop.autoWarmOnFirstUse}
      plan={shop.plan}
      subscriptionStatus={shop.subscriptionStatus}
      currentPeriodEnd={shop.currentPeriodEnd ? shop.currentPeriodEnd.toISOString() : null}
      cancelAtPeriodEnd={shop.cancelAtPeriodEnd}
      providerSupportedLocales={getProviderSupportedLocales()}
    />
  );
}
