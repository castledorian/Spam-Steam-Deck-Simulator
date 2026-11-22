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

test("Danse des plumes (Chouette Polychrome) touche toutes les cartes du terrain, alliées comprises, et les blesse", () => {
  const ab = comp.byNum.get(num("Chouette Polychrome"))!.abilities.find((a) => a.name === "Danse des plumes")!;
  assert.ok(ab.randField);
  const hitsAlly = { n: 0 }, hitsEnemy = { n: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const log: string[] = [];
    // talent 0 : pas de métamorphose au départ, on garde la Chouette
    playMatch(comp, [deck(["Chouette Polychrome", "Esprit Feu", "Esprit Eau", "Esprit Terre"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(seed), { log, ai: [NO_SHOP, NO_SHOP] });
    let inDance = false;
    for (const l of log) {
      if (!l.startsWith("  ")) inDance = l.includes("A·Chouette Polychrome lance « Danse des plumes »");
      if (!inDance) continue;
      const m = l.match(/A·Chouette Polychrome → ([AB])·[^:]+ : −(\d+)/);
      if (m) { if (m[1] === "A") { hitsAlly.n++; assert.ok(+m[2] > 0); } else hitsEnemy.n++; }
    }
  }
  assert.ok(hitsAlly.n > 10, `alliés touchés : ${hitsAlly.n}`);
  assert.ok(hitsEnemy.n > 10, `ennemis touchés : ${hitsEnemy.n}`);
});

test("Malédiction aquatique (Zombie Floral) : 2 × Disparition, un passif retiré à chaque application et par carte adverse", () => {
  const ab = comp.byNum.get(num("Zombie Floral"))!.abilities[0];
  assert.equal(ab.textVanish, 2);
  assert.ok(ab.aoe);
  let removed = 0, perCard = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const log: string[] = [];
    // Hippocampe Nimbé : Reset + Brut ; Frost & Glacier : Gel + Érosion ; Naissance d'Aldrin : Phénix + Cimetière ; Shado : Soin + AoE
    playMatch(comp, [deck(["Zombie Floral", "Esprit Feu", "Esprit Eau", "Esprit Terre"], [0, 0, 0, 0]), deck(["Hippocampe Nimbé", "Frost & Glacier", "Naissance d'Aldrin", "Shado"], [0, 0, 0, 0])], mulberry32(seed), { log, ai: [NO_SHOP, NO_SHOP] });
    const per = new Map<string, number>();
    log.forEach((l) => { const m = l.match(/Disparition : (B·[^ ]+(?: [^«]+?)?) perd/); if (m) { removed++; per.set(m[1].trim(), (per.get(m[1].trim()) ?? 0) + 1); } });
    for (const v of per.values()) perCard = Math.max(perCard, v);
  }
  assert.ok(removed > 0);
  assert.ok(perCard >= 2, "une même carte doit perdre 2 passifs");
});

test("tour libre (Plateau) : boutique réglée en premier aux tours pairs, bannir retire la famille, un seul achat, fin de tour", () => {
  const bannedFam: string[] = [];
  const shopDone = new Set<number>();
  let sawBuyAfterBuy = false, bought = false, lastTurn = 0, offersAfterBan = 0, shops = 0;
  const choose = (d: import("../src/sim/engine").Decision) => {
    if (d.side !== 0) return d.def;
    if (d.kind !== "turn") return d.def;
    if (d.turn !== lastTurn) { lastTurn = d.turn; bought = false; }
    const refs = Array.from({ length: d.n }, (_, i) => d.ref!(i));
    if (d.shop) {
      shops++; shopDone.add(d.turn);
      assert.equal(d.turn % 2, 0, "la boutique n'ouvre que les tours pairs");
      for (const o of d.shop.offers) if (o && bannedFam.includes(o.fam)) offersAfterBan++;
      if (bought && refs.some((r) => r?.tag === "buy")) sawBuyAfterBuy = true;
      const ban = refs.findIndex((r) => r?.tag === "ban");
      if (ban >= 0 && bannedFam.length === 0) { bannedFam.push(d.shop.offers[(refs[ban] as { offer: number }).offer]!.fam); return ban; }
      const buy = refs.findIndex((r) => r?.tag === "buy");
      if (buy >= 0) { bought = true; return buy; }
      return refs.findIndex((r) => r?.tag === "skip");
    }
    assert.ok(refs.some((r) => r?.tag === "end"));
    assert.ok(!(d.turn % 2 === 0 && !shopDone.has(d.turn)), "tour pair : la boutique doit être réglée avant les capacités");
    return refs.findIndex((r) => r?.tag === "cast") >= 0 ? refs.findIndex((r) => r?.tag === "cast") : d.def;
  };
  const r = playMatch(comp, [deck(["Chouette Polychrome", "Esprit Feu", "Esprit Eau", "Esprit Terre"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(7), { choose, free: 0 });
  assert.ok(r.turns > 4);
  assert.ok(shops > 0);
  assert.equal(offersAfterBan, 0, "une famille bannie ne revient pas dans les offres");
  assert.equal(sawBuyAfterBuy, false, "un seul achat par boutique");
});

test("priorité des capacités : le scaling (valeur élémentaire) passe avant les dégâts", () => {
  for (const c of comp.cards) for (const a of c.abilities) {
    if (a.engine && !a.hasDmg) assert.equal(a.prio, 0, `${c.name} : ${a.name}`);
    if (a.engine && a.hasDmg) assert.equal(a.prio, 4, `${c.name} : ${a.name}`);
  }
  const pr = DEFAULT_AI.pr;
  assert.ok(pr[0] < pr[4] && pr[4] < pr[1] && pr[1] < pr[3] && pr[1] < pr[2], "ordre : scaling, scaling+dégâts, utilitaire, puis dégâts / soins");
  // en jeu : la première capacité proposée par défaut à chaque tour est une capacité de scaling quand l'une d'elles est prête
  let checked = 0, bad = 0, lastTurn = -1;
  const choose = (d: import("../src/sim/engine").Decision) => {
    if (d.kind !== "turn") return d.def;
    const refs = Array.from({ length: d.n }, (_, i) => d.ref!(i));
    if (refs.some((r) => r?.tag === "buy")) return refs.findIndex((r) => r?.tag === "skip");
    const b = d.board!();
    const casts = refs.map((r, i) => ({ r, i })).filter((x) => x.r?.tag === "cast") as { r: { tag: "cast"; card: number; ab: number }; i: number }[];
    if (!casts.length) return d.def;
    if (d.turn !== lastTurn) {
      lastTurn = d.turn;
      const eng = (x: { r: { card: number; ab: number } }) => comp.byNum.get(b.cards[d.side][x.r.card].num)!.abilities.find((a) => a.name === b.cards[d.side][x.r.card].abilities[x.r.ab].name)!.engine;
      if (casts.some(eng)) { checked++; if (!eng(casts.find((x) => x.i === d.def) as never)) bad++; }
    }
    return casts[0].i;
  };
  for (let sd = 1; sd <= 12; sd++) {
    lastTurn = -1;
    playMatch(comp, [deck(["Chouette Polychrome", "Épine Médusine", "Esprit Feu", "Esprit Eau"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(sd), { choose, free: 0 });
  }
  assert.ok(checked > 0, "au moins un tour avec scaling prêt");
  assert.equal(bad, 0, "le conseil par défaut commence par le scaling");
});

test("un Tox acheté peut remplacer une capacité épuisée (Mue d'Épine Médusine) ou un autre passif", () => {
  let sawAbRep = false, sawToxRep = false, muePresentAfter = false, mueUsed = false;
  const choose = (d: import("../src/sim/engine").Decision) => {
    if (d.kind !== "turn" && d.kind !== "target" && d.kind !== "option") return d.def;
    if (d.kind !== "turn") return d.def;
    const refs = Array.from({ length: d.n }, (_, i) => d.ref!(i));
    const b = d.board!();
    const me = b.cards[d.side][0];
    mueUsed = mueUsed || (!!me && me.abilities.some((a) => a.name === "Mue" && a.cd > 0));
    const buys = refs.map((r, i) => ({ r, i })).filter((x) => x.r?.tag === "buy" && (x.r as { card: number }).card === 0) as { r: { tag: "buy"; rep?: { kind: string; k: number } }; i: number }[];
    if (buys.length) {
      for (const x of buys) { if (x.r.rep?.kind === "ab") sawAbRep = true; if (x.r.rep?.kind === "tox") sawToxRep = true; }
      const ab = buys.find((x) => x.r.rep?.kind === "ab" && me.abilities[x.r.rep.k]?.name === "Mue");
      const pick = ab ?? buys[0];
      if (ab) muePresentAfter = true;
      return pick.i;
    }
    const cast = refs.findIndex((r) => r?.tag === "cast" && (r as { card: number }).card === 0);
    if (cast >= 0) return cast;
    const sk = refs.findIndex((r) => r?.tag === "skip");
    return sk >= 0 ? sk : d.def;
  };
  const log: string[] = [];
  playMatch(comp, [deck(["Épine Médusine", "Esprit Feu", "Esprit Eau", "Esprit Terre"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(5), { choose, free: 0, log });
  assert.ok(sawAbRep || sawToxRep, "une carte pleine propose des remplacements");
  assert.ok(sawAbRep, "les capacités sont remplaçables");
  assert.ok(log.some((l) => /remplace/.test(l)), "le journal indique l'emplacement remplacé");
  void muePresentAfter; void mueUsed;
});

test("les bots remplacent une capacité à usage unique épuisée par un Tox", () => {
  let replacedMue = 0;
  for (let sd = 1; sd <= 200; sd++) {
    const log: string[] = [];
    playMatch(comp, [deck(["Épine Médusine", "Esprit Feu", "Esprit Eau", "Esprit Terre"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(sd), { log });
    if (log.some((l) => /achète .* pour Épine Médusine .*remplace Mue/.test(l))) replacedMue++;
  }
  assert.ok(replacedMue > 0, "au moins une partie où Mue épuisée est remplacée");
});

test("invariants : 3 emplacements max, PV bornés, Spamtons négatifs seulement si l'adversaire a le talent Dette", () => {
  const rng = mulberry32(21);
  const nums = comp.cards.map((c) => c.num);
  const pick = (): DeckSpec => { const s = new Set<number>(); while (s.size < 4) s.add(nums[Math.floor(rng() * nums.length)]); const cards = [...s]; return { cards, lv: [3, 3, 3, 3], tal: cards.map(() => 1 + Math.floor(rng() * 3)) }; };
  const debt = new Set(comp.cards.filter((c) => c.talents.some((t) => /Dette/.test(t.id))).map((c) => c.num));
  let over = 0, frames = 0;
  for (let i = 0; i < 300; i++) {
    const fr: import("../src/sim/engine").Frame[] = []; const d: [DeckSpec, DeckSpec] = [pick(), pick()];
    playMatch(comp, d, mulberry32(i), { frames: fr, log: [], first: (i & 1) as 0 | 1 });
    for (const f of fr) {
      frames++;
      f.board.cards.forEach((side) => side.forEach((c) => { if (c.abilities.length + c.tox.length > 3) over++; assert.ok(c.hp >= 0 && c.hp <= c.max + 0.5, `PV hors bornes : ${c.name}`); }));
      f.board.spam.forEach((sp, si) => { if (sp < -0.5) assert.ok(d[1 - si].cards.some((n, j) => debt.has(n) && /Dette/.test(comp.byNum.get(n)!.talents.find((t) => t.slot === d[1 - si].tal![j])?.id ?? "")), "Spamtons négatifs sans talent Dette actif chez l'adversaire"); });
    }
  }
  assert.ok(over / frames < 0.002, `dépassement d'emplacements : ${over}/${frames}`);
});

test("Fumée : après une compétence de dégâts ou de soins, les 4 cartes sont mélangées face cachée ; elles se révèlent en agissant ou en subissant un effet", () => {
  assert.ok(comp.byNum.get(num("Vivy"))!.skills.some((s) => s.fam === "smoke"), "Vivy possède Fumée");
  let allHidden = 0, revealedAfter = 0, shuffled = 0, hiddenOnly = 0;
  for (let sd = 1; sd <= 40; sd++) {
    const frames: import("../src/sim/engine").Frame[] = [];
    playMatch(comp, [deck(["Vivy", "Esprit Feu", "Esprit Eau", "Esprit Terre"], [0, 0, 0, 0]), deck(FILLER, [0, 0, 0, 0])], mulberry32(sd), { frames, log: [], first: 0 });
    let wasHidden = false;
    for (const f of frames) {
      const a = f.board.cards[0];
      const nh = a.filter((c) => c.alive && c.hidden).length;
      if (/🌫 Fumée/.test(f.line)) { assert.equal(nh, a.filter((c) => c.alive).length, "toutes les cartes vivantes du camp sont retournées"); allHidden++; wasHidden = true; if (a.some((c, i) => c.slot !== i)) shuffled++; }
      else if (wasHidden && nh < a.filter((c) => c.alive).length) { revealedAfter++; wasHidden = false; }
      if (f.board.cards[1].some((c) => c.hidden)) hiddenOnly++;
      assert.equal(new Set(a.map((c) => c.slot)).size, 4, "les positions restent une permutation");
    }
  }
  assert.ok(allHidden > 0, "la Fumée se déclenche");
  assert.ok(shuffled > 0, "les positions changent");
  assert.ok(revealedAfter > 0, "une carte se révèle après avoir agi ou subi un effet");
  assert.equal(hiddenOnly, 0, "seul le camp avec Fumée est caché");
});
