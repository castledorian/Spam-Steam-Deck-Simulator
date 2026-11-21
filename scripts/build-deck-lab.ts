// Régénère public/deck-lab.html à partir du snapshot actuel, sans réseau.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeSnapshot } from "../src/lib/snapshot";
import type { Snapshot } from "../src/lib/types";

const ROOT = join(__dirname, "..");
const snap = normalizeSnapshot(JSON.parse(readFileSync(join(ROOT, "src/data/seed.json"), "utf8")) as Snapshot);
const tpl = readFileSync(join(ROOT, "scripts/deck-lab.template.html"), "utf8");
mkdirSync(join(ROOT, "public"), { recursive: true });
const html = tpl.replace("/*__DB__*/null", JSON.stringify(snap).replace(/<\//g, "<\\/"));
// public/deck-lab.html pour le site Next ; index.html à la racine pour GitHub Pages.
writeFileSync(join(ROOT, "public/deck-lab.html"), html);
writeFileSync(join(ROOT, "index.html"), html);
console.log(`deck-lab.html + index.html : ${snap.cards.length} cartes`);
