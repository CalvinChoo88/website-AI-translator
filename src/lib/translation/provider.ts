export interface TranslationProvider {
  /**
   * Translate a batch of strings in one call. Implementations should
   * return results in the same order/length as `texts`.
   */
  translateBatch(
    texts: string[],
    targetLocale: string,
    sourceLocale: string,
  ): Promise<string[]>;
}
