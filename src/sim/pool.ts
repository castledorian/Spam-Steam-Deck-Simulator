/* Orchestration côté navigateur : pool de Web Workers + tournois par élimination successive. */
import type { RawDataset } from "./compile";
import type { DeckSpec, Snapshot, MatchResult } from "./engine";
import type { PlayJob, PlayOut } from "./worker";
import type { Ranked } from "./ranking";

export interface DeckStat {
  cards: number[]; lv: number[]; wr: number; lo: number; hi: number; n: number;
  tox?: [string, number][]; vs?: { i: number; wr: number; n: number }[]; score?: number;
}
export type Precision = "rapide" | "precis" | "maximal";
export type ProgressCb = (phase: string, pct: number) => void;
export interface MetaPayload {
  version: string; sims: number; decks: DeckStat[];
  cards: Record<number, { presence: number; wr: number; decks: number }>;
  candidates: number; combos: number; at: string;
}

export function wilson(w: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96, p = w / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

type Handler = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: number) => void };

export class SimPool {
  private workers: Worker[] = [];
  private handlers = new Map<number, Handler>();
  private seq = 1;
  coverage = 1;
  size: number;

  constructor(n?: number) {
    const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(6, n ?? hc - 1));
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { id: number; result?: unknown; error?: string; progress?: number };
        const h = this.handlers.get(m.id);
        if (!h) return;
        if (m.progress !== undefined) { h.onProgress?.(m.progress); return; }
        this.handlers.delete(m.id);
        if (m.error) h.reject(new Error(m.error)); else h.resolve(m.result);
      };
      this.workers.push(w);
    }
  }

  private call<T>(wi: number, type: string, payload: unknown, onProgress?: (p: number) => void): Promise<T> {
    const id = this.seq++;
    return new Promise<T>((resolve, reject) => {
      this.handlers.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.workers[wi].postMessage({ id, type, payload });
    });
  }

  async init(dataset: RawDataset) {
    const r = await Promise.all(this.workers.map((_, i) => this.call<{ coverage: number }>(i, "init", { dataset })));
    this.coverage = r[0].coverage;
  }

  rank(pool: number[], topK: number, onProgress?: (p: number) => void, maxShare = 2): Promise<Ranked[]> {
    return this.call<Ranked[]>(0, "rank", { pool, topK, maxShare }, onProgress);
  }

  duel(a: DeckSpec, b: DeckSpec, seed: number) {
    return this.call<{ log: string[]; trace: Snapshot[]; result: MatchResult }>(0, "duel", { decks: [a, b], seed });
  }

  /** Joue des séries de matchs en parallèle. Chaque job est découpé en paquets pour équilibrer la charge. */
  async play(jobs: PlayJob[], collect = false, onProgress?: (p: number) => void): Promise<PlayOut[]> {
    type Piece = { ji: number; job: PlayJob };
    const pieces: Piece[] = [];
    const BATCH = 160;
    let cur: Piece[] = [];
    let curN = 0;
    const batches: Piece[][] = [];
    jobs.forEach((j, ji) => {
      let left = j.n;
      let k = 0;
      while (left > 0) {
        const n = Math.min(left, left > 120 ? 100 : left);
        const piece = { ji, job: { ...j, n, seed: (j.seed + k * 7919) >>> 0 } };
        pieces.push(piece);
        cur.push(piece);
        curN += n;
        left -= n;
        k++;
        if (curN >= BATCH) { batches.push(cur); cur = []; curN = 0; }
      }
    });
    if (cur.length) batches.push(cur);
    const merged: PlayOut[] = jobs.map(() => ({ aw: 0, bw: 0, d: 0, turns: 0, toxA: {} }));
    let next = 0;
    let done = 0;
    const total = batches.length;
    const run = async (wi: number) => {
      while (next < batches.length) {
        const b = batches[next++];
        const out = await this.call<PlayOut[]>(wi, "play", { jobs: b.map((p) => p.job), collect });
        out.forEach((o, i) => {
          const m = merged[b[i].ji];
          m.aw += o.aw; m.bw += o.bw; m.d += o.d; m.turns += o.turns;
          for (const [k, v] of Object.entries(o.toxA)) m.toxA[k] = (m.toxA[k] ?? 0) + v;
        });
        done++;
        onProgress?.(done / total);
      }
    };
    await Promise.all(this.workers.map((_, i) => run(i)));
    return merged;
  }

  terminate() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
  }
}

/* --------------------------- tournois --------------------------- */

