/* SPAM match simulator — follows the documented game rules:
 * 4 cards on board, alternating turns, cooldowns, element points (+10%/pt),
 * damage = roll × (1+0.1·pts) × crit × (1+berserk) × (1−shield) × (1−res),
 * Spamtons income, Tox shop every even turn (3 offers, luck-driven rarity),
 * overtime from round 20, +50 Spamtons when one of your cards dies. */
import type { AbilitySim, Card, Snapshot, ToxFamily } from "../types";

export interface DeckSpec {
  s: string[]; // 4 slugs, board order
  l?: number[]; // talents unlocked per card (0..3)
}

/* ------------------------------ data ------------------------------ */
const ELI: Record<string, number> = { fire: 0, water: 1, earth: 2, nature: 3, shadow: 4, light: 5, ether: 6 };
const RAND = -1;
const OWN = -2;

// [rare, epic, legendary] % by luck 0..40 (common = remainder)
const LUCK: number[][] = [
  [0, 0, 0], [0, 0, 0], [0, 0, 0], [7.2, 0, 0], [20, 0, 0], [34.3, 1.3, 0], [45, 5, 0], [49.9, 11.2, 0], [53, 20, 0],
  [53.3, 30.3, 0], [50, 40, 0], [45.6, 47.2, 0.3], [41.7, 52.7, 1.2], [38.3, 57.4, 2.7], [35, 60, 5], [31.5, 60, 8.5],
  [27.8, 58.9, 13.3], [24.2, 56.9, 18.9], [20.8, 54.5, 24.7], [17.7, 52.1, 30.2], [14.9, 50, 35], [12.4, 48.3, 39.3],
  [10, 46.5, 43.5], [7.8, 44.6, 47.5], [5.9, 42.7, 51.4], [4.2, 40.8, 55.1], [2.7, 38.7, 58.5], [1.6, 36.7, 61.8],
  [0.7, 34.5, 64.8], [0.2, 32.3, 67.5], [0, 30, 70], [0, 27.7, 72.3], [0, 25.5, 74.5], [0, 23.3, 76.7], [0, 21.2, 78.8],
  [0, 19.1, 80.9], [0, 17.1, 82.9], [0, 15.1, 84.9], [0, 13.3, 86.7], [0, 11.4, 88.6], [0, 9.7, 90.3],
];
export const LUCK_TABLE = LUCK;

interface CHit { min: number; max: number; el: number }
interface CHeal { min: number; max: number; el: number; to: string }
interface CAb {
  cd: number; acc: number; cc: number; cp: number;
  hits: CHit[]; heals: CHeal[]; pts: { el: number; min: number; max: number }[];
  target: string; times: number; sim: AbilitySim;
  costEl: number[] | null; costHp: number; limited: number; growth: number; echo: number;
  dmgW: number; setup: boolean;
}
interface Tx {
  berserk: number; aoe: number; shield: number; phoenix: number; poison: number; ancient: number; vital: number;
  vamp: number; refl: number; lucky: number; spamland: number; grave: number; freeze: number; eternity: number;
  temporal: number; mult: number; opt: number; brutal: number; tenacity: number; taunt: number; revenge: number;
  bomba: number; avenger: number; bag: number; erosion: number; reset: number; immunity: number; mimicry: number;
  backlash: number; heartRes: number; hearts: number[];
}
export interface CCard {
  slug: string; name: string; el: number; hp: number; spamton: number; res: number[];
  abs: CAb[]; start: { id: string; v: number }[]; slots: number; echo: number;
  startPts: number[]; allyHp: number; dmgTotal: number; elW: number[];
}

let TOX: Map<string, ToxFamily> = new Map();
let CARDS: Map<string, Card> = new Map();
let SHOP: { rar: string; id: string; price: number; v: number }[][] = [[], [], [], []];
const RIDX: Record<string, number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };

export function initEngine(s: Snapshot) {
  TOX = new Map(s.tox.map((t) => [t.id, t]));
  CARDS = new Map(s.cards.map((c) => [c.slug, c]));
  SHOP = [[], [], [], []];
  for (const t of s.tox) {
    if (t.category === "Starting Tox only") continue;
    for (const st of t.ladder) SHOP[RIDX[st.rarity]].push({ rar: st.rarity, id: t.id, price: st.price, v: st.value });
  }
  compiled.clear();
}

function toxStart(name: string, rarity?: string): { id: string; v: number } | null {
  const id = [...TOX.values()].find((t) => t.name.toLowerCase() === name.toLowerCase())?.id;
  if (!id) return null;
  const fam = TOX.get(id)!;
  const step = (rarity && fam.ladder.find((x) => x.rarity === rarity)) || fam.ladder[0];
  return { id, v: step ? step.value : 0 };
}

