import { toxKey } from "../parse";
import { abilityFr, cardName, talentFr, warningFr } from "../fr";
import type { Snapshot } from "../types";
import { mulberry, type DeckSpec, type EvalResult, type Rng } from "./engine";
import type { Job } from "./worker";
import type { SimPool } from "./pool";

export type Quality = "fast" | "standard" | "deep";
export interface Owned {
  slug: string;
  lvl: number;
}
export interface DeckResult {
  deck: DeckSpec;
  w: number;
  d: number;
  n: number;
  rate: number;
  lo: number;
  hi: number;
  vsRandom?: { rate: number; n: number };
  tox?: Record<string, number>;
  turns?: number;
  /** True when known unsupported mechanics are present; absence is not proof of game parity. */
  experimental?: boolean;
  validationWarnings?: string[];
}
export type Progress = (p: { phase: string; pct: number; detail?: string }) => void;

/** Wilson interval for genuinely binary observations only (no fractional draws). */
export function wilson(wins: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = wins / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

/** Empirical-Bernstein confidence interval for a score in [0, 1].
 * Outcomes are 0 (loss), 0.5 (draw), 1 (win). Unlike a naive normal interval,
 * this remains non-degenerate when every observed match has the same outcome.
 * Assumes independent match observations; use block/pair bootstrap for paired designs.
 */
export function scoreConfidence(wins: number, draws: number, losses: number, confidence = 0.95): { lo: number; hi: number } {
  const n = wins + draws + losses;
  if (n <= 0) return { lo: 0, hi: 1 };
  const mean = (wins + 0.5 * draws) / n;
  if (n === 1) return { lo: 0, hi: 1 };
  const variance = (wins * (1 - mean) ** 2 + draws * (0.5 - mean) ** 2 + losses * mean ** 2) / (n - 1);
  const delta = Math.max(1e-9, Math.min(0.5, 1 - confidence));
  const logTerm = Math.log(3 / delta);
  const radius = Math.sqrt((2 * variance * logTerm) / n) + (3 * logTerm) / n;
  return { lo: Math.max(0, mean - radius), hi: Math.min(1, mean + radius) };
}

const key = (d: DeckSpec) => [...d.s].sort().join("|");
const rate = (r: EvalResult) => (r.w + r.d / 2) / Math.max(1, r.n);

/** Conservative coverage check: unknown/partially modeled mechanics must not be
 * presented as a certified result. This is not proof of full game parity. */
export function validateDeckCoverage(snap: Snapshot, deck: DeckSpec): { experimental: boolean; validationWarnings: string[] } {
  const bySlug = new Map(snap.cards.map((card) => [card.slug, card]));
  const warnings: string[] = [];
  deck.s.forEach((slug, idx) => {
    const card = bySlug.get(slug);
    if (!card) {
      warnings.push(`Carte inconnue dans le snapshot : ${slug}`);
      return;
    }
    const nom = cardName(card);
    card.abilities.forEach((ability, i) => {
      const issues = new Set((ability.sim.unsupported ?? []).map(warningFr));
      // Les snapshots antérieurs au marquage explicite : on détecte les choix depuis le texte.
      if (ability.lines.some((l) => /^\s*Choice\s*$/i.test(l) || /^-{3,}\s*or\s*-{3,}$/i.test(l.trim()))) issues.add(warningFr("Choice:"));
      for (const issue of issues) warnings.push(`${nom} / ${abilityFr(card, i).name} : ${issue}`);
    });
    // Reproduit le choix du moteur (engine.ts) : meilleur talent débloqué ET modélisé.
    const lvl = deck.l?.[idx] ?? 3;
    const unlocked = card.talents.filter((t) => t.slot <= lvl);
    const wanted = unlocked.find((t) => t.best) ?? unlocked[0];
    const modeled = unlocked.filter((t) => t.modeled);
    const used = modeled.find((t) => t.best) ?? modeled[0];
    if (wanted && !wanted.modeled) {
      const remplace = used ? `la simulation utilise « ${talentFr(card, used.slot).name} » à la place` : "aucun talent n'est appliqué";
      warnings.push(`${nom} / talent « ${talentFr(card, wanted.slot).name} » non modélisé : ${remplace}`);
    }
    for (const t of card.startTox) {
      const k = toxKey(t.name).key;
      if (!snap.tox.some((f) => f.name.toLowerCase() === t.name.toLowerCase() || toxKey(f.name).key === k || toxKey(f.id).key === k)) warnings.push(`${nom} / Tox de départ « ${t.name} » introuvable : ignoré par le moteur`);
    }
  });
  return { experimental: warnings.length > 0, validationWarnings: warnings };
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toDeck(slugs: string[], lv: Map<string, number>): DeckSpec {
  return { s: slugs, l: slugs.map((s) => lv.get(s) ?? 0) };
}

function randomDeck(pool: string[], lv: Map<string, number>, rng: Rng): DeckSpec {
  const s = new Set<string>();
  while (s.size < 4) s.add(pool[Math.floor(rng() * pool.length)]);
  return toDeck([...s], lv);
}

function mutate(d: DeckSpec, pool: string[], lv: Map<string, number>, rng: Rng): DeckSpec {
  const s = [...d.s];
  const r = rng();
  if (r < 0.2) {
    const i = Math.floor(rng() * 4);
    const j = (i + 1 + Math.floor(rng() * 3)) % 4;
    [s[i], s[j]] = [s[j], s[i]];
  } else {
    const n = rng() < 0.75 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rng() * 4);
      for (let tries = 0; tries < 20; tries++) {
        const c = pool[Math.floor(rng() * pool.length)];
        if (!s.includes(c)) {
          s[i] = c;
          break;
        }
      }
    }
  }
  return toDeck(s, lv);
}

