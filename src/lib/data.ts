import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { snapshots } from "@/db/schema";
import seed from "@/data/seed.json";
import type { Snapshot } from "./types";
import { buildSnapshot } from "./sync";
import { checkSnapshot, normalizeSnapshot } from "./snapshot";

const STALE_MS = 3 * 3600 * 1000;

const g = globalThis as typeof globalThis & {
  __spamSync?: { running: boolean; lastError?: string; lastRun?: number; mem?: Snapshot };
};
const state = (g.__spamSync ??= { running: false });

let tableReady: Promise<void> | null = null;
function ensureTable() {
  tableReady ??= db
    .execute(
      sql`create table if not exists snapshots (
        id serial primary key,
        game_version text not null,
        card_count integer not null default 0,
        fetched_at timestamptz not null default now(),
        data jsonb not null
      )`,
    )
    .then(() => undefined)
    .catch(() => {
      tableReady = null;
    });
  return tableReady;
}

export async function latestSnapshot(): Promise<Snapshot> {
  if (state.mem) return state.mem;
  try {
    await ensureTable();
    const rows = await db.select().from(snapshots).orderBy(desc(snapshots.id)).limit(1);
    if (rows[0]) {
      // Le snapshot embarqué peut être plus récent que la base (mise à jour par commit) : on garde le plus frais.
      const fromDb = normalizeSnapshot(rows[0].data);
      const bundled = normalizeSnapshot(seed as unknown as Snapshot);
      state.mem = new Date(bundled.fetchedAt) > new Date(fromDb.fetchedAt) ? bundled : fromDb;
      return state.mem;
    }
    const s = normalizeSnapshot(seed as unknown as Snapshot);
    await db.insert(snapshots).values({ gameVersion: s.gameVersion, cardCount: s.cards.length, data: s });
    state.mem = s;
    return s;
  } catch {
    // Keep the bundled snapshot in memory when PostgreSQL is unavailable.
    // This allows the site and simulator to remain usable in local/offline mode.
    state.mem = normalizeSnapshot(seed as unknown as Snapshot);
    return state.mem;
  }
}

export function syncStatus() {
  return { running: state.running, lastError: state.lastError, lastRun: state.lastRun };
}

export async function runSync(): Promise<{ ok: boolean; message: string; snapshot?: Snapshot }> {
  if (state.running) return { ok: false, message: "Synchronisation déjà en cours" };
  state.running = true;
  try {
    const fresh = await buildSnapshot();
    normalizeSnapshot(fresh);
    const errors = checkSnapshot(fresh, state.mem);
    if (errors.length) throw new Error(`Snapshot rejeté : ${errors.join(" ; ")}`);
    await ensureTable();
    await db.insert(snapshots).values({ gameVersion: fresh.gameVersion, cardCount: fresh.cards.length, data: fresh });
    await db.execute(sql`delete from snapshots where id not in (select id from snapshots order by id desc limit 5)`);
    state.mem = fresh;
    state.lastError = undefined;
    state.lastRun = Date.now();
    return { ok: true, message: `Mis à jour : patch ${fresh.gameVersion}, ${fresh.cards.length} cartes`, snapshot: fresh };
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    state.lastRun = Date.now();
    return { ok: false, message: state.lastError };
  } finally {
    state.running = false;
  }
}

/** Stale-while-revalidate: serve what we have, refresh in the background when old. */
export async function snapshotWithRefresh(): Promise<Snapshot> {
  const s = await latestSnapshot();
  const age = Date.now() - new Date(s.fetchedAt).getTime();
  const recentTry = state.lastRun && Date.now() - state.lastRun < 15 * 60 * 1000;
  // Sans base de données, la fraîcheur est assurée par la tâche planifiée (scripts/sync-snapshot.ts) :
  // inutile de relancer une synchro complète à chaque visite.
  if (process.env.DATABASE_URL && age > STALE_MS && !state.running && !recentTry) void runSync();
  return s;
}
