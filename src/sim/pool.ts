/* Orchestration côté navigateur : pool de Web Workers + tournois par élimination successive. */
import type { RawDataset } from "./compile";
import type { DeckSpec, Snapshot, MatchResult } from "./engine";
import { compile, type Compiled } from "./compile";
import { defaultTalent, talentSlots } from "./engine";
import type { PlayJob, PlayOut } from "./worker";
import type { Ranked } from "./ranking";
import type { DecisionRec } from "./search";

export interface AnalyseOut { log: string[]; trace: Snapshot[]; result: MatchResult; decisions: DecisionRec[]; rollouts: number }

export interface DeckStat {
  cards: number[]; lv: number[]; tal?: number[]; wr: number; lo: number; hi: number; n: number;
  tox?: [string, number][]; vs?: { i: number; wr: number; n: number }[]; score?: number;
}
export type Precision = "rapide" | "precis" | "maximal" | "extreme";
export const PRECISIONS: Precision[] = ["rapide", "precis", "maximal", "extreme"];
export const PRECISION_LABEL: Record<Precision, string> = { rapide: "Rapide", precis: "Précis", maximal: "Maximal", extreme: "Extrême" };
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

  /** Données compilées côté page (talents disponibles par carte). */
  comp: Compiled | null = null;

  async init(dataset: RawDataset) {
    this.comp = compile(dataset);
    const r = await Promise.all(this.workers.map((_, i) => this.call<{ coverage: number }>(i, "init", { dataset })));
    this.coverage = r[0].coverage;
  }

  rank(pool: number[], topK: number, onProgress?: (p: number) => void, maxShare = 2): Promise<Ranked[]> {
    return this.call<Ranked[]>(0, "rank", { pool, topK, maxShare }, onProgress);
  }

  /** Partie analysée par l'IA experte. onProgress reçoit le nombre de décisions déjà évaluées. */
  analyse(decks: [DeckSpec, DeckSpec], seed: number, rollouts: number, sides: [boolean, boolean], first: 0 | 1, onProgress?: (k: number) => void) {
    return this.call<AnalyseOut>(this.size - 1, "analyse", { decks, seed, rollouts, sides, first }, onProgress);
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

interface Params {
  K: number;
  s1: { opps: number; sims: number; keep: number };
  s2: { sims: number; keep: number };
  /** recherche locale : decks de départ, cartes candidates par emplacement, parties, tours */
  ls: { decks: number; cand: number; sims: number; rounds: number };
  /** optimisation des talents : decks, parties, tours */
  tal: { decks: number; sims: number; rounds: number };
  s3: { sims: number; keep: number };
}
const PARAMS: Record<Precision, Params> = {
  rapide: { K: 150, s1: { opps: 10, sims: 4, keep: 24 }, s2: { sims: 16, keep: 8 }, ls: { decks: 0, cand: 0, sims: 0, rounds: 0 }, tal: { decks: 4, sims: 24, rounds: 1 }, s3: { sims: 100, keep: 6 } },
  precis: { K: 400, s1: { opps: 12, sims: 6, keep: 40 }, s2: { sims: 30, keep: 12 }, ls: { decks: 4, cand: 16, sims: 10, rounds: 1 }, tal: { decks: 6, sims: 40, rounds: 1 }, s3: { sims: 300, keep: 10 } },
  maximal: { K: 800, s1: { opps: 16, sims: 8, keep: 64 }, s2: { sims: 50, keep: 16 }, ls: { decks: 6, cand: 30, sims: 14, rounds: 2 }, tal: { decks: 10, sims: 60, rounds: 2 }, s3: { sims: 800, keep: 12 } },
  extreme: { K: 1600, s1: { opps: 20, sims: 10, keep: 120 }, s2: { sims: 80, keep: 24 }, ls: { decks: 10, cand: 45, sims: 20, rounds: 3 }, tal: { decks: 14, sims: 100, rounds: 2 }, s3: { sims: 2000, keep: 14 } },
};
export const PRECISION_INFO: Record<Precision, string> = {
  rapide: "≈ 15 s · ±3 %",
  precis: "≈ 1 min · ±1,5 %",
  maximal: "≈ 3-5 min · ±0,8 %",
  extreme: "≈ 10-20 min · ±0,4 %",
};

type Stat = { w: number; n: number; vs: { i: number; w: number; n: number }[]; tox: Record<string, number> };

/**
 * Joue chaque paire (candidat, adversaire). Graine dépendant uniquement de l'adversaire : tous les candidats
 * affrontent un même adversaire avec les mêmes tirages (nombres aléatoires communs), ce qui réduit fortement
 * le bruit quand on compare des decks entre eux.
 */
async function evaluate(
  sim: SimPool, cands: DeckSpec[], opps: DeckSpec[], pairs: [number, number][], sims: number, seed: number, collect: boolean,
  cb?: (p: number) => void,
): Promise<Stat[]> {
  const jobs: PlayJob[] = pairs.map(([ci, oi]) => ({ a: cands[ci], b: opps[oi], n: sims, seed: (seed + oi * 104729) >>> 0 }));
  void cands;
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
const wr = (s: Stat) => s.w / Math.max(1, s.n);
const keyOf = (d: DeckSpec) => [...d.cards].sort((a, b) => a - b).join(",") + "|" + (d.tal ?? []).join(",");
const allPairs = (n: number, m: number): [number, number][] => {
  const p: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) p.push([i, j]);
  return p;
};

const toDeckStat = (d: DeckSpec, s: Stat, score?: number): DeckStat => {
  const [lo, hi] = wilson(s.w, s.n);
  const tox = Object.entries(s.tox).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, v / Math.max(1, s.n)] as [string, number]);
  return { cards: d.cards, lv: d.lv, tal: d.tal, wr: s.n ? s.w / s.n : 0, lo, hi, n: s.n, tox, score, vs: s.vs.map((v) => ({ i: v.i, wr: v.w / Math.max(1, v.n), n: v.n })) };
};

