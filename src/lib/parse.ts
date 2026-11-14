// Pure parsers (no I/O). Self-contained so they can run from Next and from plain node.
import type {
  Ability,
  AbilitySim,
  Card,
  El,
  El6,
  Patch,
  PatchChange,
  PatchEntry,
  Rarity,
  Talent,
  TalentInfo,
  ToxFamily,
  ToxStep,
} from "./types";

const EL_RE = "Fire|Water|Earth|Nature|Shadow|Light|Ether";
const ELNAMES = ["fire", "water", "earth", "nature", "shadow", "light"] as const;

export function decode(s: string): string {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripComments(h: string): string {
  return h.replace(/<!--[\s\S]*?-->/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
}

export function textOf(html: string, keepBreaks = true): string {
  let s = html.replace(/<br\s*\/?>/g, keepBreaks ? "\n" : " ");
  s = s.replace(/<img[^>]*>/g, "").replace(/<[^>]+>/g, "");
  return decode(s).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function num(s: string | undefined, d = 0): number {
  if (s === undefined) return d;
  const n = parseFloat(s.replace(/,/g, "").replace("−", "-"));
  return Number.isFinite(n) ? n : d;
}

const lc = (s: string) => s.toLowerCase() as El;

/* ------------------------------------------------------------------ */
/* Ability effect parsing                                              */
/* ------------------------------------------------------------------ */

function range(a: string): [number, number] {
  const m = a.replace(/[\[\]+]/g, "").match(/(-?\d+)(?:\s*to\s*(-?\d+))?/);
  if (!m) return [0, 0];
  const lo = parseInt(m[1], 10);
  const hi = m[2] !== undefined ? parseInt(m[2], 10) : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

export function parseEffect(rawLines: string[]): AbilitySim {
  // keep only the first option of a "Choice"
  const lines: string[] = [];
  for (const l of rawLines) {
    if (/^-{3,}\s*or\s*-{3,}$/.test(l.trim())) break;
    if (l.trim() === "Choice") continue;
    lines.push(l);
  }
  const text = lines.join("\n");
  const sim: AbilitySim = { hits: [], target: "one", times: 1, heals: [], pts: [] };

  const allEnemies = /all enemy cards|All enemies|to all enemies/i.test(text);
  const randomEnemies = /Random enemies|\[Random enemy\]|\bRandom\b|random cards on the field/.test(text);
  if (allEnemies) sim.target = "all";
  else if (randomEnemies) sim.target = "rand";
  const xm = text.match(/\bX\s*(\d+)\b/i) || text.match(/\bx(\d+)\b/);
  if (xm && sim.target !== "one") sim.times = Math.min(12, parseInt(xm[1], 10));
  else if (xm && /damage/.test(text)) sim.times = Math.min(12, parseInt(xm[1], 10));

  const hitRe = new RegExp(`(\\[?[+\\-]?\\d+(?:\\s*to\\s*\\+?-?\\d+)?\\]?)\\s+(${EL_RE})\\b(?!\\s+(?:bonus|resistance))`, "g");
  for (const l of lines) {
    if (/^\s*(Heal|Deal damage equal|The target)/i.test(l) && !/Deal/.test(l)) continue;
    if (!/Deal/.test(l) && !/damage/.test(l)) continue;
    if (/Cost/.test(l) && !/Deal/.test(l)) continue;
    const dm = l.match(/Deal\s+(.*)/);
    if (!dm) continue;
    const body = dm[1].split(/\s+damage/)[0] + " damage";
    let found = false;
    let m: RegExpExecArray | null;
    hitRe.lastIndex = 0;
    while ((m = hitRe.exec(body))) {
      const [lo, hi] = range(m[1]);
      sim.hits.push({ min: lo, max: hi, el: lc(m[2]) });
      found = true;
    }
    if (!found) {
      const r = body.match(/^(\[?[+\-]?\d+(?:\s*to\s*\+?-?\d+)?\]?)\s+damage in (a random|its) element/i);
      if (r) {
        const [lo, hi] = range(r[1]);
        sim.hits.push({ min: lo, max: hi, el: /random/i.test(r[2]) ? "rand" : "own" });
      } else {
        const g = body.match(/^(\[?[+\-]?\d+(?:\s*to\s*\+?-?\d+)?\]?)\s+damage/i);
        if (g && !/% of/.test(l)) {
          const [lo, hi] = range(g[1]);
          sim.hits.push({ min: lo, max: hi, el: "own" });
        }
      }
    }
  }
  // "Deal damage equal to N% of the target's max HP"
  const pm = text.match(/damage equal to (\d+)% of the target'?s? max HP/i);
  if (pm) sim.pctHp = parseInt(pm[1], 10);
  const sm = text.match(/target is set to (\d+)% of its max HP/i);
  if (sm) sim.setHpPct = parseInt(sm[1], 10);

  // Heals
  for (const l of lines) {
    if (/Fully heals itself/i.test(l)) {
      sim.fullHeal = true;
      continue;
    }
    const hs = l.match(/Heals itself for (\d+)% of its max HP/i);
    if (hs) {
      sim.healSelfPct = parseInt(hs[1], 10);
      continue;
    }
    const hc = l.match(new RegExp(`Heal the caster\\s+(\\[?\\d+(?:\\s*to\\s*\\d+)?\\]?)\\s+(${EL_RE})`, "i"));
    if (hc) {
      const [lo, hi] = range(hc[1]);
      sim.heals.push({ min: lo, max: hi, el: lc(hc[2]), to: "self" });
      continue;
    }
    const hm = l.match(new RegExp(`Heal\\s+(\\[?\\d+(?:\\s*to\\s*\\d+)?\\]?)\\s+(${EL_RE})(.*)`, "i"));
    if (hm) {
      const [lo, hi] = range(hm[1]);
      const rest = hm[3] || "";
      let to: "self" | "ally" | "all" | "random" = "ally";
      if (/all allied/i.test(rest)) to = "all";
      else if (/random/i.test(rest)) to = "random";
      sim.heals.push({ min: lo, max: hi, el: lc(hm[2]), to });
    }
  }
  if (/Heal/.test(text) && sim.heals.length === 0 && !sim.fullHeal && sim.healSelfPct === undefined) {
    const hm = text.match(new RegExp(`Heal\\s+(\\[?\\d+(?:\\s*to\\s*\\d+)?\\]?)`, "i"));
    if (hm) {
      const [lo, hi] = range(hm[1]);
      sim.heals.push({ min: lo, max: hi, el: "own", to: "ally" });
    }
  }

  // element points
  const ptRe = new RegExp(`(?:^|\\s|&)(${EL_RE})?\\s*bonus\\s*[\\(\\[]\\s*([+\\-]?\\d+(?:\\s*to\\s*\\+?-?\\d+)?)\\s*[\\)\\]]`, "gi");
  for (const l of lines) {
    if (/Base (bonus|damage|healing)/i.test(l) && !/bonus\s*[\(\[]/i.test(l)) continue;
    let m: RegExpExecArray | null;
    ptRe.lastIndex = 0;
    while ((m = ptRe.exec(l))) {
      const [lo, hi] = range(m[2]);
      let el: El | "all" | "rand" | "own" = m[1] ? lc(m[1]) : "own";
      const after = l.slice(m.index + m[0].length);
      if (!m[1]) {
        if (/in every element/i.test(after)) el = "all";
        else if (/random element/i.test(after)) el = "rand";
      }
      if (/ on critical hit/i.test(after) || /\+\s*$/.test(l.slice(0, m.index).trim())) {
        // conditional on critical hit: halve the expected value
        sim.pts.push({ el, min: Math.floor(lo / 4), max: Math.floor(hi / 4) });
      } else sim.pts.push({ el, min: lo, max: hi });
    }
  }
  if (/Bonus\s*[\(\[]/.test(text) && sim.pts.length === 0) {
    const m = text.match(/Bonus\s*[\(\[]\s*([+\-]?\d+(?:\s*to\s*\+?-?\d+)?)\s*[\)\]]\s*in\s*(every|a random|its)/i);
    if (m) {
      const [lo, hi] = range(m[1]);
      sim.pts.push({ el: /every/i.test(m[2]) ? "all" : /random/i.test(m[2]) ? "rand" : "own", min: lo, max: hi });
    }
  }

  // costs
  const cm = text.match(/\[Cost\s+([^\]]+)\]/i);
  if (cm) {
    const c = cm[1];
    const hp = c.match(/(\d+)\s*HP/i);
    if (hp) sim.costHp = parseInt(hp[1], 10);
    const cost: { el: El; n: number }[] = [];
    const re = new RegExp(`(\\d+)\\s*(${EL_RE})`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(c))) cost.push({ el: lc(m[2]), n: parseInt(m[1], 10) });
    if (cost.length) sim.cost = cost;
  }
  const lu = text.match(/Limited Use\]?\s*(\d+)\s*\/\s*(\d+)/i);
  if (lu) sim.limited = parseInt(lu[1], 10);
  const gr = text.match(/(?:base (?:damage|healing)[^\n]*?)(?:increase[s]?[^\d\n]*?)\(?\+?(\d+)\)?/i);
  if (gr) sim.growth = parseInt(gr[1], 10);
  const ec = text.match(/Echo\s*\((\d+)%\)/i);
  if (ec) sim.echo = parseInt(ec[1], 10) / 100;

  if (/Freeze/.test(text) && !/on critical hit/i.test(text)) sim.freeze = true;
  if (/Eternity/.test(text) && /Apply|cooldowns/i.test(text)) sim.eternity = /all enemy/i.test(text) ? "all" : "one";
  if (/Temporality/.test(text)) sim.temporality = true;
  if (/Apply\s*Taunt|^Taunt/m.test(text)) {
    sim.taunt = true;
    if (/Taunt to a random/i.test(text)) sim.tauntRandom = true;
  }
  const bu = text.match(/Base damage and healing increase by\s*\(?\+?(\d+)\)?(\s+for all allied cards)?/i);
  if (bu && sim.hits.length === 0 && sim.heals.length === 0) sim.baseUp = { amount: parseInt(bu[1], 10), to: bu[2] ? "all" : "self" };
  const bu2 = text.match(/Increases the base damage of a random allied card by\s*\(?\+?(\d+)\)?/i);
  if (bu2) sim.baseUp = { amount: parseInt(bu2[1], 10), to: "random" };
  const bu3 = text.match(/Breaks an allied Taunt to (?:grant (\d+) max HP|increase base damage and healing by (\d+))/i);
  if (bu3) {
    if (bu3[1]) sim.hpBuff = { amount: parseInt(bu3[1], 10), to: "self", maxOnly: true };
    else sim.baseUp = { amount: parseInt(bu3[2], 10), to: "self" };
  }
  if (/Vampirism/.test(text)) sim.vampirism = true;
  if (/Gains HP and max HP equal to the damage dealt|Absorb/i.test(text)) sim.absorb = true;
  if (/missing HP/i.test(text)) sim.missingHp = true;
  if (/Revives the last destroyed ally/i.test(text)) sim.revive = true;
  const os = text.match(/opponent'?s? Spamtons drop to (\d+)/i);
  if (os) sim.oppSpamtonsSet = parseInt(os[1], 10);

  const hb = text.match(/Increases the HP and max HP of all allied cards by\s*\(?\+?(\d+)\)?/i);
  if (hb) sim.hpBuff = { amount: parseInt(hb[1], 10), to: "all", maxOnly: false };
  else {
    const hb2 = text.match(/Increases the max HP of all allied cards by\s*\(?\+?(\d+)\)?/i);
    if (hb2) sim.hpBuff = { amount: parseInt(hb2[1], 10), to: "all", maxOnly: true };
    else {
      const hb3 = text.match(/Increases its max HP by\s*\(?\+?(\d+)\)?/i);
      if (hb3) sim.hpBuff = { amount: parseInt(hb3[1], 10), to: "self", maxOnly: true };
      else {
        const hb4 = text.match(/Increases the target card'?s? HP and max HP by\s*\(?\+?(\d+)\)?/i);
        if (hb4) sim.hpBuff = { amount: parseInt(hb4[1], 10), to: "ally", maxOnly: false };
      }
    }
  }
  return sim;
}

/* ------------------------------------------------------------------ */
/* Card page                                                           */
/* ------------------------------------------------------------------ */

function section(h: string, name: string): string {
  const i = h.indexOf(`data-section="${name}"`);
  if (i < 0) return "";
  const j = h.indexOf("data-section=", i + 20);
  return h.slice(i, j < 0 ? i + 40000 : j);
}

export function toxIdFromName(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseTalentText(text: string): Pick<Talent, "res" | "startTox" | "echo" | "modeled" | "pts" | "allyHp" | "selfHp"> {
  const res: Partial<Record<El6, number>> = {};
  let modeled = false;
  const re = new RegExp(`(${EL_RE}|All elements?)\\s+resistance\\s*\\(\\s*([+\\-−]?\\d+)%\\)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = num(m[2]);
    if (/all/i.test(m[1])) for (const e of ELNAMES) res[e] = (res[e] || 0) + v;
    else if (m[1].toLowerCase() !== "ether") res[lc(m[1]) as El6] = (res[lc(m[1]) as El6] || 0) + v;
    modeled = true;
  }
  const rall = text.match(/Resistance to all elements\s*\(\s*([+\-−]?\d+)%\)/i);
  if (rall) {
    for (const e of ELNAMES) res[e] = (res[e] || 0) + num(rall[1]);
    modeled = true;
  }
  let startTox: string | undefined;
  const st = text.match(/Start the game with the\s+"([^"]+)"\s+passive/i);
  if (st) {
    startTox = st[1];
    modeled = true;
  }
  let echo: number | undefined;
  const ec = text.match(/Echo\s*\((\d+)%\)/i);
  if (ec && /All of this card's abilities gain/i.test(text)) {
    echo = parseInt(ec[1], 10) / 100;
    modeled = true;
  }
  // starting element points: "Shadow bonus (+7)."
  const pts: Partial<Record<El6, number>> = {};
  const pr = new RegExp(`^(${EL_RE}) bonus \\(\\+(\\d+)\\)\\.?$`, "i");
  const pm = text.trim().match(pr);
  if (pm && pm[1].toLowerCase() !== "ether") {
    pts[lc(pm[1]) as El6] = num(pm[2]);
    modeled = true;
  }
  let allyHp: number | undefined;
  const ah = text.match(/Increases the max HP of all other allied cards by \(\+(\d+)\)/i);
  if (ah) {
    allyHp = num(ah[1]);
    modeled = true;
  }
  let selfHp: number | undefined;
  const sh = text.match(/^Increases (?:its|this card's) max HP by \(?\+?(\d+)\)?\.?$/i);
  if (sh) {
    selfHp = num(sh[1]);
    modeled = true;
  }
  return { res: Object.keys(res).length ? res : undefined, startTox, echo, modeled, pts: Object.keys(pts).length ? pts : undefined, allyHp, selfHp };
}

export function parseCardPage(raw: string, slug: string): Card | null {
  const h = stripComments(raw);
  const dm = h.match(/<p class="txmLEG_description">([\s\S]*?)<\/p>/);
  if (!dm) return null;
  const desc = textOf(dm[1]);
  const m = desc.match(/^(.*) \((Common|Rare|Epic|Legendary|Divine), (\w+)\) is a SPAM card with ([\d,]+) HP, (-?\d+) Spamtons/);
  if (!m) return null;
  const card: Card = {
    slug,
    name: m[1],
    rarity: m[2] as Rarity,
    element: lc(m[3]),
    hp: num(m[4]),
    spamton: num(m[5]),
    abilities: [],
    talents: [],
    startTox: [],
    res: { fire: 0, water: 0, earth: 0, nature: 0, shadow: 0, light: 0 },
    patched: [],
    pending: [],
  };

  // abilities
  const abSec = section(h, "abilities");
  const arts = abSec.match(/<article class="VprGlq_ability"[\s\S]*?<\/article>/g) || [];
  for (const a of arts) {
    const name = textOf((a.match(/abilityName">([\s\S]*?)<\/h3>/) || [, ""])[1]);
    const els: El[] = [];
    const elBlock = (a.match(/abilityEls">([\s\S]*?)<\/span><\/header>/) || [, ""])[1];
    for (const e of elBlock.matchAll(/spam\/elements\/\d+\/(\w+)\.webp/g)) if (!els.includes(lc(e[1]))) els.push(lc(e[1]));
    const eff = (a.match(/<p class="VprGlq_effect">([\s\S]*?)<\/p>/) || [, ""])[1];
    const lines = textOf(eff)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const stats: Record<string, string> = {};
    for (const s of a.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)) stats[textOf(s[1])] = textOf(s[2], false);
    const crit = (stats["Critical"] || "").match(/([\d.]+)%\s*·\s*×\s*([\d.]+)/);
    const ab: Ability = {
      name,
      elements: els,
      lines,
      cooldown: Math.max(1, num(stats["Cooldown"], 1)),
      accuracy: num((stats["Accuracy"] || "100").replace("%", ""), 100) / 100,
      critChance: crit ? num(crit[1]) / 100 : 0,
      critPower: crit ? num(crit[2], 2) : 2,
      sim: parseEffect(lines),
    };
    card.abilities.push(ab);
  }

  // starting tox
  const toxSec = section(h, "tox");
  for (const li of toxSec.match(/<li>[\s\S]*?<\/li>/g) || []) {
    const chip = li.match(/<a class="yGck4G_toxChip"[^>]*href="\/en\/spam\/tox\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!chip) continue;
    const chipText = textOf(chip[2]);
    const rm = chipText.match(/^(.*?)\s*\((Common|Rare|Epic|Legendary)\)$/);
    const eff = (li.match(/VprGlq_effect">([\s\S]*?)<\/span>/) || [, ""])[1];
    card.startTox.push({ id: chip[1], name: rm ? rm[1] : chipText, rarity: rm ? rm[2] : undefined, text: textOf(eff, false) });
  }

  // talents
  const talSec = section(h, "talents");
  for (const li of talSec.match(/<li( class="VprGlq_talentBest")?>[\s\S]*?<\/li>/g) || []) {
    const slot = num((li.match(/talentSlot">(\d+)</) || [, "0"])[1]);
    const name = textOf((li.match(/talentName"[^>]*>([\s\S]*?)<\/a>/) || [, ""])[1]);
    const eff = (li.match(/<span class="VprGlq_effect">([\s\S]*?)<\/span><\/span><\/li>/) || [, ""])[1];
    const t = textOf(eff, false);
    card.talents.push({ slot, name, text: t, best: /talentBest/.test(li.slice(0, 40)), ...parseTalentText(t) });
  }

  // resistances
  const resSec = section(h, "resistances");
  for (const r of resSec.matchAll(/<b>([+\-−]?)\s*(\d+)\s*%<\/b><span>(\w+)<\/span>/g)) {
    const e = lc(r[3]) as El6;
    if (e in card.res) card.res[e] = (r[1] === "-" || r[1] === "−" ? -1 : 1) * num(r[2]);
  }
  const art = h.match(/href="\/en\/spam\/artists#[^"]*">([^<]+)</);
  if (art) card.artist = decode(art[1]);
  return card;
}

/* ------------------------------------------------------------------ */
/* Tox + talents lists                                                 */
/* ------------------------------------------------------------------ */

export function parseToxPage(raw: string): ToxFamily[] {
  const h = stripComments(raw);
  const out: ToxFamily[] = [];
  const tiles = h.match(/<article class="_3XunXG_famTile"[\s\S]*?<\/article>/g) || [];
  const seen = new Set<string>();
  for (const t of tiles) {
    const id = (t.match(/id="([^"]+)"/) || [, ""])[1];
    const name = textOf((t.match(/famHead">[\s\S]*?<a href="[^"]*">([\s\S]*?)<\/a>/) || [, ""])[1]);
    const category = textOf((t.match(/famSub">([\s\S]*?)<\/span>/) || [, ""])[1]);
    const icon = (t.match(/src="\/web\/spam\/tox\/([^"]+)"/) || [, ""])[1];
    const ladder: ToxStep[] = [];
    for (const li of t.match(/<li style="--rar:[^"]*"><b>[\s\S]*?<\/li>/g) || []) {
      const r = li.match(/<b>(Common|Rare|Epic|Legendary)<\/b><span>([\s\S]*?)<\/span>/);
      if (!r) continue;
      const v = textOf(r[2], false).match(/^(-?[\d.]+)\s*·\s*(\d+)/);
      if (v) ladder.push({ rarity: r[1] as ToxStep["rarity"], value: num(v[1]), price: num(v[2]) });
    }
    const text = textOf((t.match(/<p class="_3XunXG_effect">([\s\S]*?)<\/p>/) || [, ""])[1], false);
    const startsOn = [...t.matchAll(/<a title="([^"]+)"/g)].map((x) => decode(x[1]));
    const key = id + category;
    if (!id || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: category === "Other" || category === "Starting Tox only" ? `${id}` : id, name, icon, category, ladder, text, startsOn });
  }
  return out;
}

export function parseTalentsPage(raw: string): TalentInfo[] {
  const h = stripComments(raw);
  const out: TalentInfo[] = [];
  for (const li of h.match(/<li class="_3XunXG_talentRow"[\s\S]*?<\/li>/g) || []) {
    const id = (li.match(/id="([^"]+)"/) || [, ""])[1];
    const name = textOf((li.match(/talentName">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [, ""])[1]);
    const text = textOf((li.match(/<span class="_3XunXG_effect">([\s\S]*?)<\/span><span class="_3XunXG_miniCards"/) || [, ""])[1], false);
    const cards = [...li.matchAll(/<a title="([^"]+)"/g)].map((x) => decode(x[1]));
    if (id && name) out.push({ id, name, text, cards });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Steam patch notes (BBCode)                                          */
/* ------------------------------------------------------------------ */

const bb = (s: string) =>
  s
    .replace(/\[\/?(b|i|u|strike|url[^\]]*|h\d|p)\]/g, "")
    .replace(/\[\/?\w+[^\]]*\]/g, "")
    .replace(/[▲▼]/g, "")
    .trim();

export function parsePatch(item: { gid: string; title: string; date: number; url: string; contents: string }): Patch {
  const vm = item.title.match(/(\d+\.\d+(?:\.\d+)?)/);
  const lines = item.contents.split("\n");
  const patch: Patch = {
    id: item.gid,
    version: vm ? vm[1] : item.title,
    title: item.title,
    date: new Date(item.date * 1000).toISOString().slice(0, 10),
    url: item.url,
    summary: "",
    additions: [],
    balance: [],
    fixes: [],
  };
  let sec = 0;
  let cur: PatchEntry | null = null;
  const sumLines: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (/^\[img\]/.test(l)) {
      sec++;
      cur = null;
      continue;
    }
    if (sec === 0) {
      if (!/^\[(table|tr|td|\/)/.test(l)) sumLines.push(bb(l));
      continue;
    }
    const top = l.match(/^\[\*\]\[b\](.+?)\[\/b\]\s*(?:·\s*(.*))?$/);
    const sub = l.match(/^\[\*\](.+)$/);
    if (sec === 2 && top && (top[2] !== undefined || !/:/.test(l))) {
      cur = { name: bb(top[1]), label: bb(top[2] || ""), changes: [] };
      patch.balance.push(cur);
      continue;
    }
    if (sec === 2 && sub && cur) {
      const ch = sub[1].match(/^(.+?):\s*\[strike\](.*?)\[\/strike\]\s*→\s*\[b\](.*?)\[\/b\]\s*([▲▼])?/);
      if (ch) {
        cur.changes.push({ field: bb(ch[1]), from: bb(ch[2]), to: bb(ch[3]), dir: ch[4] === "▲" ? "up" : ch[4] === "▼" ? "down" : "" });
      } else cur.changes.push({ field: bb(sub[1]), from: "", to: "", dir: "" });
      continue;
    }
    if (sub) {
      const t = bb(sub[1]);
      if (!t) continue;
      if (sec === 1) patch.additions.push(t);
      else if (sec >= 3) patch.fixes.push(t);
      else if (sec === 2) patch.fixes.push(t);
    }
  }
  patch.summary = sumLines.filter(Boolean).slice(0, 2).join(" ");
  return patch;
}

/* ------------------------------------------------------------------ */
/* Apply balance patches on top of a card snapshot                     */
/* ------------------------------------------------------------------ */

function rng(v: string): [number, number] | null {
  const m = v.replace(/[+×x%]/g, "").match(/^\[?\s*(-?\d+(?:\.\d+)?)(?:\s*to\s*\+?(-?\d+(?:\.\d+)?))?\s*\]?$/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  return [a, m[2] !== undefined ? parseFloat(m[2]) : a];
}

export function applyPatches(cards: Card[], toxIds: Map<string, string>, talents: TalentInfo[], patches: Patch[]): void {
  const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
  const tal = new Map(talents.map((t) => [t.name.toLowerCase(), t]));
  const ordered = [...patches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const p of ordered) {
    for (const e of p.balance) {
      const c = byName.get(e.name.toLowerCase());
      if (!c) continue;
      for (const ch of e.changes) {
        if (!ch.from && !ch.to) continue;
        const tag = `${p.version}: ${ch.field} ${ch.from} → ${ch.to}`;
        const f = ch.field;
        const from = rng(ch.from);
        const to = rng(ch.to);
        let applied: boolean | null = null; // null = unsupported, false = already included
        if (/^HP$/i.test(f) && from && to) {
          applied = c.hp === from[0];
          if (applied) c.hp = to[0];
        } else if (/^Spamton(s)? (generation|per turn)$/i.test(f) && from && to) {
          applied = c.spamton === from[0];
          if (applied) c.spamton = to[0];
        } else if (/^(\w+) resistance$/i.test(f) && from && to) {
          const el = f.split(" ")[0].toLowerCase() as El6;
          if (el in c.res) {
            applied = c.res[el] === from[0];
            if (applied) c.res[el] = to[0];
          }
        } else if (/^Resistance to all elements$/i.test(f) && from && to) {
          applied = (Object.keys(c.res) as El6[]).every((k) => c.res[k] === from[0]);
          if (applied) for (const k of Object.keys(c.res) as El6[]) c.res[k] = to[0];
        } else if (/^Tox$/i.test(f)) {
          const old = c.startTox.findIndex((t) => t.name.toLowerCase() === ch.from.toLowerCase());
          if (old >= 0) {
            c.startTox[old] = { id: toxIds.get(ch.to.toLowerCase()) || toxIdFromName(ch.to), name: ch.to, text: "", rarity: undefined };
            applied = true;
          } else applied = c.startTox.some((t) => t.name.toLowerCase() === ch.to.toLowerCase()) ? false : null;
        } else if (/^Talent (\d)$/i.test(f)) {
          const slot = parseInt(f.split(" ")[1], 10);
          const t = c.talents.find((x) => x.slot === slot);
          if (t) {
            if (t.name.toLowerCase() === ch.from.toLowerCase()) {
              const info = tal.get(ch.to.toLowerCase());
              t.name = ch.to;
              t.text = info ? info.text : "";
              Object.assign(t, { res: undefined, startTox: undefined, echo: undefined, pts: undefined, allyHp: undefined, selfHp: undefined, modeled: false }, parseTalentText(t.text));
              applied = true;
            } else applied = t.name.toLowerCase() === ch.to.toLowerCase() ? false : null;
          }
        } else {
          const am = f.match(/^(.+?),\s*(.+)$/);
          if (am && from && to) {
            const ab = c.abilities.find((x) => x.name.toLowerCase() === am[1].toLowerCase());
            const what = am[2].toLowerCase();
            if (ab) {
              if (/critical chance/.test(what)) {
                applied = Math.abs(ab.critChance * 100 - from[0]) < 0.51;
                if (applied) ab.critChance = to[0] / 100;
              } else if (/critical damage|critical power/.test(what)) {
                applied = ab.critPower === from[0];
                if (applied) ab.critPower = to[0];
              } else if (/accuracy/.test(what)) {
                applied = Math.abs(ab.accuracy * 100 - from[0]) < 0.51;
                if (applied) ab.accuracy = to[0] / 100;
              } else if (/damage|heal/.test(what) && !/bonus/.test(what)) {
                let hit = false;
                for (const h of ab.sim.hits) if (h.min === from[0] && h.max === from[1]) (h.min = to[0]), (h.max = to[1]), (hit = true);
                for (const h of ab.sim.heals) if (h.min === from[0] && h.max === from[1]) (h.min = to[0]), (h.max = to[1]), (hit = true);
                applied = hit;
              } else if (/bonus/.test(what)) {
                let hit = false;
                for (const h of ab.sim.pts) if (h.min === from[0] && h.max === from[1]) (h.min = to[0]), (h.max = to[1]), (hit = true);
                applied = hit;
              }
            }
          }
        }
        if (applied === true) c.patched.push(tag);
        else if (applied === null) c.pending.push(tag);
      }
    }
  }
}
