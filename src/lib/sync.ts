import { applyPatches, parseCardPage, parsePatch, parseTalentsPage, parseToxPage } from "./parse";
import type { Card, Snapshot } from "./types";

const BASE = "https://metabot.gg/en/spam";
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

  const [toxHtml, talHtml, patches] = await Promise.all([get(`${BASE}/tox`), get(`${BASE}/talents`), fetchPatches().catch(() => [])]);
  const tox = parseToxPage(toxHtml);
  const talents = parseTalentsPage(talHtml);
  const cardsRaw = await pool(slugs, 8, async (s) => {
    try {
      return parseCardPage(await get(`${BASE}/cards/${s}`), s);
    } catch {
      return null;
    }
  });
  const cards = cardsRaw.filter((c): c is Card => !!c);
  const toxIds = new Map(tox.map((t) => [t.name.toLowerCase(), t.id]));
  applyPatches(cards, toxIds, talents, patches);
  return {
    gameVersion: patches[0]?.version || ver,
    dataSource: `metabot.gg (client v${ver}) + Steam news API`,
    dataExtracted: ext,
    fetchedAt: new Date().toISOString(),
    cards,
    tox,
    talents,
    patches,
  };
}
