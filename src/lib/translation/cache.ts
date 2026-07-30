import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getTranslationProvider } from "./index";

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
    const provider = getTranslationProvider();
    const translated = await provider.translateBatch(missTexts, targetLocale, sourceLocale);

    // upsert (not createMany + skipDuplicates, which SQLite doesn't
    // support) so this stays portable across DB providers and is safe
    // against a race with a concurrent request caching the same string.
    await Promise.all(
      missTexts.map((text, i) => {
        const sourceHash = hashes[missIndices[i]!]!;
        return db.translation.upsert({
          where: { shopId_locale_sourceHash: { shopId, locale: targetLocale, sourceHash } },
          create: { shopId, locale: targetLocale, sourceHash, sourceText: text, translatedText: translated[i]! },
          update: {},
        });
      }),
    );

    missTexts.forEach((text, i) => {
      cacheByHash.set(hashes[missIndices[i]!]!, translated[i]!);
    });
  }

  return texts.map((text, i) => cacheByHash.get(hashes[i]!) ?? text);
}
