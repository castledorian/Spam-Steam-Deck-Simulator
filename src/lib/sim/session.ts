import type { Snapshot } from "../types";
import { SimPool } from "./pool";
import { computeMeta, type DeckResult, type Progress, type Quality } from "./search";

let pool: SimPool | null = null;
let poolKey = "";
const metaMem = new Map<string, DeckResult[]>();

export function snapKey(s: Snapshot): string {
  let h = 0;
  const str = JSON.stringify(s.cards);
  for (let i = 0; i < str.length; i += 7) h = (h * 31 + str.charCodeAt(i)) | 0;
  return `${s.gameVersion}:${s.cards.length}:${h}`;
}

export function getPool(s: Snapshot): SimPool {
  const k = snapKey(s);
  if (!pool || poolKey !== k) {
    pool?.terminate();
    pool = new SimPool(s);
    poolKey = k;
  }
  pool.cancelled = false;
  return pool;
}

export function cancelPool() {
  pool?.terminate();
  pool = null;
  poolKey = "";
}

export function cachedMeta(s: Snapshot, q: Quality): DeckResult[] | null {
  const k = `spam.meta.v1:${snapKey(s)}:${q}`;
  const m = metaMem.get(k);
  if (m) return m;
  try {
    const raw = localStorage.getItem(k);
    if (raw) {
      const v = JSON.parse(raw) as DeckResult[];
      metaMem.set(k, v);
      return v;
    }
  } catch {}
  return null;
}

export async function getMeta(s: Snapshot, q: Quality, onP: Progress, force = false): Promise<DeckResult[]> {
  if (!force) {
    const c = cachedMeta(s, q);
    if (c) return c;
  }
  const res = await computeMeta(getPool(s), s, q, onP);
  const k = `spam.meta.v1:${snapKey(s)}:${q}`;
  metaMem.set(k, res);
  try {
    localStorage.setItem(k, JSON.stringify(res));
  } catch {}
  return res;
}
