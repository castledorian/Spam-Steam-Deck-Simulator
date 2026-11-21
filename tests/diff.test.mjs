import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkDataset, diffDatasets } from "../scripts/diff.mjs";

const ds = JSON.parse(readFileSync(new URL("../public/data/dataset.json", import.meta.url), "utf8"));

test("le jeu de données publié passe les contrôles", () => {
  assert.deepEqual(checkDataset(ds, ds), []);
  assert.equal(ds.language, "fr");
});

test("aucune différence entre deux copies identiques", () => {
  assert.equal(diffDatasets(ds, ds).length, 0);
  assert.equal(diffDatasets(null, ds).length, 0, "la première version n'a pas de patch");
});

test("les changements de PV, capacités, talents et cartes sont détectés", () => {
  const b = structuredClone(ds);
  b.cards[0].hp += 50;
  b.cards[1].abilities[0].cooldown += 1;
  b.cards[2].talents[0].effect = "nouveau";
  const gone = b.cards.pop();
  const kinds = diffDatasets(ds, b).map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["capacite", "pv", "retrait", "talent"]);
  assert.ok(diffDatasets(b, ds).some((c) => c.kind === "ajout" && c.name === gone.name));
});

test("une capacité retirée sans remplacement est signalée", () => {
  const b = structuredClone(ds);
  const card = b.cards.find((c) => c.abilities.length >= 2);
  const removed = card.abilities.pop();
  assert.ok(diffDatasets(ds, b).some((c) => c.label.includes(removed.name) && c.label.includes("retirée")));
});

test("un jeu de données anormal est rejeté", () => {
  const b = structuredClone(ds);
  b.cards = b.cards.slice(0, 40);
  b.cards[0].hp = 0;
  const e = checkDataset(b, ds);
  assert.ok(e.some((x) => x.includes("Seulement 40")));
  assert.ok(e.some((x) => x.includes("Chute")));
  assert.ok(e.some((x) => x.includes("PV invalides")));
});