const compiled = new Map<string, CCard>();
export function compileCard(slug: string, lvl: number): CCard {
  const key = slug + ":" + lvl;
  const hit = compiled.get(key);
  if (hit) return hit;
  const c = CARDS.get(slug);
  if (!c) throw new Error("unknown card " + slug);
  const res = [c.res.fire, c.res.water, c.res.earth, c.res.nature, c.res.shadow, c.res.light, 0];
  const startPts = [0, 0, 0, 0, 0, 0, 0];
  let echo = 0;
  let allyHp = 0;
  let selfHp = 0;
  const start: { id: string; v: number }[] = [];
  for (const t of c.startTox) {
    const x = toxStart(t.name, t.rarity);
    if (x) start.push(x);
  }
  // best unlocked, modeled talent
  const unlocked = c.talents.filter((t) => t.slot <= lvl && t.modeled);
  const tal = unlocked.find((t) => t.best) || unlocked[0];
  if (tal) {
    if (tal.res) for (const [k, v] of Object.entries(tal.res)) res[ELI[k]] += v as number;
    if (tal.startTox) {
      const x = toxStart(tal.startTox);
      if (x) start.push(x);
    }
    if (tal.echo) echo = tal.echo;
    if (tal.pts) for (const [k, v] of Object.entries(tal.pts)) startPts[ELI[k]] += v as number;
    if (tal.allyHp) allyHp = tal.allyHp;
    if (tal.selfHp) selfHp = tal.selfHp;
  }
  const abs: CAb[] = c.abilities.map((a) => {
    const s = a.sim;
    const hits = s.hits.map((h) => ({ min: h.min, max: h.max, el: h.el === "rand" ? RAND : h.el === "own" ? OWN : ELI[h.el] }));
    const heals = s.heals.map((h) => ({ min: h.min, max: h.max, el: h.el === "rand" ? RAND : h.el === "own" ? OWN : ELI[h.el], to: h.to }));
    const pts = s.pts.map((p) => ({ el: p.el === "all" ? 100 : p.el === "rand" ? RAND : p.el === "own" ? OWN : ELI[p.el], min: p.min, max: p.max }));
    let costEl: number[] | null = null;
    if (s.cost) {
      costEl = [0, 0, 0, 0, 0, 0, 0];
      for (const x of s.cost) costEl[ELI[x.el]] += x.n;
    }
    const times = s.times;
    let dmgW = 0;
    for (const h of hits) dmgW += ((h.min + h.max) / 2) * times * (s.target === "all" ? 2.5 : 1);
    const setup = pts.length > 0 || !!s.hpBuff || !!s.baseUp || !!s.taunt;
    return {
      cd: a.cooldown, acc: a.accuracy, cc: a.critChance, cp: a.critPower, hits, heals, pts, target: s.target, times, sim: s,
      costEl, costHp: s.costHp || 0, limited: s.limited || 0, growth: s.growth || 0, echo: s.echo || 0, dmgW, setup,
    };
  });
  const elW = [0, 0, 0, 0, 0, 0, 0];
  let dmgTotal = 0;
  for (const a of abs) {
    for (const h of a.hits) if (h.el >= 0) elW[h.el] += ((h.min + h.max) / 2) * a.times / a.cd;
    dmgTotal += a.dmgW / a.cd;
  }
  const out: CCard = {
    slug, name: c.name, el: ELI[c.element], hp: c.hp + selfHp, spamton: c.spamton, res, abs, start,
    slots: Math.max(0, 3 - c.abilities.length - start.length), echo, startPts, allyHp, dmgTotal, elW,
  };
  compiled.set(key, out);
  return out;
}

/* ------------------------------- rng ------------------------------- */
export type Rng = () => number;
export function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ state ------------------------------ */
interface St {
  c: CCard; hp: number; max: number; alive: boolean; cdl: number[]; rdy: boolean[]; uses: number[]; grow: number[];
  base: number; frozen: boolean; shieldUsed: boolean; tenUsed: boolean; phUsed: boolean; poison: number; poisonT: number;
  resB: number; tx: Tx; slotsLeft: number; owner: Pl; idx: number;
}
interface Pl {
  cards: St[]; pts: number[]; sp: number; luckX: number; must: number; opp: Pl; first: boolean;
  lastDead: St | null; mimicry: number; bought: number;
}
export interface MatchStats {
  tox: Record<string, number>;
  turns: number;
}

