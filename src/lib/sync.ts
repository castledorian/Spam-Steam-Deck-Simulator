import { applyPatches, parseCardPage, parsePatch, parseTalentsPage, parseToxPage } from "./parse";
import { attachFrench, parseCardPageFr, parseToxPageFr, refreshFrenchAfterPatches, type CardPageFr } from "./parse-fr";
import type { Card, Snapshot } from "./types";

const BASE = "https://metabot.gg/en/spam";
const BASE_FR = "https://metabot.gg/fr/spam";
const STEAM_APP = 2902720;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; SpamLab/1.0; +fan-project)" };

async function get(url: string, tries = 3): Promise<string> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000), cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.text();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw err;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export async function fetchPatches() {
  const j = JSON.parse(
    await get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP}&count=60&maxlength=0&format=json`),
  );
  const items = (j.appnews?.newsitems || []) as { gid: string; title: string; date: number; url: string; contents: string }[];
  return items
    .filter((n) => /patch|path notes|\d+\.\d+/i.test(n.title) && n.contents.length > 200)
    .map(parsePatch)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export async function buildSnapshot(): Promise<Snapshot> {
  const list = await get(`${BASE}/cards`);
  const slugs = [...new Set([...list.matchAll(/href="\/en\/spam\/cards\/([a-z0-9\-]+)"/g)].map((m) => m[1]))];
  if (slugs.length < 50) throw new Error("card list looks wrong");
  const ver = (list.match(/v(\d+\.\d+(?:\.\d+)?)/) || [, "?"])[1] as string;
  const ext = (list.match(/extracted ([A-Z][a-z]{2} \d{1,2}, \d{4})/) || [, ""])[1] as string;

  // Do not silently publish a snapshot with missing patch history when Steam is unavailable.
  const [toxHtml, talHtml, patches] = await Promise.all([get(`${BASE}/tox`), get(`${BASE}/talents`), fetchPatches()]);
  const tox = parseToxPage(toxHtml);
  const talents = parseTalentsPage(talHtml);
  if (tox.length === 0) throw new Error("Tox page returned no families");
  if (talents.length === 0) throw new Error("Talents page returned no talents");
  const cardsRaw = await pool(slugs, 8, async (slug) => {
    try {
      return { slug, card: parseCardPage(await get(`${BASE}/cards/${slug}`), slug), error: null as string | null };
    } catch (error) {
      return { slug, card: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const failed = cardsRaw.filter((entry) => !entry.card);
  if (failed.length) {
    const examples = failed.slice(0, 8).map((entry) => `${entry.slug}: ${entry.error}`).join("; ");
    throw new Error(`Synchronisation incomplète : ${failed.length}/${slugs.length} cartes non récupérées. ${examples}`);
  }
  const cards = cardsRaw.map((entry) => entry.card as Card);
  const cardSlugs = new Set(cards.map((card) => card.slug));
  if (cardSlugs.size !== cards.length || cards.length !== slugs.length) {
    throw new Error(`Intégrité des cartes invalide : ${cards.length} reçues pour ${slugs.length} attendues`);
  }
  // Couche française : best effort, ne bloque jamais la mise à jour des données de jeu.
  const frCards = new Map<string, CardPageFr>();
  let frTox = new Map<string, { name: string; text: string; category?: string }>();
  let frTalents: ReturnType<typeof parseTalentsPage> = [];
  const frWarnings: string[] = [];
  try {
    const [ft, fl] = await Promise.all([get(`${BASE_FR}/tox`), get(`${BASE_FR}/talents`)]);
    frTox = parseToxPageFr(ft);
    frTalents = parseTalentsPage(fl);
  } catch (e) {
    frWarnings.push(`Pages Tox/Talents FR indisponibles : ${e instanceof Error ? e.message : String(e)}`);
  }
  await pool(slugs, 8, async (slug) => {
    try {
      const f = parseCardPageFr(await get(`${BASE_FR}/cards/${slug}`));
      if (f) frCards.set(slug, f);
    } catch {
      /* signalé par attachFrench */
    }
  });
  const fr = attachFrench(cards, frCards, tox, frTox, talents, frTalents);

  const toxIds = new Map(tox.map((t) => [t.name.toLowerCase(), t.id]));
  applyPatches(cards, toxIds, talents, patches);
  refreshFrenchAfterPatches(cards, talents, tox);
  return {
    gameVersion: patches[0]?.version || ver,
    dataSource: `metabot.gg (client v${ver}) + Steam news API`,
    dataExtracted: ext,
    fetchedAt: new Date().toISOString(),
    cards,
    tox,
    talents,
    patches,
    frCoverage: { cards: fr.cards, cardsTotal: cards.length, tox: fr.tox, talents: fr.talents, warnings: [...frWarnings, ...fr.warnings].slice(0, 50) },
  };
}
