import crypto from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getTranslationProviderForLocale } from "./index";
import { mapWithConcurrency } from "./concurrency";

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Translate a batch of strings for a shop+locale, backed by a
 * Prisma-cached table so repeated strings (nav labels, boilerplate
 * copy repeated across pages, etc.) are only sent to the translation
 * provider once. Returns translations in the same order as `texts`.
 */
export async function translateBatchCached(
  shopId: string,
  sourceLocale: string,
  targetLocale: string,
  texts: string[],
): Promise<string[]> {
  if (texts.length === 0) return [];
  if (targetLocale === sourceLocale) return texts;

  const hashes = texts.map(hashText);
  const uniqueHashes = [...new Set(hashes)];

  const cached = await db.translation.findMany({
    where: { shopId, locale: targetLocale, sourceHash: { in: uniqueHashes } },
  });
  const cacheByHash = new Map(cached.map((row) => [row.sourceHash, row.translatedText]));

  const missIndices: number[] = [];
  const missTexts: string[] = [];
  const seenMissHashes = new Set<string>();
  texts.forEach((text, i) => {
    const h = hashes[i]!;
    if (!cacheByHash.has(h) && !seenMissHashes.has(h)) {
      seenMissHashes.add(h);
      missIndices.push(i);
      missTexts.push(text);
    }
  });

  if (missTexts.length > 0) {
    // Resolved per target locale, not once for the whole app: with a
    // fallback provider configured, a locale DeepL doesn't support is
    // served by that fallback instead, while everything DeepL does
    // support still goes through DeepL.
    const provider = getTranslationProviderForLocale(targetLocale);
    const translated = await provider.translateBatch(missTexts, targetLocale, sourceLocale);

    missTexts.forEach((text, i) => {
      cacheByHash.set(hashes[missIndices[i]!]!, translated[i]!);
    });

    // Persisting the cache write isn't on the critical path for this
    // caller — it only needs to matter for the *next* request. Deferred
    // via after() so the translated text goes back to the shopper as
    // soon as the provider responds, instead of also waiting on these
    // DB round trips first.
    after(async () => {
      // upsert (not createMany + skipDuplicates, which SQLite doesn't
      // support) so this stays portable across DB providers. Bounded
      // concurrency, not Promise.all, since a page like checkout can
      // surface dozens of never-seen strings in one request — unbounded
      // parallel writes exhaust the DB's pooled connection limit. A
      // P2002 (unique constraint) here just means another concurrent
      // request already cached the same string first — that's the
      // desired outcome, not a failure, so it's swallowed rather than
      // thrown.
      await mapWithConcurrency(missTexts, 3, async (text, i) => {
        const sourceHash = hashes[missIndices[i]!]!;
        try {
          await db.translation.upsert({
            where: { shopId_locale_sourceHash: { shopId, locale: targetLocale, sourceHash } },
            create: { shopId, locale: targetLocale, sourceHash, sourceText: text, translatedText: translated[i]! },
            update: {},
          });
        } catch (err) {
          if ((err as { code?: string }).code !== "P2002") throw err;
        }
      });
    });
  }

  return texts.map((text, i) => cacheByHash.get(hashes[i]!) ?? text);
}