function newTx(): Tx {
  return {
    berserk: 0, aoe: 0, shield: 0, phoenix: 0, poison: 0, ancient: 0, vital: 0, vamp: 0, refl: 0, lucky: 0, spamland: 0,
    grave: 0, freeze: 0, eternity: 0, temporal: 0, mult: 0, opt: 0, brutal: 0, tenacity: 0, taunt: 0, revenge: 0,
    bomba: 0, avenger: 0, bag: 0, erosion: 0, reset: 0, immunity: 0, mimicry: 0, backlash: 0, heartRes: 0,
    hearts: [0, 0, 0, 0, 0, 0],
  };
}

function addTox(s: St, id: string, v: number) {
  const t = s.tx;
  switch (id) {
    case "berserk": t.berserk += v; break;
    case "aoe": t.aoe = Math.max(t.aoe, v); break;
    case "shield": t.shield = Math.max(t.shield, v); break;
    case "phoenix": t.phoenix = Math.max(t.phoenix, v); break;
    case "poison": t.poison = Math.max(t.poison, v); break;
    case "ancient-healing": t.ancient += v; break;
    case "vitalheart": t.vital += v; break;
    case "vampirism": t.vamp = Math.max(t.vamp, v); break;
    case "reflection": t.refl = Math.max(t.refl, v); break;
    case "lucky": t.lucky += v; break;
    case "spamland": t.spamland += v; break;
    case "graveyard": t.grave += v; break;
    case "freeze": t.freeze = 1; break;
    case "eternity": t.eternity = 1; break;
    case "temporality": t.temporal = 1; break;
    case "multiplier": t.mult = 1; break;
    case "optimization": t.opt = 1; break;
    case "brutal": t.brutal = 1; break;
    case "tenacity": t.tenacity = 1; break;
    case "taunt": t.taunt = 1; break;
    case "revenge": t.revenge = 1; break;
    case "bomba": t.bomba += v; break;
    case "avenger": t.avenger = 1; break;
    case "punching-bag": t.bag += v; break;
    case "erosion": t.erosion = Math.max(t.erosion, v); break;
    case "reset": t.reset = 1; break;
    case "immunity": t.immunity = 1; break;
    case "mimicry": t.mimicry = 1; s.owner.mimicry++; break;
    case "backlash": t.backlash = Math.max(t.backlash, v); break;
    case "heart-resistance": t.heartRes += v; break;
    default: {
      const m = id.match(/^(fire|water|earth|nature|shadow|light)heart$/);
      if (m) t.hearts[ELI[m[1]]] += v;
    }
  }
}

function mkPlayer(deck: CCard[], first: boolean): Pl {
  const p: Pl = { cards: [], pts: [0, 0, 0, 0, 0, 0, 0], sp: 0, luckX: 0, must: -1, opp: null as unknown as Pl, first, lastDead: null, mimicry: 0, bought: 0 };
  deck.forEach((c, i) => {
    const st: St = {
      c, hp: c.hp, max: c.hp, alive: true, cdl: c.abs.map((a) => (first ? a.cd - 1 : Math.max(0, a.cd - 2))),
      rdy: c.abs.map(() => false), uses: c.abs.map((a) => a.limited), grow: c.abs.map(() => 0), base: 0, frozen: false,
      shieldUsed: false, tenUsed: false, phUsed: false, poison: 0, poisonT: 0, resB: 0, tx: newTx(), slotsLeft: c.slots, owner: p, idx: i,
    };
    p.cards.push(st);
  });
  for (const st of p.cards) {
    for (const x of st.c.start) addTox(st, x.id, x.v);
    for (let e = 0; e < 7; e++) p.pts[e] += st.c.startPts[e];
  }
  for (const st of p.cards) {
    const ally = st.c.allyHp;
    if (ally) for (const o of p.cards) if (o !== st) (o.max += ally), (o.hp += ally);
  }
  return p;
}

/* ------------------------------ match ------------------------------ */
const MAXT = 40;

