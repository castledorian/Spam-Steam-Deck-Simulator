// Tests du moteur de simulation sur les données officielles publiées avec le site.
// Lancement : npx tsx --test tests/engine.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile, type RawDataset } from "../src/sim/compile";
import { DEFAULT_AI, mulberry32, playMatch, type DeckSpec, type Snapshot } from "../src/sim/engine";

const ds = JSON.parse(readFileSync(new URL("../public/data/dataset.json", import.meta.url), "utf8")) as RawDataset;
const comp = compile(ds);
const num = (prefix: string) => {
  const c = comp.cards.find((x) => x.name.startsWith(prefix));
  assert.ok(c, `carte introuvable : ${prefix}`);
  return c.num;
};
const deck = (names: string[], tal?: number[]): DeckSpec => ({ cards: names.map(num), lv: [3, 3, 3, 3], tal });
const FILLER = ["Esprit Ombre", "Esprit Nature", "Hibernatus", "Esprit Lumière"];
/** IA qui n'achète jamais de Tox (pour isoler l'effet d'une capacité). */
const NO_SHOP = { ...DEFAULT_AI, shopThr: 1e9 };

test("aucune erreur ni valeur aberrante sur 3 000 parties aléatoires", () => {
  const rng = mulberry32(99);
  const nums = comp.cards.map((c) => c.num);
  for (let i = 0; i < 3000; i++) {
    const pick = (): DeckSpec => {
      const s = new Set<number>();
      while (s.size < 4) s.add(nums[Math.floor(rng() * nums.length)]);
      const cards = [...s];
      return { cards, lv: [3, 3, 3, 3], tal: cards.map(() => 1 + Math.floor(rng() * 3)) };
    };
    const trace: Snapshot[] = [];
    const r = playMatch(comp, [pick(), pick()], mulberry32(i), { trace, first: (i & 1) as 0 | 1 });
    assert.ok(r.turns > 0 && r.turns <= 100);
    for (const t of trace) for (const side of t.hp) for (const hp of side) assert.ok(Number.isFinite(hp), "PV non numériques");
  }
});

test("une même graine rejoue exactement la même partie", () => {
  const a = deck(["Moxilys", "Esprit Feu", "Esprit Eau", "Esprit Terre"]);
  const b = deck(FILLER);
  const l1: string[] = [], l2: string[] = [];
  playMatch(comp, [a, b], mulberry32(42), { log: l1 });
  playMatch(comp, [a, b], mulberry32(42), { log: l2 });
  assert.deepEqual(l1, l2);
});

test("les capacités « toutes les cartes adverses » frappent toutes les cartes", () => {
  const ab = comp.byNum.get(num("Moxilys"))!.abilities.find((a) => a.name === "Idée sombre")!;
  assert.ok(ab.aoe);
  assert.equal(comp.cards.reduce((n, c) => n + c.abilities.filter((a) => a.aoe).length, 0) >= 20, true);
  let most = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const log: string[] = [];
    playMatch(comp, [deck(["Moxilys", "Esprit Feu", "Esprit Eau", "Esprit Terre"]), deck(FILLER)], mulberry32(seed), { log });
    log.forEach((l, i) => {
      if (!l.includes("« Idée sombre »") || l.includes("raté")) return;
      const hits = new Set<string>();
      for (let k = i + 1; k < log.length && log[k].startsWith("  "); k++) { const m = log[k].match(/→ (B·[^:]+) :/); if (m) hits.add(m[1]); }
      most = Math.max(most, hits.size);
    });
  }
  assert.equal(most, 4, `au mieux ${most} cibles touchées par un même lancer`);
});