export const combos = (n: number) => (n < 4 ? 0 : (n * (n - 1) * (n - 2) * (n - 3)) / 24);

/** Fixe le talent par défaut de chaque carte (le plus haut débloqué). */
function withTalents(comp: Compiled | null, d: DeckSpec): DeckSpec {
  if (d.tal || !comp) return d;
  return { ...d, tal: d.cards.map((n, i) => { const c = comp.byNum.get(n); return c ? defaultTalent(c, d.lv[i]) : 0; }) };
}

/**
 * Optimisation des talents par descente de coordonnées : pour chaque carte, chaque talent débloqué est
 * essayé (les autres restant fixés) contre les adversaires ; on garde le meilleur, puis on recommence.
 */
async function optimizeTalents(
  sim: SimPool, decks: DeckSpec[], opps: DeckSpec[], sims: number, rounds: number, seed: number, cb?: (p: number) => void,
): Promise<DeckSpec[]> {
  const comp = sim.comp;
  if (!comp || !sims || !decks.length) return decks;
  let cur = decks.map((d) => withTalents(comp, d));
  for (let r = 0; r < rounds; r++) {
    const variants: DeckSpec[] = [];
    const owner: { d: number; pos: number; slot: number }[] = [];
    cur.forEach((d, di) => {
      variants.push(d); owner.push({ d: di, pos: -1, slot: 0 });
      d.cards.forEach((n, pos) => {
        const c = comp.byNum.get(n);
        if (!c) return;
        for (const slot of talentSlots(c, d.lv[pos])) {
          if (slot === d.tal![pos]) continue;
          const tal = d.tal!.slice(); tal[pos] = slot;
          variants.push({ ...d, tal }); owner.push({ d: di, pos, slot });
        }
      });
    });
    const st = await evaluate(sim, variants, opps, allPairs(variants.length, opps.length), sims, seed + r * 31, false, (p) => cb?.((r + p) / rounds));
    cur = cur.map((d, di) => {
      const base = st[owner.findIndex((o) => o.d === di && o.pos === -1)];
      const tal = d.tal!.slice();
      for (let pos = 0; pos < d.cards.length; pos++) {
        let best = wr(base), slot = tal[pos];
        owner.forEach((o, vi) => { if (o.d === di && o.pos === pos && wr(st[vi]) > best + 0.004) { best = wr(st[vi]); slot = o.slot; } });
        tal[pos] = slot;
      }
      return { ...d, tal };
    });
  }
  return cur;
}