class Match {
  rng: Rng;
  stats: MatchStats | null;
  cur: St | null = null;
  curAb = -1;
  curP: Pl | null = null;
  constructor(rng: Rng, stats: MatchStats | null) {
    this.rng = rng;
    this.stats = stats;
  }
  ri(a: number, b: number) {
    return a + Math.floor(this.rng() * (b - a + 1));
  }
  berserk(p: Pl) {
    let b = 0;
    for (const c of p.cards) if (c.alive) b += c.tx.berserk;
    return 1 + b / 100;
  }
  addPts(p: Pl, el: number, n: number) {
    if (el < 0) return;
    p.pts[el] += n;
    if (n > 0 && p.opp.mimicry > 0) {
      const o = p.opp;
      for (const c of o.cards) if (c.alive && c.tx.mimicry) o.pts[el] += 1;
    }
  }
  expDmg(a: St, ab: CAb, t: St, p: Pl): number {
    let d = 0;
    const bz = this.berserk(p);
    for (const h of ab.hits) {
      const el = h.el < 0 ? a.c.el : h.el;
      const pts = p.pts[el] * (a.tx.mult ? 2 : 1);
      const res = a.tx.brutal ? 0 : Math.max(-50, Math.min(50, (el === 6 ? 0 : t.c.res[el]) + t.resB));
      d += ((h.min + h.max) / 2 + a.base + ab.growth) * (1 + 0.1 * pts) * bz * (1 - res / 100) * ab.times;
    }
    return d;
  }
  /* returns damage dealt */
  strike(a: St, ab: CAb, abIdx: number, t: St, h: CHit, p: Pl, crit: boolean, pctMul = 1): number {
    const o = p.opp;
    let el = h.el;
    if (el === RAND) el = this.ri(0, 5);
    else if (el === OWN) el = a.c.el;
    let roll = a.tx.opt ? h.max : this.ri(h.min, h.max);
    roll += a.base + a.grow[abIdx];
    if (ab.sim.missingHp) roll += 0.2 * (a.max - a.hp);
    let d = roll * (1 + 0.1 * p.pts[el] * (a.tx.mult ? 2 : 1));
    if (crit) d *= ab.cp;
    d *= this.berserk(p);
    if (!a.tx.brutal && t.tx.shield && !t.shieldUsed) {
      d *= 1 - t.tx.shield / 100;
      t.shieldUsed = true;
    }
    const res = a.tx.brutal || el === 6 ? 0 : Math.max(-50, Math.min(50, t.c.res[el] + t.resB));
    d = Math.floor(d * (1 - res / 100) * pctMul);
    if (d < 0) d = 0;
    this.hurt(t, d, a, p);
    if (a.tx.vamp && d > 0) this.heal(a, Math.floor((d * a.tx.vamp) / 100));
    if (ab.sim.absorb && d > 0) (a.max += Math.floor(d / 4)), (a.hp += Math.floor(d / 4));
    if (a.tx.backlash && d > 0) this.hurt(a, Math.floor((d * a.tx.backlash) / 100), null, o);
    if (t.tx.refl && d > 0 && a.alive) this.hurt(a, Math.floor((d * t.tx.refl) / 100), null, o);
    if (t.tx.bag && t.alive) this.addPts(t.owner, t.c.el, t.tx.bag);
    if (a.tx.erosion && d > 0) {
      t.max = Math.max(1, t.max - Math.floor((d * a.tx.erosion) / 100));
      if (t.hp > t.max) t.hp = t.max;
    }
    if (a.tx.freeze && t.alive && !t.tx.immunity) t.frozen = true;
    if (ab.sim.freeze && t.alive && !t.tx.immunity) t.frozen = true;
    if (a.tx.poison && t.alive && !t.tx.immunity) {
      t.poison = Math.floor((t.max * a.tx.poison) / 100);
      t.poisonT = 3;
    }
    return d;
  }
  hurt(t: St, d: number, killer: St | null, atkPl: Pl) {
    if (!t.alive) return;
    t.hp -= d;
    if (t.hp <= 0) {
      if (t.tx.tenacity && !t.tenUsed) {
        t.tenUsed = true;
        t.hp = 1;
        return;
      }
      this.die(t, killer, atkPl);
    }
  }
  heal(t: St, n: number) {
    if (!t.alive || n <= 0) return;
    t.hp = Math.min(t.max, t.hp + n);
    if (t.frozen && false) t.frozen = false;
  }
  die(t: St, killer: St | null, atkPl: Pl) {
    if (t.tx.phoenix && !t.phUsed) {
      t.phUsed = true;
      t.hp = Math.max(1, Math.floor((t.max * t.tx.phoenix) / 100));
      return;
    }
    t.hp = 0;
    t.alive = false;
    const ow = t.owner;
    ow.sp += 50;
    ow.lastDead = t;
    if (t.tx.mimicry) ow.mimicry--;
    for (const pl of [ow, ow.opp])
      for (const c of pl.cards) if (c.alive && c.tx.grave) for (let e = 0; e < 6; e++) pl.pts[e] += c.tx.grave;
    if (killer && killer.tx.reset && this.curAb >= 0 && this.cur === killer) killer.rdy[this.curAb] = true;
    for (const pl of [ow, ow.opp])
      for (const c of pl.cards)
        if (c.alive && c.tx.avenger && c !== killer) for (let i = 0; i < c.cdl.length; i++) (c.cdl[i] = 0), (c.rdy[i] = true);
    if (t.tx.bomba) {
      const en = atkPl.cards.filter((x) => x.alive);
      if (en.length) this.hurt(en[this.ri(0, en.length - 1)], t.tx.bomba, null, ow);
    }
    if (t.tx.revenge) {
      const m = this.cur;
      for (let i = 0; i < t.c.abs.length; i++) {
        const ab = t.c.abs[i];
        if (!ab.hits.length) continue;
        const en = atkPl.cards.filter((x) => x.alive);
        if (!en.length) break;
        const tg = en[this.ri(0, en.length - 1)];
        for (const h of ab.hits) if (tg.alive) this.strike(t, ab, i, tg, h, ow, false);
      }
      this.cur = m;
    }
  }

