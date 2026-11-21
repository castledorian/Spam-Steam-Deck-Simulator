import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachFrench, parseCardPageFr, refreshFrenchAfterPatches } from "../src/lib/parse-fr";
import { toxKey } from "../src/lib/parse";
import { patchFieldFr, cardName, talentFr } from "../src/lib/fr";
import { normalizeSnapshot, checkSnapshot } from "../src/lib/snapshot";
import { validateDeckCoverage } from "../src/lib/sim/search";
import type { Snapshot } from "../src/lib/types";

const seed = () => normalizeSnapshot(JSON.parse(readFileSync("src/data/seed.json", "utf8")) as Snapshot);

// Fragment reprenant la structure des fiches metabot.gg (classes identiques en EN et FR).
const FR_PAGE = `
<p class="txmLEG_description">Esprit Feu (Commune, Feu) est une carte SPAM avec 500 PV, 10 Spamtons par tour.</p>
<div data-section="abilities">
<article class="VprGlq_ability"><h3 class="VprGlq_abilityName">Souffle de feu</h3><p class="VprGlq_effect">Inflige 10 dégâts de Feu<br>Bonus Feu (+1)</p></article>
<article class="VprGlq_ability"><h3 class="VprGlq_abilityName">Flambée</h3><p class="VprGlq_effect">Bonus Feu (+1)</p></article>
</div>
<div data-section="tox"><ul><li><a class="yGck4G_toxChip" href="/fr_FR/spam/tox/fireheart">Cœur de feu (Commune)</a><span class="VprGlq_effect">Bonus Feu (+X) par tour</span></li></ul></div>
<div data-section="talents"><ul>
<li><span class="VprGlq_talentSlot">1</span><a class="VprGlq_talentName" href="#">Cœur FEU</a><span class="x"><span class="VprGlq_effect">Commence la partie avec le passif « Cœur de feu »</span></span></li>
<li class="VprGlq_talentBest"><span class="VprGlq_talentSlot">2</span><a class="VprGlq_talentName" href="#">Terrain aquatique</a><span class="x"><span class="VprGlq_effect">Bonus Eau (+7).</span></span></li>
</ul></div>
<div data-section="resistances"></div>`;

test("parseCardPageFr lit nom, capacités, Tox et talents", () => {
  const p = parseCardPageFr(FR_PAGE)!;
  assert.equal(p.name, "Esprit Feu");
  assert.deepEqual(p.abilities.map((a) => a.name), ["Souffle de feu", "Flambée"]);
  assert.deepEqual(p.abilities[0].lines, ["Inflige 10 dégâts de Feu", "Bonus Feu (+1)"]);
  assert.equal(p.startTox[0].id, "fireheart");
  assert.equal(p.startTox[0].name, "Cœur de feu");
  assert.equal(p.talents[1].slot, 2);
  assert.equal(p.talents[1].name, "Terrain aquatique");
});

test("attachFrench garde l'anglais intact et ignore les incohérences", () => {
  const s = seed();
  const card = s.cards.find((c) => c.slug === "fire-spirit")!;
  const simBefore = JSON.stringify(card.abilities.map((a) => a.sim));
  const fr = new Map([["fire-spirit", parseCardPageFr(FR_PAGE)!]]);
  const r = attachFrench(s.cards, fr, s.tox, new Map(), s.talents, []);
  assert.equal(r.cards, 1);
  assert.equal(cardName(card), "Esprit Feu");
  assert.equal(card.name, "Fire Spirit", "le nom anglais reste la clé du moteur");
  assert.equal(JSON.stringify(card.abilities.map((a) => a.sim)), simBefore);
  assert.equal(talentFr(card, 2).name, "Terrain aquatique");
  assert.ok(r.warnings.some((w) => w.includes("page française indisponible")));
  refreshFrenchAfterPatches(s.cards, s.talents, s.tox);
  assert.equal(card.fr?.startTox.length, card.startTox.length);
});

test("toxKey relie les noms de talents aux familles de Tox", () => {
  assert.equal(toxKey("Fire Heart").key, toxKey("Fireheart").key);
  assert.deepEqual(toxKey("Rare AOE"), { key: "aoe", rarity: "Rare" });
  const s = seed();
  const keys = new Set(s.tox.flatMap((t) => [toxKey(t.name).key, toxKey(t.id).key]));
  const missing = s.cards.flatMap((c) => c.talents.filter((t) => t.startTox && !keys.has(toxKey(t.startTox).key)).map((t) => `${c.slug}:${t.startTox}`));
  assert.deepEqual(missing, []);
});

test("le snapshot embarqué passe les contrôles d'intégrité", () => {
  assert.deepEqual(checkSnapshot(seed()), []);
});

test("les avertissements reflètent le talent réellement utilisé par le moteur", () => {
  const s = seed();
  const card = s.cards.find((c) => c.talents.some((t) => t.best && !t.modeled))!;
  const w = validateDeckCoverage(s, { s: [card.slug], l: [3] }).validationWarnings;
  assert.ok(w.some((x) => x.includes("non modélisé")), w.join("\n"));
});

test("glossaire des notes de patch", () => {
  assert.equal(patchFieldFr("HP"), "PV");
  assert.equal(patchFieldFr("Shop cost (Epic)"), "Coût en boutique (Épique)");
  assert.equal(patchFieldFr("Fire resistance"), "Résistance Feu");
  assert.equal(patchFieldFr("Earth and Light resistance"), "Résistance Terre et Lumière");
  assert.equal(patchFieldFr("Quakecry · Earth damage"), "Quakecry · dégâts Terre");
  assert.equal(patchFieldFr("Lava-flow · critical multiplier"), "Lava-flow · multiplicateur de critique");
});