class Runner {
  done = 0;
  total = 1;
  constructor(
    private pool: SimPool,
    private onP: Progress,
    private phase = "",
  ) {}
  setPhase(phase: string, total: number) {
    this.phase = phase;
    this.done = 0;
    this.total = Math.max(1, total);
    this.onP({ phase, pct: 0 });
  }
  async eval(decks: DeckSpec[], opps: DeckSpec[], games: number, seed: number, stats = false): Promise<EvalResult[]> {
    const commonSeed = (seed * 7919 + 13) >>> 0;
    const jobs: Job[] = decks.map((a) => ({ a, games, seed: commonSeed, stats }));
    return this.pool.run(jobs, opps, (n) => {
      this.done += n;
      this.onP({ phase: this.phase, pct: Math.min(1, this.done / this.total) });
    });
  }
  async evalJobs(jobs: Job[], opps: DeckSpec[]): Promise<EvalResult[]> {
    return this.pool.run(jobs, opps, (n) => {
      this.done += n;
      this.onP({ phase: this.phase, pct: Math.min(1, this.done / this.total) });
    });
  }
}

function diverse(list: DeckResult[], count: number): DeckResult[] {
  const out: DeckResult[] = [];
  for (const maxOverlap of [2, 3]) {
    for (const r of list) {
      if (out.length >= count) break;
      if (out.includes(r)) continue;
      const set = new Set(r.deck.s);
      const ok = out.every((o) => o.deck.s.filter((x) => set.has(x)).length <= maxOverlap);
      if (ok) out.push(r);
    }
  }
  return out;
}

const Q = {
  fast: { pop: 160, gens: 6, g: 24, final: 300 },
  standard: { pop: 320, gens: 10, g: 40, final: 600 },
  deep: { pop: 640, gens: 16, g: 60, final: 1200 },
};