  pickTarget(a: St, ab: CAb, p: Pl): St | null {
    const o = p.opp;
    const alive = o.cards.filter((x) => x.alive);
    if (!alive.length) return null;
    if (p.must >= 0 && !a.tx.brutal) {
      const m = o.cards[p.must];
      if (m && m.alive) return m;
    }
    let best = alive[0];
    let bs = -1e9;
    for (const e of alive) {
      const d = this.expDmg(a, ab, e, p);
      const kill = d >= e.hp;
      let sc = Math.min(d, e.hp) + (kill ? 150 + e.c.spamton * 4 + e.c.dmgTotal * 2 : 0);
      sc += e.c.dmgTotal * 0.6 - e.hp * 0.02;
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    }
    return best;
  }

  doHits(a: St, ab: CAb, abIdx: number, tgt: St, p: Pl) {
    const crit = this.rng() < ab.cc;
    let tot = 0;
    for (const h of ab.hits) {
      if (!tgt.alive) break;
      tot += this.strike(a, ab, abIdx, tgt, h, p, crit);
    }
    // AoE tox: adjacent targets
    if (a.tx.aoe && tot > 0) {
      const o = p.opp;
      for (const adj of [o.cards[tgt.idx - 1], o.cards[tgt.idx + 1]]) {
        if (adj && adj.alive) this.hurt(adj, Math.floor((tot * a.tx.aoe) / 100), a, p);
      }
    }
  }

