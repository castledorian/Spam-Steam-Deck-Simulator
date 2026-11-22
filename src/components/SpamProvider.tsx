"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RawCard, RawDataset } from "@/sim/compile";
import { buildMeta, MetaPayload, Precision, ProgressCb, SimPool } from "@/sim/pool";
import type { LabPayload } from "@/sim/lab";

export const DATA_BASE = "https://spamgame.com/data/";
/** Préfixe du site (GitHub Pages sert le projet sous /<nom-du-dépôt>). */
export const SITE_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const compareVersions = (a: string, b: string) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};
export const img = (p: string) => DATA_BASE + p;

export interface Layout {
  width: number; height: number; cornerRadius: number;
  body: { image: string }; header: { height: number; gradient: string[] };
  name: { x: number; y: number; width: number; fontSize: number; lineHeight: number; maxLines: number; shadow: string };
  rows: {
    x: number; width: number; height: number; top: number; step: number; max: number;
    ability: {
      bar: { image: string; x: number; y: number; width: number; height: number; opacity: number };
      cooldown: { image: string; x: number; y: number; width: number; height: number };
      cooldownText: { centerX: number; centerY: number; fontSize: number };
      name: { x: number; width: number; centerY: number; fontSize: number };
    };
    skill: {
      lineLeft: { image: string; x: number; y: number; width: number; height: number };
      lineRight: { image: string; x: number; y: number; width: number; height: number };
      name: { x: number; width: number; centerY: number; fontSize: number };
    };
  };
  hpBar: { x: number; y: number; width: number; height: number; radius: number; color: string; text: { fontSize: number; color: string } };
  border: { width: number };
  rarityGem: { image: string; x: number; y: number; width: number; height: number };
  elementOrb: { image: string; x: number; y: number; width: number; height: number };
  spamton: { image: string; x: number; y: number; width: number; height: number; text: { centerX: number; centerY: number; fontSize: number; color: string } };
}

/** source « site » : données publiées avec le site ; « direct » : version plus récente lue en direct sur le SpamDex. */
export interface SyncInfo { ok: boolean; version: string; source: "site" | "direct"; fetchedAt: string; generatedAt: string; message?: string }
export type Collection = Record<number, number>; // numéro de carte -> talents débloqués (0..3)

interface Ctx {
  ds: RawDataset | null; layout: Layout | null; info: SyncInfo | null; loading: boolean; error: string | null;
  cards: RawCard[]; byNum: Map<number, RawCard>;
  collection: Collection; owned: (n: number) => boolean; setOwned: (n: number, on: boolean) => void;
  setLevel: (n: number, lv: number) => void; setMany: (nums: number[], on: boolean) => void; clearCollection: () => void;
  talentMode: "collection" | "all"; setTalentMode: (m: "collection" | "all") => void;
  lvOf: (n: number) => number;
  refresh: () => Promise<void>; syncing: boolean;
  getPool: () => Promise<SimPool>;
  meta: MetaPayload | null; metaBusy: boolean; ensureMeta: (precision: Precision, cb: ProgressCb, force?: boolean) => Promise<MetaPayload>;
  /** Résultats du laboratoire (méta de référence, IA experte, impact), s'ils correspondent au patch affiché. */
  lab: LabPayload | null;
  /** Origine de la méta affichée : calculée par le site (serveur) ou dans ce navigateur. */
  metaSource: "lab" | "local" | null;
  /** Oublie la méta calculée dans ce navigateur et revient à celle du laboratoire. */
  resetToLabMeta: () => void;
}

const C = createContext<Ctx | null>(null);
export const useSpam = () => {
  const v = useContext(C);
  if (!v) throw new Error("SpamProvider manquant");
  return v;
};

const KEY = "spamlab.collection.v1";
const KEY_MODE = "spamlab.talents.v1";
/** Préfixe de la méta mémorisée : changé à chaque évolution du moteur pour ne pas réutiliser d'anciens résultats. */
const META_KEY = "spamlab.meta.v8.";