test("une capacité « Choix » n'applique qu'une seule option", () => {
  const king = comp.byNum.get(num("Roi Feu"))!.abilities.find((a) => a.options)!;
  assert.equal(king.options!.length, 3);
  const trace: Snapshot[] = [];
  const log: string[] = [];
  playMatch(comp, [deck(["Roi Feu", "Esprit Eau", "Esprit Terre", "Esprit Ombre"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(5), { trace, log, terrain: 3, first: 0, ai: [NO_SHOP, NO_SHOP] });
  const fire = trace.filter((t) => t.side === 0).map((t) => t.pts[0][0]);
  for (let k = 1; k < fire.length; k++) assert.ok(fire[k] - fire[k - 1] <= 20, `+${fire[k] - fire[k - 1]} Feu en un tour (trois options appliquées ?)`);
});

test("un seul talent est actif : Baleine bleue (+200 PV) uniquement si elle est choisie", () => {
  const card = comp.cards.find((c) => c.talents.some((t) => t.id.startsWith("Baleine bleue")) && c.talents.length >= 2)!;
  const slot = card.talents.find((t) => t.id.startsWith("Baleine bleue"))!.slot;
  const other = card.talents.find((t) => t.slot !== slot && !/HP|PV|Cavalerie|Imprudent|Vitalit/i.test(t.id + t.text))!.slot;
  const maxAt = (s: number) => {
    const trace: Snapshot[] = [];
    playMatch(comp, [{ cards: [card.num, ...FILLER.slice(0, 3).map(num)], lv: [3, 3, 3, 3], tal: [s, 0, 0, 0] }, deck(FILLER, [0, 0, 0, 0])], mulberry32(3), { trace, first: 0 });
    return trace[0].max[0][0];
  };
  assert.equal(maxAt(slot) - maxAt(other), 200);
});

test("l'Immunité ne bloque pas les dégâts directs", () => {
  const imm = comp.cards.find((c) => c.skills.some((s) => s.fam === "immunity"));
  assert.ok(imm, "aucune carte ne commence avec Immunité");
  let hit = 0;
  for (let s = 0; s < 20 && !hit; s++) {
    const log: string[] = [];
    playMatch(comp, [deck(["Moxilys", "Esprit Feu", "Esprit Eau", "Esprit Terre"]), { cards: [imm.num, ...["Esprit Nature", "Hibernatus", "Esprit Lumière"].map(num)], lv: [3, 3, 3, 3] }], mulberry32(s), { log });
    hit += log.filter((l) => l.includes(`→ B·${imm.name} : −`)).length;
  }
  assert.ok(hit > 0, `${imm.name} n'a jamais subi de dégâts`);
});

test("le Gel est appliqué par les capacités dont le texte l'indique", () => {
  assert.equal(comp.byNum.get(num("Guerrier des Neiges"))!.abilities.some((a) => a.freeze === 1), true);
  let thaw = 0;
  for (let s = 0; s < 10; s++) {
    const log: string[] = [];
    playMatch(comp, [deck(["Guerrier des Neiges", "Artisan des Heures", "Esprit Eau", "Esprit Terre"]), deck(FILLER)], mulberry32(s), { log });
    thaw += log.filter((l) => l.includes("❄")).length;
  }
  assert.ok(thaw > 0, "aucune glace brisée en 10 parties");
});

test("le premier joueur n'a pas d'avantage massif (alternance équitable)", () => {
  let w0 = 0, n = 0;
  const nums = comp.cards.map((c) => c.num);
  const rng = mulberry32(1);
  for (let i = 0; i < 1500; i++) {
    const p = (): DeckSpec => { const s = new Set<number>(); while (s.size < 4) s.add(nums[Math.floor(rng() * nums.length)]); return { cards: [...s], lv: [3, 3, 3, 3] }; };
    const r = playMatch(comp, [p(), p()], mulberry32(i + 5), { first: 0 });
    if (r.winner === 0) w0++;
    if (r.winner !== -1) n++;
  }
  const share = w0 / n;
  assert.ok(share > 0.4 && share < 0.65, `le premier joueur gagne ${(share * 100).toFixed(1)} %`);
});

test("IA experte : la position est rejouée à l'identique avant chaque option testée", async () => {
  const { makeTape, replayChooser, searchMatch } = await import("../src/sim/search");
  const a = deck(["Moxilys", "Esprit Feu", "Esprit Eau", "Esprit Terre"]);
  const b = deck(FILLER);
  // une partie avec des choix imposés, puis rejouée depuis la bande enregistrée : même déroulé
  const hist: number[] = [];
  const t = makeTape(5);
  const l1: string[] = [];
  playMatch(comp, [a, b], t.rng, { first: 0, log: l1, choose: (d) => { const c = (d.def + 1) % d.n; hist.push(c); return c; } });
  const l2: string[] = [];
  playMatch(comp, [a, b], makeTape(123, t.vals, t.vals.length, false).rng, { first: 0, log: l2, choose: replayChooser(hist) });
  assert.deepEqual(l2, l1);
  // une partie analysée se termine et chaque décision a une estimation par option
  const r = searchMatch(comp, [a, b], 9, { rollouts: 4, sides: [true, true] }, { first: 1 });
  assert.ok(r.result.turns > 0 && r.decisions.length > 0);
  for (const d of r.decisions) assert.ok(d.chosen >= 0 && d.chosen < d.labels.length && !Number.isNaN(d.wr[d.chosen]));
});