  cast(a: St, ab: CAb, abIdx: number, p: Pl) {
    const o = p.opp;
    const s = ab.sim;
    this.cur = a;
    this.curAb = abIdx;
    this.curP = p;
    if (ab.costEl) for (let e = 0; e < 7; e++) p.pts[e] -= ab.costEl[e];
    if (ab.costHp) a.hp -= ab.costHp;
    if (this.rng() <= ab.acc) {
      if (ab.hits.length) {
        if (ab.target === "all") {
          for (const e of o.cards) if (e.alive) this.doHits(a, ab, abIdx, e, p);
        } else if (ab.target === "rand") {
          for (let k = 0; k < ab.times; k++) {
            const en = o.cards.filter((x) => x.alive);
            if (!en.length) break;
            this.doHits(a, ab, abIdx, en[this.ri(0, en.length - 1)], p);
          }
        } else {
          const t = this.pickTarget(a, ab, p);
          if (t) for (let k = 0; k < ab.times && t.alive; k++) this.doHits(a, ab, abIdx, t, p);
        }
      }
      if (s.pctHp) {
        const t = this.pickTarget(a, ab, p);
        if (t) this.hurt(t, Math.floor((t.max * s.pctHp) / 100), a, p);
      }
      if (s.setHpPct) {
        const t = this.pickTarget(a, ab, p);
        if (t) t.hp = Math.min(t.hp, Math.floor((t.max * s.setHpPct) / 100)) || 1;
      }
      if (ab.heals.length) {
        const bz = this.berserk(p);
        for (const h of ab.heals) {
          let el = h.el;
          if (el === RAND) el = this.ri(0, 5);
          else if (el === OWN) el = a.c.el;
          let v = (a.tx.opt ? h.max : this.ri(h.min, h.max)) + a.base + a.grow[abIdx];
          v = Math.floor(v * (1 + 0.1 * p.pts[el] * (a.tx.mult ? 2 : 1)) * bz * (this.rng() < ab.cc ? ab.cp : 1));
          const al = p.cards.filter((x) => x.alive);
          if (!al.length) break;
          if (h.to === "self") this.heal(a, v);
          else if (h.to === "all") for (const x of al) this.heal(x, v);
          else if (h.to === "random") this.heal(al[this.ri(0, al.length - 1)], v);
          else {
            let w = al[0];
            for (const x of al) if (x.hp / x.max < w.hp / w.max) w = x;
            this.heal(w, v);
            if (a.tx.aoe) for (const adj of [p.cards[w.idx - 1], p.cards[w.idx + 1]]) if (adj) this.heal(adj, Math.floor((v * a.tx.aoe) / 100));
          }
        }
      }
      if (s.fullHeal) a.hp = a.max;
      if (s.healSelfPct) this.heal(a, Math.floor((a.max * s.healSelfPct) / 100));
      if (s.revive && p.lastDead && !p.lastDead.alive) {
        const d = p.lastDead;
        d.alive = true;
        d.hp = Math.floor(d.max / 2);
      }
      if (s.hpBuff) {
        const b = s.hpBuff;
        const tg = b.to === "all" ? p.cards.filter((x) => x.alive) : b.to === "self" ? [a] : [p.cards.filter((x) => x.alive)[0]];
        for (const x of tg) {
          if (!x) continue;
          x.max += b.amount;
          if (!b.maxOnly) x.hp += b.amount;
        }
      }
      if (s.baseUp) {
        if (s.baseUp.to === "self") a.base += s.baseUp.amount;
        else if (s.baseUp.to === "all") for (const x of p.cards) x.base += s.baseUp.amount;
        else {
          const al = p.cards.filter((x) => x.alive);
          if (al.length) al[this.ri(0, al.length - 1)].base += s.baseUp.amount;
        }
      }
      if (s.taunt) {
        const al = p.cards.filter((x) => x.alive);
        const tg = s.tauntRandom && al.length ? al[this.ri(0, al.length - 1)] : a;
        o.must = tg.idx;
      }
      if (a.tx.taunt && ab.hits.length) o.must = a.idx;
      if (s.eternity === "all") {
        for (const x of o.cards) if (x.alive && !x.tx.immunity) for (let i = 0; i < x.cdl.length; i++) x.cdl[i] += 1;
      } else if (s.eternity === "one" || (a.tx.eternity && ab.hits.length)) {
        const list = o.cards.filter((x) => x.alive && !x.tx.immunity);
        if (list.length) {
          const x = list[this.ri(0, list.length - 1)];
          for (let i = 0; i < x.cdl.length; i++) x.cdl[i] += 1;
        }
      }
      if (s.temporality) {
        for (const x of p.cards) if (x.alive) for (let i = 0; i < x.cdl.length; i++) x.cdl[i] = Math.max(0, x.cdl[i] - 1);
      } else if (a.tx.temporal) {
        const al = p.cards.filter((x) => x.alive);
        const x = al[this.ri(0, al.length - 1)];
        if (x) for (let i = 0; i < x.cdl.length; i++) x.cdl[i] = Math.max(0, x.cdl[i] - 1);
      }
      if (s.oppSpamtonsSet !== undefined) o.sp = Math.min(o.sp, s.oppSpamtonsSet);
      for (const pt of ab.pts) {
        const n = pt.min === pt.max ? pt.min : this.ri(pt.min, pt.max);
        if (pt.el === 100) for (let e = 0; e < 6; e++) this.addPts(p, e, n);
        else this.addPts(p, pt.el === RAND ? this.ri(0, 5) : pt.el === OWN ? a.c.el : pt.el, n);
      }
    }
    if (ab.growth) a.grow[abIdx] += ab.growth;
    if (ab.limited) a.uses[abIdx]--;
    this.cur = a;
    this.curAb = -1;
  }

  /* ---------------- Tox shop ---------------- */
  offerValue(id: string, v: number, host: St, p: Pl): number {
    const ec = host.c;
    const alive = p.cards.filter((x) => x.alive);
    let tot = 0;
    for (const c of alive) tot += c.c.dmgTotal;
    const share = tot > 0 ? host.c.dmgTotal / tot : 0.25;
    const dealer = Math.min(1, ec.dmgTotal / 40);
    const m = id.match(/^(fire|water|earth|nature|shadow|light)heart$/);
    if (m) {
      const el = ELI[m[1]];
      let w = 0;
      for (const c of alive) w += c.c.elW[el];
      const frac = tot > 0 ? w / Math.max(1, tot) : 0;
      const gain = 1 + (p.pts[el] > 0 ? 0.2 : 0);
      return v * (6 + 22 * frac * gain);
    }
    switch (id) {
      case "berserk": return 14 + v * 1.7;
      case "aoe": return v * (0.25 + 0.5 * dealer) * (host.idx === 1 || host.idx === 2 ? 1.4 : 0.8);
      case "heart-resistance": return v * 2.6;
      case "mimicry": return 22;
      case "shield": return v * 0.45 * (host.max / 800);
      case "phoenix": return v * 0.85 * (0.6 + (ec.dmgTotal + 10) / 60);
      case "ancient-healing": return v * 2.2 * (host.max / 800);
      case "vitalheart": return v * 0.35;
      case "vampirism": return v * 0.32 * dealer;
      case "reflection": return v * 0.25;
      case "poison": return v * (5 + 3 * dealer);
      case "lucky": return v * 14;
      case "spamland": return v * 1.2;
      case "graveyard": return v * 3.2;
      case "erosion": return v * 0.25 * dealer;
      case "freeze": return 24 + 40 * dealer;
      case "eternity": return 34 + 20 * dealer;
      case "temporality": return 18 + 10 * ec.abs.length;
      case "immunity": return 28;
      case "multiplier": return 14 + 55 * share;
      case "optimization": return 8 + 40 * dealer;
      case "brutal": return 18 + 30 * dealer;
      case "tenacity": return 20;
      case "taunt": return host.max > 900 ? 24 : 8;
      case "revenge": return 14 * dealer;
      case "bomba": return v / 9;
      case "avenger": return 16 + 10 * dealer;
      case "punching-bag": return v * 7;
      case "reset": return 12 + 12 * dealer;
      case "smoke": return 6;
      case "vanish": return 8;
      case "metamorph": return 10;
      case "mystery": return 12;
      default: return 6;
    }
  }

