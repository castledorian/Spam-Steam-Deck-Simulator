"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Card, Snapshot } from "@/lib/types";

interface Ctx {
  snap: Snapshot | null;
  bySlug: Map<string, Card>;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  syncMsg: string | null;
  sync: () => Promise<void>;
}
const DataCtx = createContext<Ctx>({ snap: null, bySlug: new Map(), loading: true, error: null, syncing: false, syncMsg: null, sync: async () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/data", { cache: "no-store" });
      const j = await r.json();
      setSnap((prev) => (prev && prev.fetchedAt === j.snapshot.fetchedAt ? prev : (j.snapshot as Snapshot)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const j = await r.json();
      setSyncMsg(j.message);
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Échec");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const bySlug = useMemo(() => new Map((snap?.cards ?? []).map((c) => [c.slug, c])), [snap]);
  const value = useMemo(() => ({ snap, bySlug, loading, error, syncing, syncMsg, sync }), [snap, bySlug, loading, error, syncing, syncMsg, sync]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);

/* ------------------------- owned collection ------------------------- */
const KEY = "spam.owned.v1";
const listeners = new Set<() => void>();
let cache: string | null = null;
function read(): string {
  if (cache === null) {
    try {
      cache = localStorage.getItem(KEY) || "{}";
    } catch {
      cache = "{}";
    }
  }
  return cache;
}
function write(v: Record<string, number>) {
  cache = JSON.stringify(v);
  try {
    localStorage.setItem(KEY, cache);
  } catch {}
  listeners.forEach((l) => l());
}

export function useOwned() {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    read,
    () => "{}",
  );
  const owned = useMemo(() => JSON.parse(raw) as Record<string, number>, [raw]);
  const set = useCallback((slug: string, lvl: number | null) => {
    const o = JSON.parse(read()) as Record<string, number>;
    if (lvl === null) delete o[slug];
    else o[slug] = lvl;
    write(o);
  }, []);
  const setMany = useCallback((slugs: string[], lvl: number | null) => {
    const o = JSON.parse(read()) as Record<string, number>;
    for (const s of slugs) {
      if (lvl === null) delete o[s];
      else o[s] = lvl;
    }
    write(o);
  }, []);
  return { owned, set, setMany };
}
