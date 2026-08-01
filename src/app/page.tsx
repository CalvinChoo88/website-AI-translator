import { redirect } from "next/navigation";

/**
 * This is the "App URL" registered in the Partner Dashboard — EasyStore
 * hits it directly (with shop/host_url/timestamp/hmac) whenever a
 * logged-in App Store user opens or installs the app. Forward those to
 * a Route Handler to verify + look up the shop, since Server Components
 * can't set cookies. A plain visit with no such params just shows the
 * marketing copy below.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  if (params.shop && params.hmac) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
      else qs.append(key, value);
    }
    redirect(`/api/auth/launch?${qs.toString()}`);
  }

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", lineHeight: 1.6 }}>
      <h1>Website Translator</h1>
      <p>
        An EasyStore app that translates your storefront into most languages in
        the world. Shoppers get a language dropdown plus a one-time,
        overridable suggestion based on their country; you pick which
        languages to offer from your admin settings.
      </p>
      <p>
        Install this app from your EasyStore admin&rsquo;s Apps page, then
        visit <a href="/admin">/admin</a> to choose languages and get your
        storefront embed snippet.
      </p>
    </main>
  );
}
