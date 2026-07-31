# Website Translator for EasyStore

An EasyStore app that translates a storefront into most languages in the
world. Translation runs on DeepL by default (free up to 500K
characters/month, indefinitely; ~35 languages) — Azure AI Translator and
Google Cloud Translation are also implemented (~130 languages each,
free/paid respectively) and selectable via env var if broader coverage
matters more than DeepL's generally higher translation quality. Shoppers
get a language dropdown; if the merchant enables auto-detect, it's
pre-selected based on the shopper's approximate country and can always be
changed — the choice is then remembered in a cookie instead of being
re-detected every visit.

**On IP/VPN detection:** this app detects the visitor's *apparent* country
(via Vercel's edge geolocation or a geo-IP lookup on the request IP) the
same way any website does. It does not attempt to unmask a real IP behind
a VPN/proxy — that isn't something a website script can legitimately do,
and the closest techniques (WebRTC leak probing, browser exploits) are
deanonymization tooling, not a feature of a translation app. A VPN user
gets a suggestion based on their exit node's country, same as any other
geo-aware site, and can override it in the dropdown either way.

## Stack

- Next.js 16 (App Router) + TypeScript, deployable as a single service
  (e.g. Vercel).
- Prisma ORM targeting Postgres (required — no field types are
  provider-specific, so switching to MySQL is still just the `provider`
  line in `prisma/schema.prisma`, but Postgres is what's set up and
  what Vercel's Storage integrations offer).
- DeepL API (v2, REST, `DeepL-Auth-Key` auth) as the default translation
  backend, behind a `TranslationProvider` interface (`src/lib/translation/`)
  — swap providers via `TRANSLATION_PROVIDER`. Azure AI Translator and
  Google Cloud Translation are also implemented and selectable the same
  way for broader language coverage.
- A vanilla-JS storefront widget (`public/widget/translator.js`, no
  build step, no framework dependency) that merchants embed with one
  `<script>` tag.

## How it fits together

1. **Install (OAuth)** — `src/app/api/auth/install` and `.../callback`
   implement EasyStore's OAuth flow: authorize at
   `https://admin.easystore.co/oauth/authorize`, exchange the code at
   `POST https://{shop}/api/3.0/oauth/access_token.json`, store the
   resulting access token per shop (`Shop` table).
2. **Admin settings** (`/admin`) — merchant picks which languages to
   offer and whether to auto-suggest by location; settings are saved via
   `/api/admin/settings` (protected by a signed session cookie issued at
   OAuth callback). The language picker (and the settings API's
   validation) automatically restricts itself to whatever the active
   `TRANSLATION_PROVIDER` actually supports — e.g. DeepL's ~35 languages
   rather than the full ~130-language catalog — so a merchant can never
   enable a language the provider would just error on. The page also
   renders the exact `<script>` snippet to paste into the theme.
3. **Storefront widget** — once embedded, it calls
   `/api/widget/config?shop=...` for the merchant's enabled languages
   and a geo-based suggestion, renders a language dropdown, and on
   selection batches the page's visible text to `/api/translate`, which
   translates (and caches, per shop+locale, keyed by a hash of the
   source string) and returns results for the widget to swap into the
   DOM. Switching back to "Original" restores the untouched text — no
   re-fetch needed, since original strings are captured client-side
   before any translation is applied.
4. **Uninstall webhook** — `/api/webhooks/app-uninstalled` verifies the
   `EasyStore-Hmac-SHA256` signature and marks the shop inactive.

## Setup

Requires a reachable Postgres instance (local Docker container, or a
free Neon/Supabase project — no SQLite fallback, see "Stack" above).

```bash
cp .env.example .env   # fill in the values below, including a real DATABASE_URL
npm install
npx prisma migrate deploy   # applies prisma/migrations/ to your database
npm run dev
```

### Environment variables (see `.env.example` for full comments)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. On Vercel, whichever storage integration you attach injects its own env var name (e.g. `POSTGRES_PRISMA_URL`) — copy that value into a `DATABASE_URL` entry so Prisma picks it up |
| `EASYSTORE_CLIENT_ID` / `EASYSTORE_CLIENT_SECRET` | From Partner Dashboard > Apps > your app's overview page |
| `EASYSTORE_SCOPES` | Comma-separated scopes — **verify exact scope names** against https://developers.easystore.co/docs/api/getting-started/scopes before launch; that page 403'd during development so the `.env.example` default is a best guess (`read_products,read_content,read_store`) |
| `APP_URL` | Public base URL of this deployment; must match the redirect URL registered in the Partner Dashboard |
| `SESSION_SECRET` | Random secret for the admin session cookie (`openssl rand -hex 32`) |
| `TRANSLATION_PROVIDER` | `deepl` (default), `azure`, or `google` |
| `DEEPL_API_KEY` | DeepL API key from https://www.deepl.com/pro-api — free tier = 500K chars/month. Free-tier keys end in `:fx`; the app auto-selects the free vs. pro endpoint from that suffix |
| `AZURE_TRANSLATOR_KEY` | Only needed if `TRANSLATION_PROVIDER=azure` (Azure Portal > create a "Translator" resource; free F0 tier = 2M chars/month) |
| `AZURE_TRANSLATOR_REGION` | Only required for a *regional* Azure Translator resource — leave blank for a "Global" resource |
| `GOOGLE_TRANSLATE_API_KEY` | Only needed if `TRANSLATION_PROVIDER=google` |
| `GEOIP_FALLBACK_API_URL` | Used only off-Vercel, where the `x-vercel-ip-country` header isn't available |

### Partner Dashboard setup

1. Partner Dashboard > Apps > Create app.
2. App URL: `{APP_URL}`; Redirect URL: `{APP_URL}/api/auth/callback`.
3. Register a webhook for topic `app/uninstalled` pointing at
   `{APP_URL}/api/webhooks/app-uninstalled`.
4. Install the app from a development store to test the OAuth flow.

## Deploying to Vercel

1. **Deploy the app** to get a live URL (e.g. `https://your-app.vercel.app`).
   At this point it'll build and serve static pages fine, but nothing
   that touches the database or EasyStore will work yet — that's expected.
2. **Attach a Postgres database** via the project's **Storage** tab
   (Vercel Postgres, or the Neon/Supabase marketplace integrations all
   work). Copy the connection string it gives you into a `DATABASE_URL`
   environment variable under **Settings → Environment Variables** (the
   integration usually injects a differently-named var — see the table
   above).
3. **Apply the schema once**: `npx prisma migrate deploy` doesn't run
   automatically on every build (deliberately — it would fail the very
   first deploy, before any database is attached). Run it once yourself
   against the new database: `vercel env pull .env.production.local`
   then `npx prisma migrate deploy` locally, using that pulled env file.
4. **Create the app in EasyStore's Partner Dashboard** (see below),
   using your real Vercel URL for the App URL and
   `{your-url}/api/auth/callback` for the Redirect URL.
5. **Add the remaining environment variables** (`EASYSTORE_CLIENT_ID`,
   `EASYSTORE_CLIENT_SECRET`, `EASYSTORE_SCOPES`, `APP_URL` set to your
   real Vercel URL, `SESSION_SECRET`, `DEEPL_API_KEY`) in Vercel's
   Environment Variables settings, then redeploy so they take effect.

## Things verified vs. assumed

Verified against EasyStore's docs during development (some pages 403'd
direct fetches, so this came from cached/search-indexed excerpts —
sanity-check against the live docs before shipping):

- OAuth authorize endpoint, params, and token-exchange endpoint/response shape.
- `EasyStore-Access-Token` header for authenticated Admin API calls.
- `EasyStore-Hmac-SHA256` webhook signature scheme (hex HMAC-SHA256 over the raw body).

Not confirmed (flagged in code comments where used — check before
production):

- Exact scope name strings.
- Exact query-param serialization EasyStore uses for the OAuth callback
  HMAC (implemented using the conventional sorted-params scheme).
- The field name carrying shop domain in the `app/uninstalled` webhook
  payload (implemented to check `domain`, `shop`, then `store.domain`).

## Known limitations / next steps

- **DeepL trades coverage for quality.** DeepL supports ~35 languages
  vs. ~130 for Azure/Google — the admin picker and both API routes
  (`/api/admin/settings`, `/api/translate`, `/api/widget/config`)
  enforce this automatically via `getProviderSupportedLocales()`
  (`src/lib/translation/index.ts`), so a merchant can never enable —
  and the widget can never request — a language DeepL doesn't support.
  If a store needs "most languages in the world" over translation
  quality, switch `TRANSLATION_PROVIDER` to `azure` or `google`.
- **DeepL's supported-language list (`src/lib/translation/deepl.ts`)
  and locale-code mapping aren't exhaustively verified.** DeepL's docs
  403'd during development; the list of ~32 languages and their codes
  (including the required target-language variants for English/
  Portuguese/Chinese — DeepL rejects plain `EN`/`PT`/`ZH` as a target)
  came from search-indexed excerpts of
  https://developers.deepl.com/docs/getting-started/supported-languages.
  Re-check against the live docs before launch, and note DeepL adds
  languages over time so this list will also go stale.
- Azure's language-code mapping (`src/lib/translation/azure.ts`) has
  the same caveat for its handful of confirmed divergences
  (`zh-CN`→`zh-Hans`, `zh-TW`→`zh-Hant`, `no`→`nb`) if you switch to it.
- The widget does whole-page client-side text-node translation (like
  Weglot/GTranslate-style widgets), not server-rendered locale routes —
  simplest to ship without needing EasyStore theme-asset APIs, but it
  means translated pages aren't indexable by search engines in the
  target language. A server-side, SEO-friendly variant (locale-prefixed
  routes, `hreflang`) would be a substantial follow-up.
- `/api/translate` is intentionally public (called from anonymous
  shopper browsers) and capped in request size, but has no rate
  limiting yet — add IP/shop-based limits before relying on it in
  production to bound translation-provider spend.
- `npm audit` flags transitive advisories in Next's own bundled
  `sharp`/`postcss` (image optimization/CSS tooling this app doesn't
  exercise — no `next/image` remote optimization, no untrusted CSS
  processing). No fix is available upstream yet; monitor for a patched
  Next release.