/** Co-evolves decks over the whole card pool to find the current "meta". */
export async function computeMeta(pool: SimPool, snap: Snapshot, quality: Quality, onP: Progress, seed = 12345): Promise<DeckResult[]> {
  const rng = mulberry(seed);
  const q = Q[quality];
  const slugs = snap.cards.map((c) => c.slug);
  const lv = new Map(slugs.map((s) => [s, 3] as [string, number]));
  const run = new Runner(pool, onP);
  let popu: DeckSpec[] = Array.from({ length: q.pop }, () => randomDeck(slugs, lv, rng));
  run.setPhase("Méta : évolution des decks sur les 151 cartes", q.pop * q.g * q.gens);
  let scored: { d: DeckSpec; r: number }[] = [];
  for (let g = 0; g < q.gens; g++) {
    const opps = shuffle([...popu], rng).slice(0, 36);
    const res = await run.eval(popu, opps, q.g, seed + g);
    scored = popu.map((d, i) => ({ d, r: rate(res[i]) })).sort((a, b) => b.r - a.r);
    const elite = scored.slice(0, Math.floor(q.pop * 0.25)).map((x) => x.d);
    const next = [...elite];
    const seen = new Set(next.map(key));
    while (next.length < q.pop) {
      const nd = rng() < 0.08 ? randomDeck(slugs, lv, rng) : mutate(elite[Math.floor(rng() * elite.length)], slugs, lv, rng);
      const k = key(nd);
      if (seen.has(k) && rng() < 0.9) continue;
      seen.add(k);
      next.push(nd);
    }
    popu = next;
  }
  // final ranking: top candidates vs a fixed random gauntlet + each other
  const top = scored.slice(0, 80).map((x) => x.d);
  const gaunt = Array.from({ length: 40 }, () => randomDeck(slugs, lv, rng));
  run.setPhase("Méta : classement final", top.length * q.final);
  const fin = await run.eval(top, [...gaunt, ...top.slice(0, 20)], q.final, seed + 999);
  const list: DeckResult[] = top
    .map((d, i) => {
      const ci = scoreConfidence(fin[i].w, fin[i].d, fin[i].n - fin[i].w - fin[i].d);
      const coverage = validateDeckCoverage(snap, d);
      return { deck: d, w: fin[i].w, d: fin[i].d, n: fin[i].n, rate: rate(fin[i]), ...ci, ...coverage };
    })
    .sort((a, b) => b.rate - a.rate);
  // dedupe by card set
  const uniq: DeckResult[] = [];
  const ks = new Set<string>();
  for (const r of list) {
    const k = key(r.deck);
    if (!ks.has(k)) {
      ks.add(k);
      uniq.push(r);
    }
  }
  return diverse(uniq, 24);
}

function* combos(n: number): Generator<number[]> {
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) yield [a, b, c, d];
}
function nCr4(n: number) {
  return n < 4 ? 0 : (n * (n - 1) * (n - 2) * (n - 3)) / 24;
}