const shuffle = <T,>(a: T[], seed: number): T[] => {
  const r = a.slice();
  let s = seed >>> 0;
  for (let i = r.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

interface Params { K: number; s1: { opps: number; sims: number; keep: number }; s2: { sims: number; keep: number }; s3: { sims: number } }
const PARAMS: Record<Precision, Params> = {
  rapide: { K: 120, s1: { opps: 10, sims: 4, keep: 24 }, s2: { sims: 16, keep: 6 }, s3: { sims: 80 } },
  precis: { K: 300, s1: { opps: 12, sims: 6, keep: 40 }, s2: { sims: 24, keep: 10 }, s3: { sims: 240 } },
  maximal: { K: 600, s1: { opps: 16, sims: 8, keep: 60 }, s2: { sims: 40, keep: 12 }, s3: { sims: 700 } },
};
export const PRECISION_INFO: Record<Precision, string> = {
  rapide: "≈ 10 s · ±3 %",
  precis: "≈ 40 s · ±1,5 %",
  maximal: "≈ 2-3 min · ±0,8 %",
};

type Stat = { w: number; n: number; vs: { i: number; w: number; n: number }[]; tox: Record<string, number> };

async function evaluate(
  sim: SimPool, cands: DeckSpec[], opps: DeckSpec[], pairs: [number, number][], sims: number, seed: number, collect: boolean,
  cb?: (p: number) => void,
): Promise<Stat[]> {
  const jobs: PlayJob[] = pairs.map(([ci, oi], k) => ({ a: cands[ci], b: opps[oi], n: sims, seed: (seed + k * 104729) >>> 0 }));
  const out = await sim.play(jobs, collect, cb);
  const stats: Stat[] = cands.map(() => ({ w: 0, n: 0, vs: [], tox: {} }));
  out.forEach((o, k) => {
    const [ci, oi] = pairs[k];
    const s = stats[ci];
    const n = o.aw + o.bw + o.d;
    const w = o.aw + o.d * 0.5;
    s.w += w; s.n += n;
    s.vs.push({ i: oi, w, n });
    for (const [t, v] of Object.entries(o.toxA)) s.tox[t] = (s.tox[t] ?? 0) + v;
  });
  return stats;
}

const toDeckStat = (d: DeckSpec, s: Stat, score?: number): DeckStat => {
  const [lo, hi] = wilson(s.w, s.n);
  const tox = Object.entries(s.tox).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, v / Math.max(1, s.n)] as [string, number]);
  return { cards: d.cards, lv: d.lv, wr: s.n ? s.w / s.n : 0, lo, hi, n: s.n, tox, score, vs: s.vs.map((v) => ({ i: v.i, wr: v.w / Math.max(1, v.n), n: v.n })) };
};

export const combos = (n: number) => (n < 4 ? 0 : (n * (n - 1) * (n - 2) * (n - 3)) / 24);

/** Optimise les decks de 4 cartes d'un pool contre une galerie de decks de référence (la méta). */
export async function optimize(
  sim: SimPool, pool: number[], lvOf: (num: number) => number, gauntlet: DeckSpec[], precision: Precision, cb: ProgressCb,
): Promise<{ decks: DeckStat[]; candidates: number; combos: number; matches: number }> {
  const P = PARAMS[precision];
  const spec = (cards: number[]): DeckSpec => ({ cards, lv: cards.map(lvOf) });
  cb("Évaluation statique de toutes les combinaisons", 0);
  const ranked = await sim.rank(pool, P.K, (p) => cb("Évaluation statique de toutes les combinaisons", p * 0.2), 2);
  let cands = ranked.map((r) => spec(r.cards));
  const scores = new Map(ranked.map((r) => [r.cards.join(","), r.score]));
  let matches = 0;
  const seed0 = (Date.now() & 0xffffff) >>> 0;
  // étape 1 : échantillon d'adversaires
  const pairs1: [number, number][] = [];
  cands.forEach((_, ci) => {
    const order = shuffle(gauntlet.map((_, i) => i), seed0 + ci).slice(0, Math.min(P.s1.opps, gauntlet.length));
    order.forEach((oi) => pairs1.push([ci, oi]));
  });
  const st1 = await evaluate(sim, cands, gauntlet, pairs1, P.s1.sims, seed0, false, (p) => cb("Tournoi 1/3 · tri large", 0.2 + p * 0.25));
  matches += pairs1.length * P.s1.sims;
  let idx = cands.map((_, i) => i).sort((a, b) => st1[b].w / Math.max(1, st1[b].n) - st1[a].w / Math.max(1, st1[a].n)).slice(0, P.s1.keep);
  cands = idx.map((i) => cands[i]);
  // étape 2 : tous les adversaires
  const pairs2: [number, number][] = [];
  cands.forEach((_, ci) => gauntlet.forEach((_, oi) => pairs2.push([ci, oi])));
  const st2 = await evaluate(sim, cands, gauntlet, pairs2, P.s2.sims, seed0 + 1, false, (p) => cb("Tournoi 2/3 · tri fin", 0.45 + p * 0.25));
  matches += pairs2.length * P.s2.sims;
  idx = cands.map((_, i) => i).sort((a, b) => st2[b].w / Math.max(1, st2[b].n) - st2[a].w / Math.max(1, st2[a].n)).slice(0, P.s2.keep);
  cands = idx.map((i) => cands[i]);
  // étape 3 : précision maximale pour les finalistes
  const pairs3: [number, number][] = [];
  cands.forEach((_, ci) => gauntlet.forEach((_, oi) => pairs3.push([ci, oi])));
  const st3 = await evaluate(sim, cands, gauntlet, pairs3, P.s3.sims, seed0 + 2, true, (p) => cb("Tournoi 3/3 · statistiques finales", 0.7 + p * 0.3));
  matches += pairs3.length * P.s3.sims;
  const decks = cands.map((d, i) => toDeckStat(d, st3[i], scores.get(d.cards.join(",")))).sort((a, b) => b.wr - a.wr);
  cb("Terminé", 1);
  return { decks, candidates: ranked.length, combos: combos(pool.length), matches };
}