export function SpamProvider({ children }: { children: ReactNode }) {
  const [ds, setDs] = useState<RawDataset | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState<Collection>({});
  const [talentMode, setTalentModeState] = useState<"collection" | "all">("all");
  const [syncing, setSyncing] = useState(false);
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);
  const [labAll, setLabAll] = useState<LabPayload | null>(null);
  const [metaSource, setMetaSource] = useState<"lab" | "local" | null>(null);
  const poolRef = useRef<Promise<SimPool> | null>(null);
  const dsRef = useRef<RawDataset | null>(null);

  const load = useCallback(async () => {
    try {
      const [rd, rl] = await Promise.all([fetch(`${SITE_BASE}/data/dataset.json`, { cache: "no-cache" }), fetch(`${SITE_BASE}/data/layout.json`)]);
      if (!rd.ok || !rl.ok) throw new Error("HTTP " + (rd.ok ? rl.status : rd.status));
      const j: { status: SyncInfo; layout: Layout; data: RawDataset } = {
        data: (await rd.json()) as RawDataset,
        layout: (await rl.json()) as Layout,
        status: { ok: true, version: "", source: "site", fetchedAt: new Date().toISOString(), generatedAt: "" },
      };
      // Vérification en direct du SpamDex : si une version plus récente vient de sortir et que le
      // navigateur peut la lire, on l'utilise sans attendre la prochaine publication du site.
      try {
        const idx = (await (await fetch(DATA_BASE + "index.json", { cache: "no-cache" })).json()) as { schema: number; latest: string; cards: string };
        if (idx.schema === 1 && compareVersions(idx.latest, j.data.version) > 0) {
          const fresh = (await (await fetch(DATA_BASE + idx.cards.replace("{version}", idx.latest).replace("{language}", "fr"))).json()) as RawDataset;
          if (fresh.language === "fr" && Array.isArray(fresh.cards) && fresh.cards.length >= j.data.cards.length * 0.9) {
            j.data = fresh;
            j.status.source = "direct";
            j.status.message = `Version ${fresh.version} lue en direct sur le SpamDex officiel (l'historique des patchs sera mis à jour à la prochaine publication du site).`;
          }
        }
      } catch {
        /* SpamDex injoignable depuis le navigateur : les données publiées avec le site restent valables */
      }
      j.status.version = j.data.version;
      j.status.generatedAt = j.data.generatedAt;
      setDs((prev) => {
        if (prev && prev.version !== j.data.version && poolRef.current) {
          poolRef.current.then((p) => p.terminate()).catch(() => undefined);
          poolRef.current = null;
        }
        return j.data;
      });
      dsRef.current = j.data;
      try {
        const rlab = await fetch(`${SITE_BASE}/data/lab.json`, { cache: "no-cache" });
        if (rlab.ok) setLabAll((await rlab.json()) as LabPayload);
      } catch { /* laboratoire pas encore calculé */ }
      setLayout(j.layout);
      setInfo(j.status);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) setCollection(JSON.parse(s) as Collection);
      const m = localStorage.getItem(KEY_MODE);
      if (m === "collection" || m === "all") setTalentModeState(m);
    } catch { /* ignore */ }
    void load();
    const t = setInterval(() => void load(), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const persist = (c: Collection) => {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
  };
  const setOwned = useCallback((n: number, on: boolean) => {
    setCollection((c) => {
      const next = { ...c };
      if (on) next[n] = next[n] ?? 0; else delete next[n];
      persist(next);
      return next;
    });
  }, []);
  const setMany = useCallback((nums: number[], on: boolean) => {
    setCollection((c) => {
      const next = { ...c };
      for (const n of nums) { if (on) next[n] = next[n] ?? 0; else delete next[n]; }
      persist(next);
      return next;
    });
  }, []);
  const setLevel = useCallback((n: number, lv: number) => {
    setCollection((c) => {
      const next = { ...c, [n]: Math.max(0, Math.min(3, lv)) };
      persist(next);
      return next;
    });
  }, []);
  const clearCollection = useCallback(() => { setCollection({}); persist({}); }, []);
  const setTalentMode = useCallback((m: "collection" | "all") => {
    setTalentModeState(m);
    try { localStorage.setItem(KEY_MODE, m); } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const getPool = useCallback((): Promise<SimPool> => {
    if (!poolRef.current) {
      poolRef.current = (async () => {
        const d = dsRef.current;
        if (!d) throw new Error("Données non chargées");
        const p = new SimPool();
        await p.init(d);
        return p;
      })();
    }
    return poolRef.current;
  }, []);

  useEffect(() => () => { poolRef.current?.then((p) => p.terminate()).catch(() => undefined); }, []);

  const cards = useMemo(() => ds?.cards ?? [], [ds]);
  const byNum = useMemo(() => new Map(cards.map((c) => [c.number, c])), [cards]);
  const owned = useCallback((n: number) => n in collection, [collection]);
  const lvOf = useCallback((n: number) => (talentMode === "all" ? 3 : collection[n] ?? 0), [talentMode, collection]);

  const lab = labAll && ds && labAll.version === ds.version ? labAll : null;
  // méta : celle du laboratoire (bien plus de parties) sinon celle calculée dans ce navigateur
  useEffect(() => {
    if (!ds) return;
    let local: MetaPayload | null = null;
    try {
      const s = localStorage.getItem(META_KEY + ds.version);
      local = s ? (JSON.parse(s) as MetaPayload) : null;
    } catch { /* ignore */ }
    if (local && (!lab || new Date(local.at) > new Date(lab.at))) { setMeta(local); setMetaSource("local"); }
    else if (lab) { setMeta(lab.meta); setMetaSource("lab"); }
    else { setMeta(null); setMetaSource(null); }
  }, [ds, lab]);

  const ensureMeta = useCallback(async (precision: Precision, cb: ProgressCb, force = false): Promise<MetaPayload> => {
    const d = dsRef.current;
    if (!d) throw new Error("Données non chargées");
    if (meta && !force) return meta;
    setMetaBusy(true);
    try {
      const pool = await getPool();
      const m = await buildMeta(pool, d.cards.map((c) => c.number), d.version, precision, cb);
      setMeta(m);
      setMetaSource("local");
      try { localStorage.setItem(META_KEY + d.version, JSON.stringify(m)); } catch { /* ignore */ }
      return m;
    } finally {
      setMetaBusy(false);
    }
  }, [meta, getPool]);

  const resetToLabMeta = useCallback(() => {
    if (!lab || !ds) return;
    try { localStorage.removeItem(META_KEY + ds.version); } catch { /* ignore */ }
    setMeta(lab.meta); setMetaSource("lab");
  }, [lab, ds]);

  const value: Ctx = {
    ds, layout, info, loading, error, cards, byNum, collection, owned, setOwned, setLevel, setMany, clearCollection,
    talentMode, setTalentMode, lvOf, refresh, syncing, getPool, meta, metaBusy, ensureMeta, lab, metaSource, resetToLabMeta,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
