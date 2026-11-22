/* Laboratoire hors ligne (GitHub Actions) : méta de référence, méta « IA experte », impact des Tox, des cartes,
 * des talents, des capacités et des points d'élément. Résultat : public/data/lab.json, lu par le site.
 *
 * Lancement (depuis la racine du dépôt) : npx tsx scripts/lab/run.ts [--force] [--quick]
 * Recalculé quand la version des données ou la version du laboratoire change.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { NodePool } from "./node-pool";
import { buildMeta, type MetaPayload, wilson } from "../../src/sim/pool";
import { defaultTalent, DEFAULT_AI, talentSlots, type DeckSpec } from "../../src/sim/engine";
import type { Task } from "./worker";

/** À incrémenter quand le moteur ou la méthode change (force un nouveau calcul). */
export const LAB_VERSION = 6;

const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick");
const dsPath = resolve(process.cwd(), "public/data/dataset.json");
const outPath = resolve(process.cwd(), "public/data/lab.json");
const ds = JSON.parse(readFileSync(dsPath, "utf8"));

if (!args.has("--force") && existsSync(outPath)) {
  const old = JSON.parse(readFileSync(outPath, "utf8"));
  if (old.version === ds.version && old.lab === LAB_VERSION && !old.quick) {
    console.log(`lab.json déjà à jour (données ${ds.version}, laboratoire v${LAB_VERSION})`);
    process.exit(0);
  }
}