/** Construit la méta : meilleurs decks de tout le pool de cartes qui s'affrontent entre eux. */
export async function buildMeta(sim: SimPool, all: number[], version: string, precision: Precision, cb: ProgressCb): Promise<MetaPayload> {
  const K = { rapide: 100, precis: 200, maximal: 400 }[precision];
  const k1 = { rapide: [10, 4, 32], precis: [12, 6, 40], maximal: [16, 8, 48] }[precision];
  const sims2 = { rapide: 10, precis: 24, maximal: 50 }[precision];
  const spec = (cards: number[]): DeckSpec => ({ cards, lv: cards.map(() => 3) });
  cb("Évaluation statique de toutes les combinaisons de cartes", 0);
  const ranked = await sim.rank(all, K, (p) => cb("Évaluation statique de toutes les combinaisons de cartes", p * 0.3), 2);
  const seed0 = (Date.now() & 0xffffff) >>> 0;
  let cands = ranked.map((r) => spec(r.cards));
  const pairs1: [number, number][] = [];
  cands.forEach((_, ci) => {
    shuffle(cands.map((_, i) => i).filter((i) => i !== ci), seed0 + ci).slice(0, k1[0]).forEach((oi) => pairs1.push([ci, oi]));
  });
  const st1 = await evaluate(sim, cands, cands, pairs1, k1[1], seed0, false, (p) => cb("Méta 1/2 · decks contre decks", 0.3 + p * 0.3));
  let matches = pairs1.length * k1[1];
  const idx = cands.map((_, i) => i).sort((a, b) => st1[b].w / Math.max(1, st1[b].n) - st1[a].w / Math.max(1, st1[a].n)).slice(0, k1[2]);
  const field = idx.map((i) => cands[i]);
  const pairs2: [number, number][] = [];
  field.forEach((_, a) => field.forEach((_, b) => { if (a !== b) pairs2.push([a, b]); }));
  const st2 = await evaluate(sim, field, field, pairs2, sims2, seed0 + 1, true, (p) => cb("Méta 2/2 · championnat entre les meilleurs decks", 0.6 + p * 0.4));
  matches += pairs2.length * sims2;
  const raw = field.map((d, i) => ({ fi: i, ds: toDeckStat(d, st2[i], ranked.find((r) => r.cards.join() === d.cards.join())?.score) })).sort((a, b) => b.ds.wr - a.ds.wr);
  const pos = new Map(raw.map((x, rank) => [x.fi, rank]));
  const stats: DeckStat[] = raw.map((x) => ({ ...x.ds, vs: x.ds.vs?.map((v) => ({ ...v, i: pos.get(v.i) ?? 999 })) }));
  // le classement final se fait uniquement entre les 24 meilleurs decks (decks contre decks)
  const TOP = Math.min(24, stats.length);
  const re = stats.slice(0, TOP).map((d) => {
    const vs = (d.vs ?? []).filter((v) => v.i < TOP);
    let w = 0, n = 0;
    vs.forEach((v) => { w += v.wr * v.n; n += v.n; });
    const [lo, hi] = wilson(w, n);
    return { ...d, vs, wr: n ? w / n : 0, lo, hi, n };
  });
  const sorted = re.map((d, i) => ({ d, i })).sort((x, y) => y.d.wr - x.d.wr);
  const remap = new Map(sorted.map((x, ni) => [x.i, ni]));
  const decks: DeckStat[] = sorted.map((x) => ({ ...x.d, vs: x.d.vs?.map((v) => ({ ...v, i: remap.get(v.i) ?? 0 })) }));
  const cards: MetaPayload["cards"] = {};
  decks.forEach((d, rank) => {
    for (const c of d.cards) {
      const e = (cards[c] ??= { presence: 0, wr: 0, decks: 0 });
      e.decks++;
      e.wr += d.wr;
      e.presence += TOP - rank;
    }
  });
  for (const c of Object.values(cards)) c.wr /= c.decks;
  cb("Terminé", 1);
  return { version, sims: matches, decks, cards, candidates: ranked.length, combos: combos(all.length), at: new Date().toISOString() };
}
