import { getSessionShop } from "@/lib/adminAuth";
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
      </main>
    );
  }

  return (
    <AdminSettingsForm
      domain={shop.domain}
      initialSourceLocale={shop.sourceLocale}
      initialEnabledLocales={JSON.parse(shop.enabledLocales || "[]")}
      initialAutoDetect={shop.autoDetect}
    />
  );
}
