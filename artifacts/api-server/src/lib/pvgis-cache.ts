import { logger } from "./logger";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const PVGIS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 300;

const store = new Map<string, CacheEntry>();

export function pvgisGet(url: string): unknown | null {
  const entry = store.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(url);
    return null;
  }
  logger.debug({ url: url.slice(0, 80) }, "PVGIS cache HIT");
  return entry.data;
}

export function pvgisSet(url: string, data: unknown): void {
  if (store.size >= MAX_CACHE_SIZE) {
    const firstKey = store.keys().next().value;
    if (firstKey) {
      store.delete(firstKey);
    }
  }
  store.set(url, { data, expiresAt: Date.now() + PVGIS_TTL_MS });
  logger.debug({ url: url.slice(0, 80), cacheSize: store.size }, "PVGIS cache SET");
}

export function pvgisCacheStats() {
  return { size: store.size, maxSize: MAX_CACHE_SIZE };
}
