export default function HomePage() {
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
