import type { Snapshot } from "../types";
import { SimPool } from "./pool";
import { computeMeta, type DeckResult, type Progress, type Quality } from "./search";

const SIMULATOR_VERSION = "2.0.0";
let pool: SimPool | null = null;
let poolKey = "";
const metaMem = new Map<string, DeckResult[]>();

/** Full-content, deterministic fingerprint. This is a cache key, not a security hash. */
export function snapKey(s: Snapshot): string {
  const canonical = JSON.stringify({
    simulator: SIMULATOR_VERSION,
    gameVersion: s.gameVersion,
    cards: s.cards,
    tox: s.tox,
    talents: s.talents,
    patches: s.patches,
  });
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < canonical.length; i++) {
    const code = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `${SIMULATOR_VERSION}:${s.gameVersion}:${canonical.length}:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function getPool(s: Snapshot): SimPool {
  const key = snapKey(s);
  if (!pool || poolKey !== key || pool.unusable) {
    pool?.terminate();
    pool = new SimPool(s);
    poolKey = key;
  }
  return pool;
}

export function cancelPool() {
  pool?.terminate();
  pool = null;
  poolKey = "";
}

function isDeckResultArray(value: unknown): value is DeckResult[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const result = item as Partial<DeckResult>;
    const slugs = result.deck?.s;
    return Array.isArray(slugs) && slugs.length === 4 && new Set(slugs).size === 4 &&
      Number.isInteger(result.w) && result.w! >= 0 &&
      Number.isInteger(result.d) && result.d! >= 0 &&
      Number.isInteger(result.n) && result.n! >= 0 && result.w! + result.d! <= result.n! &&
      Number.isFinite(result.rate) && result.rate! >= 0 && result.rate! <= 1 &&
      Number.isFinite(result.lo) && Number.isFinite(result.hi) && result.lo! >= 0 &&
      result.hi! <= 1 && result.lo! <= result.hi! &&
      (result.experimental === undefined || typeof result.experimental === "boolean") &&
      (result.validationWarnings === undefined || (Array.isArray(result.validationWarnings) && result.validationWarnings.every((warning) => typeof warning === "string")));
  });
}

function cacheKey(s: Snapshot, quality: Quality) {
  return `spam.meta.v2:${snapKey(s)}:${quality}`;
}

export function cachedMeta(s: Snapshot, quality: Quality): DeckResult[] | null {
  const key = cacheKey(s, quality);
  const memory = metaMem.get(key);
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDeckResultArray(parsed)) {
      localStorage.removeItem(key);
      return null;
    }
    metaMem.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function getMeta(s: Snapshot, quality: Quality, onP: Progress, force = false): Promise<DeckResult[]> {
  if (!force) {
    const cached = cachedMeta(s, quality);
    if (cached) return cached;
  }
  const results = await computeMeta(getPool(s), s, quality, onP);
  const key = cacheKey(s, quality);
  metaMem.set(key, results);
  try {
    localStorage.setItem(key, JSON.stringify(results));
  } catch {
    // Storage quota/private browsing must not make the simulation fail.
  }
  return results;
}