/** Recherche locale : remplace une carte à la fois par les cartes les plus prometteuses du pool. */
async function localSearch(
  sim: SimPool, start: DeckSpec[], cardPool: number[], lvOf: (n: number) => number, opps: DeckSpec[], P: Params["ls"], seed: number,
  cb?: (p: number) => void,
): Promise<DeckSpec[]> {
  if (!P.rounds || !start.length) return start;
  const seen = new Set(start.map(keyOf));
  let best = start;
  for (let r = 0; r < P.rounds; r++) {
    const neigh: DeckSpec[] = [];
    for (const d of best.slice(0, P.decks)) {
      for (let pos = 0; pos < 4; pos++) {
        for (const n of cardPool.slice(0, P.cand)) {
          if (d.cards.includes(n)) continue;
          const cards = d.cards.slice(); cards[pos] = n;
          const nd = withTalents(sim.comp, { cards, lv: cards.map(lvOf) });
          const k = keyOf(nd);
          if (seen.has(k)) continue;
          seen.add(k);
          neigh.push(nd);
        }
      }
    }
    if (!neigh.length) break;
    const all = best.concat(neigh);
    const st = await evaluate(sim, all, opps, allPairs(all.length, opps.length), P.sims, seed + r * 17, false, (p) => cb?.((r + p) / P.rounds));
    best = all.map((d, i) => ({ d, w: wr(st[i]) })).sort((a, b) => b.w - a.w).slice(0, Math.max(P.decks, start.length)).map((x) => x.d);
  }
  return best;
}

/** Optimise les decks de 4 cartes d'un pool contre une galerie de decks de référence (la méta). */
export async function optimize(
  sim: SimPool, pool: number[], lvOf: (num: number) => number, gauntlet: DeckSpec[], precision: Precision, cb: ProgressCb,
): Promise<{ decks: DeckStat[]; candidates: number; combos: number; matches: number }> {
  const P = PARAMS[precision];
  const spec = (cards: number[]): DeckSpec => withTalents(sim.comp, { cards, lv: cards.map(lvOf) });
  const opps = gauntlet.map((d) => withTalents(sim.comp, d));
  cb("Évaluation statique de toutes les combinaisons", 0);
  const ranked = await sim.rank(pool, P.K, (p) => cb("Évaluation statique de toutes les combinaisons", p * 0.1), 2);
  let cands = ranked.map((r) => spec(r.cards));
  const scores = new Map(ranked.map((r) => [[...r.cards].sort((a, b) => a - b).join(","), r.score]));
  const seed0 = (Date.now() & 0xffffff) >>> 0;
  let matches = 0;
  // étape 1 : chaque candidat contre un échantillon d'adversaires
  const pairs1: [number, number][] = [];
  cands.forEach((_, ci) => {
    shuffle(opps.map((_, i) => i), seed0 + ci).slice(0, Math.min(P.s1.opps, opps.length)).forEach((oi) => pairs1.push([ci, oi]));
  });
  const st1 = await evaluate(sim, cands, opps, pairs1, P.s1.sims, seed0, false, (p) => cb("Tournoi 1/5 · tri large", 0.1 + p * 0.2));
  matches += pairs1.length * P.s1.sims;
  cands = cands.map((d, i) => ({ d, w: wr(st1[i]) })).sort((a, b) => b.w - a.w).slice(0, P.s1.keep).map((x) => x.d);
  // étape 2 : contre tous les adversaires
  const st2 = await evaluate(sim, cands, opps, allPairs(cands.length, opps.length), P.s2.sims, seed0 + 1, false, (p) => cb("Tournoi 2/5 · tri fin", 0.3 + p * 0.15));
  matches += cands.length * opps.length * P.s2.sims;
  cands = cands.map((d, i) => ({ d, w: wr(st2[i]) })).sort((a, b) => b.w - a.w).slice(0, P.s2.keep).map((x) => x.d);
  // étape 3 : recherche locale autour des meilleurs decks (cartes les plus présentes dans le classement statique d'abord)
  const freq = new Map<number, number>();
  ranked.forEach((r, i) => r.cards.forEach((c) => freq.set(c, (freq.get(c) ?? 0) + (ranked.length - i))));
  const cardPool = pool.slice().sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));
  if (P.ls.rounds) {
    const before = cands.length;
    cands = await localSearch(sim, cands, cardPool, lvOf, opps, P.ls, seed0 + 2, (p) => cb("Tournoi 3/5 · recherche locale (échanges de cartes)", 0.45 + p * 0.2));
    matches += (cands.length + P.ls.decks * 4 * P.ls.cand) * opps.length * P.ls.sims * P.ls.rounds;
    void before;
  }
  // étape 4 : meilleurs talents pour les finalistes
  const fin = cands.slice(0, P.tal.decks);
  const tuned = await optimizeTalents(sim, fin, opps, P.tal.sims, P.tal.rounds, seed0 + 3, (p) => cb("Tournoi 4/5 · choix des talents", 0.65 + p * 0.15));
  matches += tuned.length * 13 * opps.length * P.tal.sims * P.tal.rounds;
  cands = tuned.concat(cands.slice(P.tal.decks)).slice(0, Math.max(P.s3.keep, tuned.length));
  // étape 5 : statistiques finales à haute précision
  const st3 = await evaluate(sim, cands, opps, allPairs(cands.length, opps.length), P.s3.sims, seed0 + 4, true, (p) => cb("Tournoi 5/5 · statistiques finales", 0.8 + p * 0.2));
  matches += cands.length * opps.length * P.s3.sims;
  const decks = cands.map((d, i) => toDeckStat(d, st3[i], scores.get([...d.cards].sort((a, b) => a - b).join(",")))).sort((a, b) => b.wr - a.wr);
  cb("Terminé", 1);
  return { decks, candidates: ranked.length, combos: combos(pool.length), matches };
}