  shop(p: Pl, t: number) {
    const luck = Math.min(40, Math.max(0, Math.floor(t + p.luckX)));
    const row = LUCK[luck];
    const hosts = p.cards.filter((x) => x.alive && x.slotsLeft > 0);
    if (!hosts.length) {
      p.sp += 10;
      return;
    }
    let rerolls = 0;
    for (;;) {
      let bestScore = -1e9;
      let bh: St | null = null;
      let bo: { id: string; price: number; v: number } | null = null;
      for (let k = 0; k < 3; k++) {
        const r = this.rng() * 100;
        const ri = r < row[2] ? 3 : r < row[2] + row[1] ? 2 : r < row[2] + row[1] + row[0] ? 1 : 0;
        const pool = SHOP[ri].length ? SHOP[ri] : SHOP[0];
        const off = pool[Math.floor(this.rng() * pool.length)];
        if (off.price > p.sp) continue;
        for (const h of hosts) {
          const sc = this.offerValue(off.id, off.v, h, p) - off.price * 0.38;
          if (sc > bestScore) (bestScore = sc), (bh = h), (bo = off);
        }
      }
      const bank = p.sp;
      if (bo && bh && bestScore >= 6) {
        p.sp -= bo.price;
        addTox(bh, bo.id, bo.v);
        bh.slotsLeft--;
        if (this.stats) this.stats.tox[bo.id] = (this.stats.tox[bo.id] || 0) + 1;
        return;
      }
      if (rerolls === 0 && bank >= 70) {
        p.sp -= 10;
        rerolls++;
        continue;
      }
      p.sp += 10;
      return;
    }
  }

  /* ---------------- turn ---------------- */
  turn(p: Pl, t: number) {
    const o = p.opp;
    // overtime
    if (t >= 20) {
      const pct = 0.1 * (1 + 0.5 * (t - 20));
      for (const c of p.cards) if (c.alive) this.hurt(c, Math.floor(c.max * pct), null, o);
    }
    if (!p.cards.some((c) => c.alive)) return;
    for (const c of o.cards) c.shieldUsed = false;
    // income
    let inc = t;
    for (const c of p.cards) if (c.alive) inc += c.c.spamton + c.tx.spamland;
    p.sp += inc;
    // start-of-turn effects
    for (const c of p.cards) {
      if (!c.alive) continue;
      for (let e = 0; e < 6; e++) if (c.tx.hearts[e]) this.addPts(p, e, c.tx.hearts[e]);
      if (c.tx.vital) (c.max += c.tx.vital), (c.hp += c.tx.vital);
      if (c.tx.ancient) this.heal(c, Math.floor((c.max * c.tx.ancient) / 100));
      if (c.tx.lucky) p.luckX += c.tx.lucky;
      if (c.poisonT > 0) {
        c.poisonT--;
        this.hurt(c, c.poison, null, o);
      }
      if (c.tx.heartRes) {
        for (const x of p.cards) x.resB = Math.min(50, x.resB + c.tx.heartRes);
      }
    }
    if (!p.cards.some((c) => c.alive)) return;
    if (t % 2 === 0) this.shop(p, t);
    // ready flags
    for (const c of p.cards) {
      for (let i = 0; i < c.cdl.length; i++) c.rdy[i] = c.alive && !c.frozen && c.cdl[i] <= 0 && (c.c.abs[i].limited === 0 || c.uses[i] > 0);
    }
    // cast loop
    for (let guard = 0; guard < 24; guard++) {
      let best: St | null = null;
      let bi = -1;
      let bs = -1e9;
      for (const c of p.cards) {
        if (!c.alive || c.frozen) continue;
        for (let i = 0; i < c.c.abs.length; i++) {
          if (!c.rdy[i]) continue;
          const ab = c.c.abs[i];
          const sc = (ab.setup ? 1000 : 0) + (ab.hits.length ? 200 + ab.dmgW : 0) + (ab.heals.length ? 50 : 0) - ab.cd;
          if (sc > bs) (bs = sc), (best = c), (bi = i);
        }
      }
      if (!best) break;
      const ab = best.c.abs[bi];
      let ok = true;
      if (ab.costEl) for (let e = 0; e < 7; e++) if (p.pts[e] < ab.costEl[e]) ok = false;
      if (ab.costHp && best.hp <= ab.costHp) ok = false;
      if (ok && !ab.hits.length && !ab.sim.pctHp && ab.heals.length && !ab.pts.length && !ab.sim.hpBuff) {
        // pure heal: only if someone is hurt
        ok = p.cards.some((x) => x.alive && x.hp < x.max * 0.85);
      }
      if (ok && ab.sim.fullHeal && best.hp > best.max * 0.5) ok = false;
      if (ok && ab.sim.revive && !(p.lastDead && !p.lastDead.alive)) ok = false;
      best.rdy[bi] = false;
      if (!ok) continue;
      this.cast(best, ab, bi, p);
      if (!o.cards.some((c) => c.alive)) return;
      const echo = ab.echo + best.c.echo;
      if (echo > 0 && this.rng() < echo && best.alive) best.rdy[bi] = true;
      else best.cdl[bi] = ab.cd;
      if (best.rdy[bi]) {
        /* echo: ability stays available */
      }
      // reset tox may re-enable it
      if (best.rdy[bi]) best.cdl[bi] = 0;
    }
    // end of turn
    for (const c of p.cards) {
      if (!c.alive) continue;
      for (let i = 0; i < c.cdl.length; i++) if (c.cdl[i] > 0) c.cdl[i]--;
      c.frozen = false;
    }
    p.must = -1;
  }
}