async function main() {
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s] ${m}`);
const pool = new NodePool();
await pool.init(ds);
const comp = pool.comp!;
log(`${pool.size} cœurs, ${comp.cards.length} cartes, données ${ds.version}${QUICK ? " (mode rapide)" : ""}`);

const S = QUICK
  ? { meta: { K: 300, k1: [12, 6, 40] as [number, number, number], sims2: 30, talSims: 16, talTop: 12, talRounds: 1 }, field: 12, opps: 6, toxN: 2, cardN: 1, ctx: 12, abN: 1, ptsN: 4, expertTop: 6, expertN: 2, expertR: 8 }
  : { meta: { K: 2000, k1: [24, 12, 64] as [number, number, number], sims2: 300, talSims: 100, talTop: 24, talRounds: 2 }, field: 24, opps: 10, toxN: 6, cardN: 2, ctx: 48, abN: 6, ptsN: 12, expertTop: 12, expertN: 12, expertR: 40 };

/* ---------- 1. méta de référence (IA heuristique, beaucoup de parties) ---------- */
let lastPh = "";
const meta: MetaPayload = await buildMeta(pool as never, ds.cards.map((c: { number: number }) => c.number), ds.version, S.meta, (ph) => {
  if (ph !== lastPh) { log(ph); lastPh = ph; }
});
log(`méta : ${meta.decks.length} decks, ${meta.sims.toLocaleString("fr")} parties`);
const spec = (d: { cards: number[]; lv: number[]; tal?: number[] }): DeckSpec => ({ cards: d.cards, lv: d.lv, tal: d.tal });
const field = meta.decks.slice(0, S.field).map(spec);
const opps = field.slice(0, S.opps);
let games = meta.sims;

/** Taux de victoire de chaque variante contre les adversaires ; graines identiques pour toutes les variantes. */
async function evalAll(variants: { deck: DeckSpec; opts?: Task["opts"] }[], against: DeckSpec[], n: number, seed: number, label: string) {
  const jobs: Task[] = [];
  variants.forEach((v) => against.forEach((o, j) => jobs.push({ a: v.deck, b: o, n, seed: (seed + j * 104729) >>> 0, opts: v.opts })));
  let lastP = -1;
  const out = await pool.play(jobs, false, (p) => { const q = Math.floor(p * 4); if (q !== lastP) { lastP = q; log(`  ${label} ${q * 25} %`); } });
  games += jobs.length * n;
  return variants.map((_, vi) => {
    let w = 0, m = 0;
    for (let j = 0; j < against.length; j++) { const o = out[vi * against.length + j]; w += o.aw + o.d / 2; m += o.aw + o.bw + o.d; }
    return { w, n: m, wr: m ? w / m : 0 };
  });
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/* ---------- 2. impact des Tox : offerts au tour 2 (tôt) ou 8 (tard), comparé à la même partie sans ---------- */
log("Impact des Tox");
const toxList = comp.tox.filter((f) => f.fam !== "smoke");
const toxVars: { fam: string; el: number; r: number; turn: number }[] = [];
for (const f of toxList) for (let r = 0; r < 4; r++) if (f.vals[r] !== null) for (const turn of [2, 8]) toxVars.push({ fam: f.fam, el: f.el ?? -1, r, turn });
const toxCtx = field.slice(0, S.field);
const toxRes: { fam: string; el: number; r: number; turn: number; d: number; lo: number; hi: number }[] = [];
{
  const variants: { deck: DeckSpec; opts?: Task["opts"] }[] = [];
  for (const d of toxCtx) {
    variants.push({ deck: d });
    for (const v of toxVars) variants.push({ deck: d, opts: { giftTox: { side: 0, turn: v.turn, fam: v.fam as never, r: v.r, el: v.el } } });
  }
  const res = await evalAll(variants, field, S.toxN, 11, "Tox");
  const per = toxVars.length + 1;
  toxVars.forEach((v, k) => {
    let dw = 0, n = 0, sq = 0;
    toxCtx.forEach((_, di) => {
      const b = res[di * per], x = res[di * per + 1 + k];
      const diff = x.wr - b.wr;
      dw += diff * x.n; n += x.n; sq += diff * diff * x.n;
    });
    const mean = dw / n;
    const sd = Math.sqrt(Math.max(1e-9, sq / n - mean * mean) / toxCtx.length);
    toxRes.push({ ...v, d: r3(mean), lo: r3(mean - 1.96 * sd), hi: r3(mean + 1.96 * sd) });
  });
}

/* ---------- 3. points d'élément : +5 au départ ---------- */
log("Valeur des points d'élément");
const ptsRes: { el: number; d: number }[] = [];
{
  const variants: { deck: DeckSpec; opts?: Task["opts"] }[] = [];
  for (const d of field) { variants.push({ deck: d }); for (let el = 0; el < 7; el++) variants.push({ deck: d, opts: { giftPts: { side: 0, el, v: 5 } } }); }
  const res = await evalAll(variants, field, S.ptsN, 23, "Éléments");
  for (let el = 0; el < 7; el++) {
    let s = 0;
    field.forEach((_, di) => { s += res[di * 8 + 1 + el].wr - res[di * 8].wr; });
    ptsRes.push({ el, d: r3(s / field.length) });
  }
}

/* ---------- 4. cartes et talents : valeur de remplacement dans les decks de la méta ---------- */
log("Valeur des cartes et des talents");
const ctx: { di: number; pos: number }[] = [];
for (let i = 0; ctx.length < S.ctx; i++) ctx.push({ di: i % field.length, pos: Math.floor(i / field.length) % 4 });
const cardRes: { num: number; wr: number; tal: { slot: number; wr: number }[]; best: number; n: number }[] = [];
{
  const variants: { deck: DeckSpec }[] = [];
  const owner: { num: number; slot: number }[] = [];
  for (const c of comp.cards) {
    const slots = talentSlots(c, 3);
    for (const slot of slots.length ? slots : [0]) {
      for (const k of ctx) {
        const base = field[k.di];
        const cards = base.cards.slice();
        const tal = (base.tal ?? base.cards.map((n) => defaultTalent(comp.byNum.get(n)!, 3))).slice();
        const at = cards.indexOf(c.num);
        if (at >= 0) { cards[at] = cards[k.pos]; tal[at] = tal[k.pos]; }
        cards[k.pos] = c.num;
        tal[k.pos] = slot;
        variants.push({ deck: { cards, lv: [3, 3, 3, 3], tal } });
      }
      owner.push({ num: c.num, slot });
    }
  }
  const res = await evalAll(variants, opps, S.cardN, 37, "Cartes");
  let vi = 0;
  const by = new Map<number, { slot: number; w: number; n: number }[]>();
  for (const o of owner) {
    let w = 0, n = 0;
    for (let k = 0; k < ctx.length; k++, vi++) { w += res[vi].w; n += res[vi].n; }
    (by.get(o.num) ?? by.set(o.num, []).get(o.num)!).push({ slot: o.slot, w, n });
  }
  for (const [num, arr] of by) {
    const best = arr.reduce((a, b) => (b.w / b.n > a.w / a.n ? b : a));
    cardRes.push({ num, wr: r3(best.w / best.n), best: best.slot, n: best.n, tal: arr.map((t) => ({ slot: t.slot, wr: r3(t.w / t.n) })) });
  }
  cardRes.sort((a, b) => b.wr - a.wr);
}

/* ---------- 5. contribution de chaque capacité (partie jouée sans elle) ---------- */
log("Contribution des capacités");
const abRes: { num: number; ab: number; d: number }[] = [];
{
  const ctxA = ctx.slice(0, Math.max(8, Math.floor(S.ctx / 2)));
  const variants: { deck: DeckSpec; opts?: Task["opts"] }[] = [];
  const owner: { num: number; ab: number }[] = [];
  const bestSlot = new Map(cardRes.map((c) => [c.num, c.best]));
  for (const c of comp.cards) {
    for (let ab = -1; ab < c.abilities.length; ab++) {
      for (const k of ctxA) {
        const base = field[k.di];
        const cards = base.cards.slice();
        const tal = (base.tal ?? base.cards.map((n) => defaultTalent(comp.byNum.get(n)!, 3))).slice();
        const at = cards.indexOf(c.num);
        if (at >= 0) { cards[at] = cards[k.pos]; tal[at] = tal[k.pos]; }
        cards[k.pos] = c.num;
        tal[k.pos] = bestSlot.get(c.num) ?? 0;
        variants.push({ deck: { cards, lv: [3, 3, 3, 3], tal }, opts: ab >= 0 ? { mute: { side: 0, card: k.pos, ab } } : undefined });
      }
      owner.push({ num: c.num, ab });
    }
  }
  const res = await evalAll(variants, opps, S.abN, 53, "Capacités");
  let vi = 0;
  let baseWr = 0;
  for (const o of owner) {
    let w = 0, n = 0;
    for (let k = 0; k < ctxA.length; k++, vi++) { w += res[vi].w; n += res[vi].n; }
    if (o.ab < 0) baseWr = w / n;
    else abRes.push({ num: o.num, ab: o.ab, d: r3(baseWr - w / n) });
  }
}

/* ---------- 6. méta « IA experte » : les meilleurs decks rejoués avec la recherche Monte-Carlo ---------- */
log("Méta IA experte (recherche Monte-Carlo des deux côtés)");
const top = field.slice(0, S.expertTop);
const items: { a: DeckSpec; b: DeckSpec; seed: number; first: 0 | 1; so: { rollouts: number; sides: [boolean, boolean] }; i: number; j: number }[] = [];
top.forEach((a, i) => top.forEach((b, j) => {
  if (i >= j) return;
  for (let g = 0; g < S.expertN; g++) items.push({ a, b, seed: 7000 + i * 131 + j * 17 + g * 7919, first: (g & 1) as 0 | 1, so: { rollouts: S.expertR, sides: [true, true] }, i, j });
}));
let lastE = -1;
const eo = await pool.map<typeof items[number], { winner: number; rollouts: number }>("search", items, (p) => { const q = Math.floor(p * 10); if (q !== lastE) { lastE = q; log(`  IA experte ${q * 10} %`); } });
const ew = top.map(() => ({ w: 0, n: 0 }));
const evs = top.map(() => top.map(() => ({ w: 0, n: 0 })));
let rollouts = 0;
eo.forEach((o, k) => {
  const { i, j } = items[k];
  const wi = o.winner === 0 ? 1 : o.winner === -1 ? 0.5 : 0;
  ew[i].w += wi; ew[i].n++; ew[j].w += 1 - wi; ew[j].n++;
  evs[i][j].w += wi; evs[i][j].n++; evs[j][i].w += 1 - wi; evs[j][i].n++;
  rollouts += o.rollouts;
});
games += rollouts;
const expert = top.map((d, i) => {
  const [lo, hi] = wilson(ew[i].w, ew[i].n);
  // même mini-championnat avec l'IA rapide (données de la méta), pour comparer
  const hv = (meta.decks[i].vs ?? []).filter((v) => v.i < top.length && v.i !== i);
  const hn = hv.reduce((p, v) => p + v.n, 0);
  const heur = hn ? hv.reduce((p, v) => p + v.wr * v.n, 0) / hn : meta.decks[i].wr;
  return { cards: d.cards, tal: d.tal, wr: r3(ew[i].w / ew[i].n), lo: r3(lo), hi: r3(hi), n: ew[i].n, heur: r3(heur), vs: evs[i].map((v, j) => (i === j ? null : r3(v.w / Math.max(1, v.n)))) };
});

const out = {
  lab: LAB_VERSION, version: ds.version, at: new Date().toISOString(), quick: QUICK, games, seconds: Math.round((Date.now() - t0) / 1000), cores: pool.size,
  ai: DEFAULT_AI,
  meta,
  expert: { decks: expert, rollouts: S.expertR, gamesPerPair: S.expertN },
  impact: { tox: toxRes, pts: ptsRes, cards: cardRes, abilities: abRes, ctx: ctx.length, opps: opps.length },
};
writeFileSync(outPath, JSON.stringify(out));
log(`terminé : ${games.toLocaleString("fr")} parties simulées → public/data/lab.json`);
pool.terminate();
}

main().catch((e) => { console.error(e); process.exit(1); });
