import Link from "next/link";
import { getSessionShop } from "@/lib/adminAuth";
import { getProviderSupportedLocales } from "@/lib/translation";
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
      initialSourceLocale={shop.sourceLocale}
      initialEnabledLocales={JSON.parse(shop.enabledLocales || "[]")}
      initialAutoDetect={shop.autoDetect}
      providerSupportedLocales={getProviderSupportedLocales()}
    />
  );
}