/** 1 = A wins, 0 = B wins, 0.5 = draw */
export function playMatch(a: CCard[], b: CCard[], rng: Rng, aFirst: boolean, stats: MatchStats | null = null): number {
  const m = new Match(rng, stats);
  const pa = mkPlayer(a, aFirst);
  const pb = mkPlayer(b, !aFirst);
  pa.opp = pb;
  pb.opp = pa;
  const first = aFirst ? pa : pb;
  const second = aFirst ? pb : pa;
  for (let t = 1; t <= MAXT; t++) {
    m.turn(first, t);
    if (!second.cards.some((c) => c.alive)) break;
    m.turn(second, t);
    if (!first.cards.some((c) => c.alive)) break;
    if (stats) stats.turns = t;
  }
  const aa = pa.cards.some((c) => c.alive);
  const ba = pb.cards.some((c) => c.alive);
  if (aa && !ba) return 1;
  if (!aa && ba) return 0;
  if (!aa && !ba) return 0.5;
  // time-out: compare remaining HP ratio
  let ha = 0;
  let hb = 0;
  for (const c of pa.cards) if (c.alive) ha += c.hp / c.max;
  for (const c of pb.cards) if (c.alive) hb += c.hp / c.max;
  return ha === hb ? 0.5 : ha > hb ? 1 : 0;
}

export function compileDeck(d: DeckSpec): CCard[] {
  return d.s.map((s, i) => compileCard(s, d.l ? d.l[i] ?? 0 : 0));
}

export interface EvalResult {
  w: number;
  d: number;
  n: number;
  tox?: Record<string, number>;
  turns?: number;
}

/** Plays `games` matches of `a` against random opponents drawn from `opps`. */
export function evalDeck(a: DeckSpec, opps: DeckSpec[], games: number, seed: number, wantStats = false): EvalResult {
  const rng = mulberry(seed);
  const ca = compileDeck(a);
  const co = opps.map(compileDeck);
  let w = 0;
  let d = 0;
  const stats: MatchStats | null = wantStats ? { tox: {}, turns: 0 } : null;
  let turns = 0;
  for (let g = 0; g < games; g++) {
    const o = co[Math.floor(rng() * co.length)];
    const r = playMatch(ca, o, rng, g % 2 === 0, stats);
    if (r === 1) w++;
    else if (r === 0.5) d++;
    if (stats) turns += stats.turns;
  }
  return { w, d, n: games, tox: stats?.tox, turns: wantStats ? turns / Math.max(1, games) : undefined };
}

/** Head-to-head: games between a and b, alternating who starts. */
export function evalPair(a: DeckSpec, b: DeckSpec, games: number, seed: number): EvalResult {
  return evalDeck(a, [b], games, seed);
}