function perms4(s: string[]): string[][] {
  const out: string[][] = [];
  const rec = (a: string[], rest: string[]) => {
    if (!rest.length) return void out.push(a);
    rest.forEach((x, i) => rec([...a, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], s);
  return out;
}

export interface SearchInfo {
  results: DeckResult[];
  candidates: number;
  exhaustive: boolean;
  games: number;
}

/** Finds the best decks that can be built with the owned cards (and unlocked talents). */
export async function searchOwned(
  pool: SimPool,
  snap: Snapshot,
  owned: Owned[],
  meta: DeckSpec[],
  quality: Quality,
  onP: Progress,
  seed = 777,
): Promise<SearchInfo> {
  const rng = mulberry(seed);
  const q = Q[quality];
  const slugs = owned.map((o) => o.slug);
  const lv = new Map(owned.map((o) => [o.slug, o.lvl] as [string, number]));
  const all = snap.cards.map((c) => c.slug);
  const lv3 = new Map(all.map((s) => [s, 3] as [string, number]));
  const randOpps = Array.from({ length: 40 }, () => randomDeck(all, lv3, rng));
  const gaunt = [...meta, ...randOpps.slice(0, 12)];
  const run = new Runner(pool, onP);
  let games = 0;
  const total = nCr4(slugs.length);
  const exhaustive = total <= 40000;
  let cands: DeckSpec[] = [];
  const g0 = quality === "fast" ? 6 : quality === "standard" ? 10 : 16;

  if (exhaustive) {
    for (const c of combos(slugs.length)) cands.push(toDeck(c.map((i) => slugs[i]), lv));
    run.setPhase(`Évaluation de ${cands.length.toLocaleString("fr-FR")} decks (toutes les combinaisons)`, cands.length * g0);
    const res = await run.eval(cands, gaunt, g0, seed);
    games += cands.length * g0;
    cands = cands
      .map((d, i) => ({ d, r: rate(res[i]) }))
      .sort((a, b) => b.r - a.r)
      .slice(0, Math.max(60, Math.floor(cands.length * 0.12)))
      .map((x) => x.d);
  } else {
    // genetic search inside the owned pool
    let popu = Array.from({ length: q.pop * 6 }, () => randomDeck(slugs, lv, rng));
    const gens = q.gens + 4;
    run.setPhase(`Recherche génétique (${total.toLocaleString("fr-FR")} combinaisons possibles)`, popu.length * g0 * gens);
    let sc: { d: DeckSpec; r: number }[] = [];
    for (let g = 0; g < gens; g++) {
      const res = await run.eval(popu, gaunt, g0, seed + g);
      games += popu.length * g0;
      sc = popu.map((d, i) => ({ d, r: rate(res[i]) })).sort((a, b) => b.r - a.r);
      const elite = sc.slice(0, Math.floor(popu.length * 0.15)).map((x) => x.d);
      const next = [...elite];
      while (next.length < popu.length) next.push(rng() < 0.1 ? randomDeck(slugs, lv, rng) : mutate(elite[Math.floor(rng() * elite.length)], slugs, lv, rng));
      popu = next;
    }
    const seen = new Set<string>();
    cands = [];
    for (const x of sc) {
      const k = key(x.d);
      if (!seen.has(k)) (seen.add(k), cands.push(x.d));
      if (cands.length >= 120) break;
    }
  }

  // successive halving
  const stages: [number, number][] = [
    [q.g * 2, 0.3],
    [q.g * 8, 0.3],
    [q.final / 2, 0],
  ];
  for (let si = 0; si < stages.length; si++) {
    const [gm, keep] = stages[si];
    run.setPhase(`Affinage ${si + 1}/${stages.length} (${cands.length} decks × ${gm} parties)`, cands.length * gm);
    const res = await run.eval(cands, gaunt, gm, seed + 100 + si);
    games += cands.length * gm;
    const sorted = cands.map((d, i) => ({ d, r: rate(res[i]) })).sort((a, b) => b.r - a.r);
    cands = sorted.slice(0, keep ? Math.max(24, Math.floor(sorted.length * keep)) : Math.min(sorted.length, 16)).map((x) => x.d);
  }

  // order optimisation (adjacency matters for AoE, taunt...) + local replacement search
  run.setPhase("Optimisation de l'ordre et des remplacements", cands.slice(0, 8).length * 24 * 60 + 8 * 4 * Math.max(0, slugs.length - 4) * 60);
  const refined: DeckSpec[] = [];
  const seenR = new Set<string>();
  for (const base of cands.slice(0, 8)) {
    const variants = perms4(base.s).map((p) => toDeck(p, lv));
    const res = await run.eval(variants, gaunt, 60, seed + 300);
    games += variants.length * 60;
    let bi = 0;
    res.forEach((r, i) => {
      if (rate(r) > rate(res[bi])) bi = i;
    });
    const best = variants[bi];
    if (!seenR.has(key(best) + best.s.join())) refined.push(best), seenR.add(key(best) + best.s.join());
    // neighbours
    const nb: DeckSpec[] = [];
    for (let i = 0; i < 4; i++)
      for (const c of slugs) if (!best.s.includes(c)) nb.push(toDeck(best.s.map((x, j) => (j === i ? c : x)), lv));
    const pick = nb.length > 200 ? shuffle(nb, rng).slice(0, 200) : nb;
    const nres = await run.eval(pick, gaunt, 60, seed + 400);
    games += pick.length * 60;
    const order = pick.map((d, i) => ({ d, r: rate(nres[i]) })).sort((a, b) => b.r - a.r);
    if (order[0] && order[0].r > rate(res[bi]) + 0.02 && !seenR.has(key(order[0].d))) refined.push(order[0].d), seenR.add(key(order[0].d));
  }
  // dedupe by card-set
  const finalists: DeckSpec[] = [];
  const kk = new Set<string>();
  for (const d of refined) if (!kk.has(key(d))) (kk.add(key(d)), finalists.push(d));

  // final high-volume evaluation (separate seeds → independent of selection)
  const fg = q.final * 3;
  run.setPhase(`Évaluation finale (${finalists.length} decks × ${fg} parties)`, finalists.length * (fg + q.final));
  const fin = await run.eval(finalists, gaunt, fg, seed + 5000, true);
  const vr = await run.eval(finalists, randOpps, q.final, seed + 6000);
  games += finalists.length * (fg + q.final);
  const results: DeckResult[] = finalists
    .map((d, i) => {
      const ci = scoreConfidence(fin[i].w, fin[i].d, fin[i].n - fin[i].w - fin[i].d);
      return {
        deck: d, w: fin[i].w, d: fin[i].d, n: fin[i].n, rate: rate(fin[i]), ...ci,
        ...validateDeckCoverage(snap, d),
        vsRandom: { rate: rate(vr[i]), n: vr[i].n }, tox: fin[i].tox, turns: fin[i].turns,
      };
    })
    .sort((a, b) => b.rate - a.rate);
  return { results, candidates: exhaustive ? total : cands.length, exhaustive, games };
}

export interface Matrix {
  decks: DeckSpec[];
  rate: number[][]; // rate[i][j]: i beats j
  n: number;
  overall: number[];
}

/** Round-robin between decks (meta vs meta). */
export async function roundRobin(pool: SimPool, decks: DeckSpec[], games: number, onP: Progress, seed = 4242): Promise<Matrix> {
  const run = new Runner(pool, onP);
  const jobs: Job[] = [];
  const idx: [number, number][] = [];
  for (let i = 0; i < decks.length; i++)
    for (let j = i + 1; j < decks.length; j++) {
      jobs.push({ a: decks[i], o: [decks[j]], games, seed: seed + i * 131 + j });
      idx.push([i, j]);
    }
  run.setPhase(`Tournoi : ${jobs.length} duels × ${games} parties`, jobs.length * games);
  const res = await run.evalJobs(jobs, []);
  const m = decks.map(() => decks.map(() => 0.5));
  res.forEach((r, k) => {
    const [i, j] = idx[k];
    m[i][j] = rate(r);
    m[j][i] = 1 - rate(r);
  });
  const overall = m.map((row, i) => row.reduce((s, v, j) => (i === j ? s : s + v), 0) / Math.max(1, decks.length - 1));
  return { decks, rate: m, n: games, overall };
}

/** One deck against a list of decks, individually. */
export async function versus(pool: SimPool, deck: DeckSpec, opps: DeckSpec[], games: number, onP: Progress): Promise<DeckResult[]> {
  const run = new Runner(pool, onP);
  const jobs: Job[] = opps.map((o, i) => ({ a: deck, o: [o], games, seed: 99 + i * 17 }));
  run.setPhase("Duels détaillés", jobs.length * games);
  const res = await run.evalJobs(jobs, []);
  return res.map((r, i) => ({ deck: opps[i], w: r.w, d: r.d, n: r.n, rate: rate(r), ...scoreConfidence(r.w, r.d, r.n - r.w - r.d) }));
}
