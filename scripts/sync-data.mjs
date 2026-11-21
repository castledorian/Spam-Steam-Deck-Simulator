// Synchronisation avec le SpamDex officiel (https://spamgame.com/data/).
//   node scripts/sync-data.mjs           → met à jour public/data/ si une nouvelle version existe
//   node scripts/sync-data.mjs --force   → retélécharge tout
// Écrit dans public/data/ : dataset.json (dernière version, en français), layout.json,
// patches.json (différences entre chaque version) et status.json (non versionné).
// Écrit « changed=true|false » dans $GITHUB_OUTPUT pour le workflow.
// Aucune dépendance : Node 20+.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffDatasets, checkDataset } from "./diff.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/data");
const BASE = "https://spamgame.com/data/";
const LANG = "fr";
const force = process.argv.includes("--force");

async function getJson(url, ms = 30000) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "SpamLab-fan-project/1.0 (non officiel)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
  throw last;
}

const readLocal = (f, fallback) => {
  try {
    return JSON.parse(readFileSync(join(OUT, f), "utf8"));
  } catch {
    return fallback;
  }
};

function output(changed) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

const index = await getJson(BASE + "index.json");
if (index.schema !== 1) throw new Error("Schéma SpamDex non supporté : " + index.schema);
if (!index.languages?.includes(LANG)) throw new Error(`Langue « ${LANG} » absente du SpamDex`);
const path = (v) => index.cards.replace("{version}", v).replace("{language}", LANG);

const local = readLocal("dataset.json", null);
const localPatches = readLocal("patches.json", []);
const known = new Set(localPatches.map((p) => p.version));
const missingPatches = index.versions.filter((v) => !known.has(v.version));
const upToDate = local && local.version === index.latest && missingPatches.length === 0;

writeFileSync(
  join(OUT, "status.json"),
  JSON.stringify({ latest: index.latest, checkedAt: new Date().toISOString(), versions: index.versions.length }) + "\n",
);

if (upToDate && !force) {
  console.log(`À jour : version ${index.latest} (${index.versions.length} versions dans l'historique).`);
  output(false);
  process.exit(0);
}

// Historique : chaque version est comparée à la précédente. Les patchs déjà calculés sont réutilisés ;
// seules les versions nécessaires sont téléchargées (mémorisées pour ne pas les charger deux fois).
const cache = new Map();
const load = (v) => {
  if (!cache.has(v)) cache.set(v, getJson(BASE + path(v)));
  return cache.get(v);
};
const patches = [];
for (let i = 0; i < index.versions.length; i++) {
  const v = index.versions[i];
  const cached = !force && localPatches.find((p) => p.version === v.version);
  if (cached) {
    patches.push(cached);
    continue;
  }
  const ds = await load(v.version);
  const prevVersion = i > 0 ? index.versions[i - 1].version : null;
  const prev = prevVersion ? await load(prevVersion).catch(() => null) : null;
  const changes = diffDatasets(prev, ds);
  const summary = {};
  for (const c of changes) summary[c.kind] = (summary[c.kind] ?? 0) + 1;
  patches.push({ version: v.version, previous: prevVersion, generatedAt: v.generatedAt, cardCount: ds.cards.length, changes, summary });
  console.log(`Patch ${v.version} : ${changes.length} changements`);
}
const latest = await load(index.latest);

const errors = checkDataset(latest, local);
if (errors.length) {
  console.error("Données rejetées, la version précédente reste en ligne :\n- " + errors.join("\n- "));
  process.exit(1);
}

let layout = readLocal("layout.json", null);
try {
  layout = await getJson(BASE + (index.layout ?? "layout.json"));
} catch (e) {
  if (!layout) throw e;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "dataset.json"), JSON.stringify(latest) + "\n");
writeFileSync(join(OUT, "layout.json"), JSON.stringify(layout) + "\n");
patches.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
writeFileSync(join(OUT, "patches.json"), JSON.stringify(patches) + "\n");

const msg = `Données officielles ${latest.version} (${latest.cards.length} cartes, ${patches.length} versions)`;
console.log(msg);
writeFileSync(join(ROOT, ".sync-message"), msg + "\n");
output(true);
