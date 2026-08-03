import Link from "next/link";

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I add the translator to my storefront?",
    a: (
      <>
        Go to <Link href="/admin">Translation settings</Link>, select the
        languages you want to offer, save, then copy the embed snippet shown
        there into your theme — just before <code>&lt;/body&gt;</code>. One
        script tag covers your whole storefront.
      </>
    ),
  },
  {
    q: "Why does the first language switch take a few seconds, but later ones feel instant?",
    a: (
      <>
        The very first time any shopper selects a given language on your
        store, every piece of text on the page has to be translated live —
        that has real latency. Every translation is then cached, so the same
        text on any page loads instantly after that. If a language feels
        slow again later, it&rsquo;s because it hit text that genuinely
        hasn&rsquo;t been translated yet (a new product, a new page) — that
        specific text will be slow once, then fast forever.
      </>
    ),
  },
  {
    q: "Some fields on my checkout page aren't translating — is that a bug?",
    a: (
      <>
        Checkout pages are often the most locked-down part of a storefront on
        purpose — platforms frequently isolate payment and personal-info
        fields from third-party scripts as a security measure. If part of
        checkout isn&rsquo;t translating, that&rsquo;s the most likely reason,
        not a malfunction. The widget does translate content that gets added
        to the page after it first loads (e.g. a form that renders a moment
        later), but it cannot and does not reach into isolated components
        around sensitive fields.
      </>
    ),
  },
  {
    q: "How does automatic language detection work?",
    a: (
      <>
        On a shopper&rsquo;s first visit, if you&rsquo;ve enabled
        auto-detect, the widget suggests a language based on their
        approximate country (from their network connection). This is the
        same country-level detection any geo-aware website uses — it&rsquo;s
        never used to identify or track anyone, and it does not attempt to
        reveal a real IP address behind a VPN or proxy (that isn&rsquo;t
        something a website script can legitimately do). The shopper always
        sees a normal dropdown and can pick any offered language regardless
        of the suggestion; their choice is remembered after that and never
        re-detected on the same device.
      </>
    ),
  },
  {
    q: "Can I control which languages are offered?",
    a: (
      <>
        Yes — the language list on the <Link href="/admin">settings page</Link>{" "}
        only shows languages your translation provider actually supports, so
        anything you enable is guaranteed to work. Uncheck any language to
        stop offering it; shoppers currently using it will see the storefront
        in its original language on their next visit.
      </>
    ),
  },
  {
    q: 'What does "Original" mean in the storefront dropdown?',
    a: "It switches the page back to exactly what you wrote — no translation applied, regardless of which language a shopper had selected before.",
  },
  {
    q: 'What does "auto-translate the rest of my storefront" do?',
    a: (
      <>
        By default, each page is translated the first time any shopper
        actually views it in a given language. Turning this setting on
        changes that: whenever a shopper is browsing your store in its
        original language (not needing any translation themselves), the app
        uses that quiet moment to crawl the rest of your storefront in the
        background and translate it into one of your enabled languages, so
        later shoppers are far less likely to land on a page that
        hasn&rsquo;t been translated yet. It deliberately waits for a
        moment like that rather than starting the moment someone picks a
        new language — doing it then would compete with that shopper&rsquo;s
        own translation for the same resources and could slow their page
        down. It&rsquo;s off by default because it spends
        translation-provider quota proactively — including on pages nobody
        may ever visit in that language — rather than only for pages
        someone actually looks at. The crawl is capped, covers one language
        at a time, and runs in the background without delaying anyone.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px", lineHeight: 1.6 }}>
      <p style={{ marginBottom: 24 }}>
        <Link href="/admin">&larr; Back to settings</Link>
      </p>
      <h1>Frequently asked questions</h1>
      <div style={{ marginTop: 24 }}>
        {FAQS.map((item, i) => (
          <section
            key={i}
            style={{
              padding: "20px 0",
              borderTop: i === 0 ? "none" : "1px solid #eee",
            }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>{item.q}</h2>
            <p style={{ color: "#444", margin: 0 }}>{item.a}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