/** Construit la méta : meilleurs decks de tout le pool de cartes qui s'affrontent entre eux. */
export interface MetaParams { K: number; k1: [number, number, number]; sims2: number; talSims: number; talTop: number; talRounds: number }
export const META_PARAMS: Record<Precision, MetaParams> = {
  rapide: { K: 120, k1: [10, 4, 32], sims2: 12, talSims: 0, talTop: 16, talRounds: 1 },
  precis: { K: 250, k1: [12, 6, 40], sims2: 24, talSims: 16, talTop: 16, talRounds: 1 },
  maximal: { K: 500, k1: [16, 8, 48], sims2: 60, talSims: 30, talTop: 16, talRounds: 1 },
  extreme: { K: 1000, k1: [20, 10, 56], sims2: 150, talSims: 60, talTop: 16, talRounds: 1 },
};
export async function buildMeta(sim: SimPool, all: number[], version: string, precision: Precision | MetaParams, cb: ProgressCb): Promise<MetaPayload> {
  const MP = typeof precision === "string" ? META_PARAMS[precision] : precision;
  const { K, k1, sims2, talSims } = MP;
  const spec = (cards: number[]): DeckSpec => withTalents(sim.comp, { cards, lv: cards.map(() => 3) });
  cb("Évaluation statique de toutes les combinaisons de cartes", 0);
  const ranked = await sim.rank(all, K, (p) => cb("Évaluation statique de toutes les combinaisons de cartes", p * 0.2), 2);
  const seed0 = (Date.now() & 0xffffff) >>> 0;
  let cands = ranked.map((r) => spec(r.cards));
  const pairs1: [number, number][] = [];
  cands.forEach((_, ci) => {
    shuffle(cands.map((_, i) => i).filter((i) => i !== ci), seed0 + ci).slice(0, k1[0]).forEach((oi) => pairs1.push([ci, oi]));
  });
  const st1 = await evaluate(sim, cands, cands, pairs1, k1[1], seed0, false, (p) => cb("Méta 1/3 · decks contre decks", 0.2 + p * 0.25));
  let matches = pairs1.length * k1[1];
  let field = cands.map((d, i) => ({ d, w: wr(st1[i]) })).sort((a, b) => b.w - a.w).slice(0, k1[2]).map((x) => x.d);
  // talents des 16 meilleurs decks choisis contre le reste du terrain
  if (talSims) {
    const top = field.slice(0, MP.talTop);
    const tuned = await optimizeTalents(sim, top, field, talSims, MP.talRounds, seed0 + 5, (p) => cb("Méta 2/3 · choix des talents", 0.45 + p * 0.2));
    matches += top.length * 13 * field.length * talSims * MP.talRounds;
    field = tuned.concat(field.slice(MP.talTop));
  }
  const pairs2: [number, number][] = [];
  field.forEach((_, a) => field.forEach((_, b) => { if (a !== b) pairs2.push([a, b]); }));
  const st2 = await evaluate(sim, field, field, pairs2, sims2, seed0 + 1, true, (p) => cb("Méta 3/3 · championnat entre les meilleurs decks", 0.65 + p * 0.35));
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

/* --------------------------- conseiller de deck --------------------------- */

export interface AdviceSwap {
  pos: number; out: number; in: number; tal: number[];
  wr: number; lo: number; hi: number; n: number;
  /** gain de taux de victoire par rapport au deck de départ, avec intervalle de confiance à 95 % */
  d: number; dlo: number; dhi: number;
}
export interface AdviceTalent { pos: number; from: number; to: number; d: number }
export interface Advice {
  base: DeckStat;
  /** talents retenus pour le deck de départ (ceux du joueur, ou les meilleurs trouvés) */
  baseTal: number[];
  talents: AdviceTalent[];
  swaps: AdviceSwap[];
  matches: number;
  gauntlet: number;
}
interface AdviceParams { s1: number; keep: number; top: number; s2: number; tal: number }
const ADVICE: Record<Precision, AdviceParams> = {
  rapide: { s1: 3, keep: 16, top: 6, s2: 30, tal: 20 },
  precis: { s1: 4, keep: 24, top: 8, s2: 80, tal: 40 },
  maximal: { s1: 8, keep: 32, top: 10, s2: 200, tal: 80 },
  extreme: { s1: 12, keep: 40, top: 12, s2: 500, tal: 150 },
};
const diffCI = (a: { w: number; n: number }, b: { w: number; n: number }): [number, number, number] => {
  const p = a.w / Math.max(1, a.n), q = b.w / Math.max(1, b.n);
  const se = Math.sqrt((p * (1 - p)) / Math.max(1, a.n) + (q * (1 - q)) / Math.max(1, b.n));
  const d = p - q;
  return [d, d - 1.96 * se, d + 1.96 * se];
};

/**
 * Conseils pour un deck de 4 cartes : taux de victoire contre la méta, meilleurs talents, puis remplacement de chaque carte
 * par chaque carte du pool. Les remplacements sont triés en deux temps (large puis fin) et le résultat final est remesuré
 * avec de nouveaux tirages (pas de biais du « meilleur de beaucoup ») ; chaque variante affronte chaque adversaire avec les
 * mêmes tirages que le deck de départ.
 */
export async function adviseDeck(
  sim: SimPool, deck: DeckSpec, pool: number[], lvOf: (n: number) => number, gauntlet: DeckSpec[], precision: Precision, cb: ProgressCb,
): Promise<Advice> {
  const comp = sim.comp!;
  const P = ADVICE[precision];
  const opps = gauntlet.map((d) => withTalents(comp, d));
  const seed0 = (Date.now() & 0xffffff) >>> 0;
  let matches = 0;
  const spec = (cards: number[], tal?: number[]): DeckSpec => ({ cards, lv: cards.map(lvOf), tal });
  let base = withTalents(comp, spec(deck.cards, deck.tal));
  const userTal = !!deck.tal;
  // 1. talents du deck de départ
  const baseTal0 = base.tal!.slice();
  if (!userTal) {
    cb("Choix des talents de votre deck", 0);
    [base] = await optimizeTalents(sim, [base], opps, P.tal, 2, seed0 + 11, (p) => cb("Choix des talents de votre deck", p * 0.1));
    matches += 13 * opps.length * P.tal * 2;
  }
  // le choix de talents n'est gardé que s'il gagne aussi avec de nouveaux tirages (sinon : talents d'origine)
  let talents: AdviceTalent[] = [];
  if (!userTal && base.tal!.some((t, i) => t !== baseTal0[i])) {
    const orig = { ...base, tal: baseTal0 };
    const stT = await evaluate(sim, [base, orig], opps, allPairs(2, opps.length), P.s2, seed0 + 4, false);
    matches += 2 * opps.length * P.s2;
    const [d, dlo] = diffCI(stT[0], stT[1]);
    if (d > 0 && dlo > -0.005) {
      const changed = base.tal!.map((t, pos) => ({ pos, from: baseTal0[pos], to: t })).filter((x) => x.from !== x.to);
      talents = changed.map((x) => ({ ...x, d: d / changed.length }));
    } else base = orig;
  }
  const baseTal = base.tal!.slice();
  // 2. tri large : chaque remplacement possible (une carte à la fois)
  const variants: { d: DeckSpec; pos: number; n: number }[] = [];
  for (let pos = 0; pos < 4; pos++) {
    for (const n of pool) {
      if (base.cards.includes(n)) continue;
      const cards = base.cards.slice(); cards[pos] = n;
      const c = comp.byNum.get(n);
      const tal = base.tal!.slice(); tal[pos] = c ? defaultTalent(c, lvOf(n)) : 0;
      variants.push({ d: spec(cards, tal), pos, n });
    }
  }
  const all1 = [base, ...variants.map((v) => v.d)];
  const st1 = await evaluate(sim, all1, opps, allPairs(all1.length, opps.length), P.s1, seed0, false, (p) => cb("Essai de tous les remplacements possibles", 0.1 + p * 0.45));
  matches += all1.length * opps.length * P.s1;
  const order = variants.map((v, i) => ({ v, w: wr(st1[i + 1]) })).sort((a, b) => b.w - a.w).slice(0, P.keep).map((x) => x.v);
  // 3. tri fin avec davantage de parties
  const all2 = [base, ...order.map((v) => v.d)];
  const st2 = await evaluate(sim, all2, opps, allPairs(all2.length, opps.length), P.s2, seed0 + 1, false, (p) => cb("Départage des meilleurs remplacements", 0.55 + p * 0.15));
  matches += all2.length * opps.length * P.s2;
  const finalists = order.map((v, i) => ({ v, w: wr(st2[i + 1]) })).sort((a, b) => b.w - a.w).slice(0, P.top).map((x) => x.v);
  // 4. talents des finalistes, puis mesure finale avec de nouveaux tirages
  const tunedAll = await optimizeTalents(sim, finalists.map((f) => f.d), opps, P.tal, 1, seed0 + 2, (p) => cb("Talents des meilleurs remplacements", 0.7 + p * 0.15));
  matches += finalists.length * 13 * opps.length * P.tal;
  const all3 = [base, ...tunedAll];
  const st3 = await evaluate(sim, all3, opps, allPairs(all3.length, opps.length), P.s2, seed0 + 3, true, (p) => cb("Mesure finale", 0.85 + p * 0.15));
  matches += all3.length * opps.length * P.s2;
  const swaps: AdviceSwap[] = finalists.map((f, i) => {
    const s = st3[i + 1];
    const [lo, hi] = wilson(s.w, s.n);
    const [d, dlo, dhi] = diffCI(s, st3[0]);
    return { pos: f.pos, out: base.cards[f.pos], in: f.n, tal: tunedAll[i].tal ?? [], wr: s.w / Math.max(1, s.n), lo, hi, n: s.n, d, dlo, dhi };
  }).sort((a, b) => b.d - a.d);
  cb("Terminé", 1);
  return { base: toDeckStat(base, st3[0]), baseTal, talents, swaps, matches, gauntlet: opps.length };
}
