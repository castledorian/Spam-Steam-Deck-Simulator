// Synchronisation complète des données, sans base de données.
//   npm run sync            → met à jour src/data/seed.json, public/deck-lab.html et les images
//   npm run sync -- --check → vérifie seulement (aucune écriture)
// Code de sortie ≠ 0 si le nouveau snapshot échoue aux contrôles : le précédent reste publié.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildSnapshot } from "../src/lib/sync";
import { checkSnapshot, contentKey, normalizeSnapshot } from "../src/lib/snapshot";
import { cardName } from "../src/lib/fr";
import type { Snapshot } from "../src/lib/types";

const ROOT = join(__dirname, "..");
const SEED = join(ROOT, "src/data/seed.json");
const REFRESH_HOURS = 20; // republie au moins une fois par jour même sans changement (horodatage de vérification)
const checkOnly = process.argv.includes("--check");

function diff(prev: Snapshot | undefined, next: Snapshot): string[] {
  if (!prev) return ["Premier snapshot"];
  const out: string[] = [];
  const before = new Map(prev.cards.map((c) => [c.slug, c]));
  const after = new Map(next.cards.map((c) => [c.slug, c]));
  for (const [slug, c] of after) if (!before.has(slug)) out.push(`+ Nouvelle carte : ${cardName(c)}`);
  for (const [slug, c] of before) if (!after.has(slug)) out.push(`- Carte retirée : ${cardName(c)}`);
  for (const [slug, c] of after) {
    const o = before.get(slug);
    if (!o) continue;
    if (o.hp !== c.hp) out.push(`~ ${cardName(c)} : PV ${o.hp} → ${c.hp}`);
    if (o.spamton !== c.spamton) out.push(`~ ${cardName(c)} : Spamtons ${o.spamton} → ${c.spamton}`);
    if (JSON.stringify(o.abilities.map((a) => a.sim)) !== JSON.stringify(c.abilities.map((a) => a.sim))) out.push(`~ ${cardName(c)} : capacités modifiées`);
    if (!o.fr && c.fr) out.push(`fr ${cardName(c)} : textes français ajoutés`);
  }
  const oldPatches = new Set(prev.patches.map((p) => p.id));
  for (const p of next.patches) if (!oldPatches.has(p.id)) out.push(`+ Patch ${p.version} (${p.date}) : ${p.title}`);
  if (prev.dataExtracted !== next.dataExtracted) out.push(`Données client : ${prev.dataExtracted} → ${next.dataExtracted}`);
  return out;
}

async function download(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest)) return false;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return false;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

function buildDeckLab(s: Snapshot) {
  const tpl = readFileSync(join(ROOT, "scripts/deck-lab.template.html"), "utf8");
  // « </ » échappé pour qu'aucun texte de carte ne puisse fermer la balise <script>.
  const json = JSON.stringify(s).replace(/<\//g, "<\\/");
  writeFileSync(join(ROOT, "public/deck-lab.html"), tpl.replace("/*__DB__*/null", json));
}

(async () => {
  const prev = existsSync(SEED) ? (JSON.parse(readFileSync(SEED, "utf8")) as Snapshot) : undefined;
  const next = normalizeSnapshot(await buildSnapshot());
  const errors = checkSnapshot(next, prev);
  const changes = diff(prev, next);
  const fr = next.frCoverage;
  const report = [
    `Patch ${next.gameVersion} · ${next.cards.length} cartes · ${next.tox.length} Tox · ${next.talents.length} talents · ${next.patches.length} patchs`,
    fr ? `Français : ${fr.cards}/${fr.cardsTotal} cartes, ${fr.tox} Tox, ${fr.talents} talents${fr.warnings.length ? ` (${fr.warnings.length} avertissements)` : ""}` : "Français : non récupéré",
    ...changes.slice(0, 60),
    ...(errors.length ? ["", "ERREURS BLOQUANTES :", ...errors] : []),
  ].join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + report + "\n```\n");
  if (errors.length) process.exit(1);
  if (checkOnly) return;

  const unchanged = prev && contentKey(prev) === contentKey(next);
  const ageH = prev ? (Date.now() - new Date(prev.fetchedAt).getTime()) / 3600000 : Infinity;
  if (unchanged && ageH < REFRESH_HOURS) {
    console.log("Aucun changement : rien à publier.");
    return;
  }
  writeFileSync(SEED, JSON.stringify(next, null, 1) + "\n");
  buildDeckLab(next);

  let img = 0;
  await Promise.all(next.cards.map(async (c) => c.image && (await download(c.image, join(ROOT, "public/cards", `${c.slug}.webp`))) && img++));
  await Promise.all(next.tox.map(async (t) => t.icon && (await download(`https://metabot.gg/web/spam/tox/${t.icon}`, join(ROOT, "public/tox", t.icon))) && img++));
  console.log(`${img} images téléchargées.`);
  writeFileSync(join(ROOT, ".sync-message"), (unchanged ? "Données : vérification quotidienne (aucun changement)" : `Données : ${changes[0] ?? "mise à jour"}${changes.length > 1 ? ` (+${changes.length - 1})` : ""}`) + "\n\n" + report + "\n");
})().catch((e) => {
  console.error("Échec de la synchronisation :", e instanceof Error ? e.message : e);
  process.exit(1);
});
