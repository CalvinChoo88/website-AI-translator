# Website Translator for EasyStore

An EasyStore app that translates a storefront into most languages in the
world (~130, via Google Cloud Translation). Shoppers get a language
dropdown; if the merchant enables auto-detect, it's pre-selected based on
the shopper's approximate country and can always be changed — the choice
is then remembered in a cookie instead of being re-detected every visit.

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
- Prisma ORM. SQLite locally by default; swap `provider` in
  `prisma/schema.prisma` + `DATABASE_URL` for Postgres/MySQL in
  production (no provider-specific types are used, so this is a one-line
  change).
- Google Cloud Translation API (v2, REST, API-key auth) behind a
  `TranslationProvider` interface (`src/lib/translation/`) — swap in
  another provider by implementing that interface.
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
   OAuth callback). The page also renders the exact `<script>` snippet
   to paste into the theme.
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

```bash
cp .env.example .env   # fill in the values below
npm install
npx prisma migrate dev --name init
npm run dev
```

### Environment variables (see `.env.example` for full comments)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string |
| `EASYSTORE_CLIENT_ID` / `EASYSTORE_CLIENT_SECRET` | From Partner Dashboard > Apps > your app's overview page |
| `EASYSTORE_SCOPES` | Comma-separated scopes — **verify exact scope names** against https://developers.easystore.co/docs/api/getting-started/scopes before launch; that page 403'd during development so the `.env.example` default is a best guess (`read_products,read_content,read_store`) |
| `APP_URL` | Public base URL of this deployment; must match the redirect URL registered in the Partner Dashboard |
| `SESSION_SECRET` | Random secret for the admin session cookie (`openssl rand -hex 32`) |
| `TRANSLATION_PROVIDER` | `google` (only implemented provider today) |
| `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translation API key |
| `GEOIP_FALLBACK_API_URL` | Used only off-Vercel, where the `x-vercel-ip-country` header isn't available |

### Partner Dashboard setup

1. Partner Dashboard > Apps > Create app.
2. App URL: `{APP_URL}`; Redirect URL: `{APP_URL}/api/auth/callback`.
3. Register a webhook for topic `app/uninstalled` pointing at
   `{APP_URL}/api/webhooks/app-uninstalled`.
4. Install the app from a development store to test the OAuth flow.

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
