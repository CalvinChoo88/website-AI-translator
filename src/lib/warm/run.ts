import { after } from "next/server";
import { db } from "@/lib/db";
import { easystoreConfig } from "@/lib/easystore/config";
import { extractPageContent } from "./crawl";
import { translateBatchCached } from "@/lib/translation/cache";
import { INTERNAL_SECRET_HEADER, internalSecretHeaderValue } from "./internalAuth";

// Safety caps: this crawl runs unattended off the back of a real
// shopper's page load, so it must stay cheap and bounded rather than
// translate an entire large catalog on one trigger.
const MAX_PAGES = 150;
const BATCH_SIZE = 4;
const FETCH_TIMEOUT_MS = 8000;

function warmEndpointUrl(): string {
  return `${easystoreConfig.appUrl}/api/internal/warm-locale`;
}

/** Schedules the next crawl batch to run after this response is sent — never blocks the caller. */
function fireContinue(localeWarmId: string) {
  after(async () => {
    try {
      await fetch(warmEndpointUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [INTERNAL_SECRET_HEADER]: internalSecretHeaderValue(),
        },
        body: JSON.stringify({ localeWarmId }),
      });
    } catch (err) {
      // Best-effort chain: if a hop fails to even fire, the run just
      // stalls at "running" — pages already crawled stay cached and
      // useful, it simply won't cover the rest of the site. Not
      // retried automatically.
      console.error("[warm] failed to schedule next batch", err);
    }
  });
}

/**
 * Called from /api/translate when a shop has autoWarmOnFirstUse
 * enabled and a shopper picks a locale that's never been warmed. The
 * unique (shopId, locale) constraint on LocaleWarm is what stops two
 * shoppers picking the same new locale at once from starting
 * duplicate crawls — whichever request's create() wins starts it,
 * the other just returns.
 */
export async function triggerWarmIfNeeded(
  shopId: string,
  locale: string,
  seedUrl: string,
): Promise<void> {
  // Without this, a shop could opt into autoWarmOnFirstUse before
  // INTERNAL_JOB_SECRET is set on the deployment, creating a
  // LocaleWarm row that can never progress (fireContinue always
  // fails). Skip entirely rather than leave that stuck "running" row.
  if (!process.env.INTERNAL_JOB_SECRET) return;

  try {
    const created = await db.localeWarm.create({
      data: { shopId, locale, frontierJson: JSON.stringify([seedUrl]) },
    });
    fireContinue(created.id);
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return; // already running or done
    // A failure here must never break the shopper's actual translate
    // request — auto-warm is a background nicety, not a dependency.
    console.error("[warm] failed to start locale warm", err);
  }
}

/** Processes one batch of pages for a crawl-in-progress, then schedules the next batch if any work remains. */
export async function processWarmBatch(localeWarmId: string): Promise<void> {
  const row = await db.localeWarm.findUnique({ where: { id: localeWarmId } });
  if (!row || row.status !== "running") return;

  const shop = await db.shop.findUnique({ where: { id: row.shopId } });
  if (!shop || shop.uninstalledAt) {
    await db.localeWarm.update({ where: { id: row.id }, data: { status: "failed" } });
    return;
  }

  const visitedSet = new Set<string>(JSON.parse(row.visitedJson));
  const frontier: string[] = JSON.parse(row.frontierJson).filter((u: string) => !visitedSet.has(u));

  if (frontier.length === 0 || visitedSet.size >= MAX_PAGES) {
    await db.localeWarm.update({ where: { id: row.id }, data: { status: "done", frontierJson: "[]" } });
    return;
  }

  const batch = frontier.slice(0, BATCH_SIZE);
  const discovered = new Set<string>(frontier.slice(BATCH_SIZE));

  // Sequential, not Promise.all: each page's translateBatchCached call
  // already opens several concurrent DB connections internally
  // (bounded, but non-zero) — running multiple pages at once here
  // would multiply that and risks re-exhausting the DB's pooled
  // connection limit, the exact bug already hit and fixed on the
  // shopper-facing /api/translate path. This runs in the background,
  // so trading crawl speed for staying well under the pool is the
  // right tradeoff.
  for (const url of batch) {
    visitedSet.add(url);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;
      const html = await res.text();
      const { texts, links } = extractPageContent(html, url);
      if (texts.length > 0) {
        await translateBatchCached(shop.id, shop.sourceLocale, row.locale, texts);
      }
      for (const link of links) {
        if (!visitedSet.has(link)) discovered.add(link);
      }
    } catch (err) {
      console.error("[warm] failed to crawl page", url, err);
    }
  }

  const nextFrontier = [...discovered].slice(0, Math.max(0, MAX_PAGES - visitedSet.size));
  const done = nextFrontier.length === 0 || visitedSet.size >= MAX_PAGES;

  await db.localeWarm.update({
    where: { id: row.id },
    data: {
      status: done ? "done" : "running",
      visitedJson: JSON.stringify([...visitedSet]),
      frontierJson: JSON.stringify(nextFrontier),
      pagesDone: visitedSet.size,
    },
  });

  if (!done) fireContinue(row.id);
}
