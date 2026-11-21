/* Moteur de simulation d'un duel SPAM : 4 cartes par deck, recharges, éléments, Spamtons, boutique de Tox, talents. */
import {
  Compiled, CAbility, CAction, CCard, CTalent, EL_FR, Fam, LUCK_ODDS, Tox, ToxFamily, parseSkillId, talentIsStatic,
} from "./compile";

export interface DeckSpec { cards: number[]; lv: number[] }
export interface MatchOpts { log?: string[]; trace?: Snapshot[]; collect?: boolean; first?: 0 | 1; terrain?: number }
export interface Snapshot { turn: number; side: number; hp: number[][]; max: number[][]; spam: number[]; pts: number[][]; alive: boolean[][] }
export interface MatchResult { winner: 0 | 1 | -1; turns: number; bought: [string[], string[]]; terrain: number; first: number }

export type Rng = () => number;
export function mulberry32(a: number): Rng {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RCard {
  d: CCard; side: number; i: number; hp: number; max: number; alive: boolean;
  cd: number[]; uses: number[]; abB: number[]; stack: number[]; echoB: number;
  tox: Tox[]; res: number[]; frozen: boolean; frozenVal: number; poison: { pct: number; t: number }[];
  critB: number; critMB: number; baseB: number; gen: number; revealed: boolean; tenUsed: boolean; phxUsed: boolean;
  resurrect: boolean; revived: boolean; chanceVit: number; insEt: boolean; insVan: boolean; resetUlt: boolean;
  steal: number; doubleAt: number; shieldUsed: boolean; multicolor: number; steel: boolean; taunting: boolean;
}
interface RSide {
  cards: RCard[]; pts: number[]; spam: number; luck: number; turn: number; critB: number;
  petit: boolean; casino: boolean; boughtOnce: boolean; taunt: RCard | null; bought: string[];
}

const SLOTS = 3;
const toxVal = (comp: Compiled, fam: Fam, r: number, el: number): number => {
  const f = comp.tox.find((x) => x.fam === fam && (fam !== "heart" || x.el === el));
  return f?.vals[r] ?? 1;
};

export function playMatch(comp: Compiled, decks: [DeckSpec, DeckSpec], rng: Rng, opts: MatchOpts = {}): MatchResult {
  const log = opts.log;
  const first: 0 | 1 = opts.first ?? (rng() < 0.5 ? 0 : 1);
  const terrain = opts.terrain ?? Math.floor(rng() * 6);
  const ri = (a: number, b: number) => (a >= b ? a : a + Math.floor(rng() * (b - a + 1)));

  const sides: RSide[] = [0, 1].map((s) => ({
    cards: [], pts: [0, 0, 0, 0, 0, 0, 0], spam: 0, luck: 0, turn: 0, critB: 0, petit: false, casino: false, boughtOnce: false, taunt: null, bought: [],
  }));
  sides[0].pts[terrain] += 5;
  sides[1].pts[terrain] += 5;

  /* ----- outils ----- */
  const tx = (c: RCard, fam: Fam): Tox | undefined => {
    for (let k = 0; k < c.tox.length; k++) if (c.tox[k].fam === fam) return c.tox[k];
    return undefined;
  };
  const alive = (s: RSide) => s.cards.filter((c) => c.alive);
  const anyAlive = (s: RSide) => s.cards.some((c) => c.alive);
  const berserk = (s: RSide) => {
    let b = 0;
    for (const c of s.cards) if (c.alive) for (const t of c.tox) if (t.fam === "berserk") b += t.v;
    return b / 100;
  };
  const say = (m: string) => { if (log) log.push(m); };
  const nm = (c: RCard) => `${c.side === 0 ? "A" : "B"}·${c.d.name}`;
  const addPts = (s: RSide, o: RSide, el: number, v: number, mimic = true) => {
    if (el < 0 || el > 6 || v === 0) return;
    s.pts[el] += v;
    if (mimic && v > 0) for (const c of o.cards) if (c.alive && tx(c, "mimicry")) o.pts[el] += 1;
  };
  const healCard = (c: RCard, amt: number) => { if (c.alive) c.hp = Math.min(c.max, c.hp + amt); };

  /* ----- création des cartes ----- */
  const grantSkill = (c: RCard, id: string) => {
    const t = parseSkillId(id, null, 0, "common");
    if (!t) return;
    t.v = toxVal(comp, t.fam, t.r, t.el);
    c.tox.push(t);
  };
  const applyTalent = (c: RCard, t: CTalent, S: RSide, E: RSide) => {
    if (t.grants) { grantSkill(c, t.grants); return; }
    if (!talentIsStatic(t) && !/tour \d/.test(t.text) && !/PV de la carte|remonte à 100|définitivement|Écho|critique/i.test(t.text)) return;
    for (const x of t.actions) {
      const v = (x.min + x.max) / 2;
      switch (x.effect) {
        case "AddAllPlayerAttack": if (x.el >= 0 && talentIsStatic(t)) S.pts[x.el] += v; break;
        case "AddOppHPMax": if (talentIsStatic(t)) for (const o of S.cards) if (o !== c) { o.max += v; o.hp += v; } break;
        case "AddCardHPMax": if (talentIsStatic(t) && !/transforme/.test(t.text)) { c.max += v; c.hp += v; } break;
        case "AddAllPlayerHPMax": if (talentIsStatic(t)) for (const o of S.cards) { o.max += v; o.hp += v; } break;
        case "AddSpamton": S.spam += v; break;
        case "SetSpamton": E.spam += v; break;
        case "AddLuck": S.luck += v; break;
        case "AddSpamtonGenerationCaster": c.gen += v; break;
        case "AddCardCriticChance": if (talentIsStatic(t)) c.critB += v; break;
        case "AddCardCriticRatio": if (talentIsStatic(t)) c.critMB += v; break;
        case "AddSChanceVitale": c.chanceVit = 0.1; break;
        case "AddSParadoxe": c.res = c.res.map((r) => -r); break;
        case "AddSInsensibleEternite": c.insEt = true; break;
        case "AddSInsensibleDisparition": c.insVan = true; break;
        case "AddSRoulette": { const m = t.text.match(/(\d+)\s*%/); c.echoB += m ? +m[1] : 10; break; }
        case "AddSAttackMulticolor": c.multicolor += 1; break;
        case "AddSCoeurAcier": c.steel = true; break;
        case "AddSPetitPrix": S.petit = true; break;
        case "AddSCasino": S.casino = true; break;
        case "StealSpamtonTaken": c.steal = v; break;
        case "SetHPInPercent": if (/remonte/.test(t.text)) c.resetUlt = true; break;
        case "MultiplyAllHP_x2": { const m = t.text.match(/tour (\d+)/); c.doubleAt = m ? +m[1] : 8; break; }
        case "Resurection": case "AddPMetamorph": c.resurrect = true; break;
        case "AddSMystere_C": {
          const pool = comp.tox.filter((f) => f.vals[0] !== null || f.vals[1] !== null);
          const f = pool[Math.floor(rng() * pool.length)];
          const r = f.vals[0] !== null ? 0 : 1;
          c.tox.push({ fam: f.fam, r, v: f.vals[r] as number, el: f.el ?? -1 });
          break;
        }
        case "AddSBrut": c.tox.push({ fam: "brut", r: 1, v: 1, el: -1 }); break;
        default: break;
      }
    }
  };

  for (let s = 0; s < 2; s++) {
    const S = sides[s];
    decks[s].cards.forEach((num, i) => {
      const d = comp.byNum.get(num);
      if (!d) throw new Error("carte inconnue " + num);
      const c: RCard = {
        d, side: s, i, hp: d.hp, max: d.hp, alive: true,
        cd: d.abilities.map((a) => Math.max(0, a.cd - 1 - (s !== first ? 1 : 0))),
        uses: d.abilities.map((a) => a.uses), abB: d.abilities.map(() => 0), stack: d.abilities.map(() => 0), echoB: 0,
        tox: d.skills.map((t) => ({ ...t })), res: d.res.slice(), frozen: false, frozenVal: 0, poison: [], critB: 0, critMB: 0, baseB: 0, gen: 0,
        revealed: false, tenUsed: false, phxUsed: false, resurrect: false, revived: false, chanceVit: 0, insEt: false, insVan: false,
        resetUlt: false, steal: 0, doubleAt: 0, shieldUsed: false, multicolor: 0, steel: false, taunting: false,
      };
      S.cards.push(c);
    });
  }
  for (let s = 0; s < 2; s++) {
    const S = sides[s], E = sides[1 - s];
    for (const c of S.cards) {
      const lv = decks[s].lv[c.i] ?? 0;
      for (const t of c.d.talents) if (t.slot <= lv) applyTalent(c, t, S, E);
    }
  }
  // Poison/terrain initial heals none. Tox "Mystère" déjà résolu.

  /* ----- dégâts ----- */
  const kill = (tgt: RCard, killer: RCard | null) => {
    const S = sides[tgt.side], E = sides[1 - tgt.side];
    const phx = tx(tgt, "phoenix");
    if (phx && !tgt.phxUsed) {
      tgt.phxUsed = true;
      tgt.hp = Math.max(1, (tgt.max * phx.v) / 100);
      tgt.tox = tgt.tox.filter((t) => t !== phx);
      say(`✦ ${nm(tgt)} renaît (Phénix)`);
      return;
    }
    if (tgt.resurrect && !tgt.revived) {
      tgt.revived = true;
      tgt.hp = tgt.max * 0.5;
      say(`✦ ${nm(tgt)} revient à la vie`);
      return;
    }
    tgt.alive = false;
    tgt.hp = 0;
    say(`✖ ${nm(tgt)} est détruite`);
    S.spam += 50;
    for (const c of S.cards) {
      if (!c.alive) continue;
      const g = tx(c, "graveyard");
      if (g) for (let e = 0; e < 6; e++) S.pts[e] += g.v;
    }
    const bomb = tx(tgt, "bomba");
    if (bomb) {
      const al = alive(E);
      if (al.length) { const t = al[Math.floor(rng() * al.length)]; say(`💣 Bomba sur ${nm(t)}`); rawDamage(t, bomb.v, tgt); }
    }
    const rev = tx(tgt, "revenge");
    if (rev) {
      for (const a of tgt.d.abilities) {
        if (!a.hasDmg) continue;
        const al = alive(E);
        if (!al.length) break;
        const t = al[Math.floor(rng() * al.length)];
        for (const dm of a.dmg) { const el = dm.el; rawDamage(t, Math.floor(((dm.min + dm.max) / 2) * (1 + 0.1 * (S.pts[el] || 0)) * (t.res[el] ? 1 - t.res[el] / 100 : 1)), tgt); }
      }
    }
    for (const c of S.cards) {
      if (c.alive && c !== killer && tx(c, "avenger")) for (let k = 0; k < c.cd.length; k++) c.cd[k] = 0;
    }
  };
  const rawDamage = (tgt: RCard, dmg: number, src: RCard | null) => {
    if (!tgt.alive || dmg <= 0) return 0;
    dmg = Math.floor(dmg);
    const ten = tx(tgt, "tenacity");
    tgt.hp -= dmg;
    if (tgt.hp <= 0) {
      if (ten && !tgt.tenUsed) { tgt.tenUsed = true; tgt.hp = 1; }
      else kill(tgt, src);
    }
    return dmg;
  };

  const dealHit = (S: RSide, E: RSide, c: RCard, tgt: RCard, base: number, el: number, crit: boolean, critM: number, brut: boolean, mult: number): number => {
    if (!tgt.alive) return 0;
    if (!brut && tx(tgt, "immunity")) { say(`  ${nm(tgt)} est immunisée`); return 0; }
    let pts = el >= 0 && el < 7 ? S.pts[el] : 0;
    pts = pts * mult + c.multicolor * 0;
    let shield = 1;
    if (!brut) {
      const sh = tx(tgt, "shield");
      if (sh && !tgt.shieldUsed) { tgt.shieldUsed = true; shield = 1 - sh.v / 100; }
    }
    const res = brut || el >= 6 || el < 0 ? 0 : Math.max(-50, Math.min(50, tgt.res[el]));
    const raw = base * (1 + 0.1 * pts) * (crit ? critM : 1) * (1 + berserk(S)) * shield * (1 - res / 100);
    let dmg = Math.max(0, Math.floor(raw));
    // gel brisé
    if (tgt.frozen) { tgt.frozen = false; dmg += tgt.frozenVal; }
    if (tgt.chanceVit && rng() < tgt.chanceVit) { healCard(tgt, dmg); return 0; }
    const hpBefore = tgt.hp;
    const dealt = rawDamage(tgt, dmg, c);
    if (dealt <= 0) return 0;
    say(`  ${nm(c)} → ${nm(tgt)} : −${dealt}${crit ? " (CRIT)" : ""}`);
    // effets sur l'attaquant
    const vamp = tx(c, "vamp"); if (vamp) healCard(c, (Math.min(dealt, hpBefore) * vamp.v) / 100);
    const ero = tx(c, "erosion"); if (ero && tgt.alive) { tgt.max = Math.max(1, tgt.max - (dealt * ero.v) / 100); tgt.hp = Math.min(tgt.hp, tgt.max); }
    const back = tx(c, "backlash"); if (back) rawDamage(c, (dealt * back.v) / 100, null);
    if (c.steal && E.spam > 0) { const st = Math.min(E.spam, c.steal); E.spam -= st; S.spam += st; }
    if (tgt.alive) {
      const fr = tx(c, "freeze"); if (fr) { tgt.frozen = true; tgt.frozenVal = fr.v; }
      const po = tx(c, "poison"); if (po) tgt.poison.push({ pct: po.v, t: 3 });
      const et = tx(c, "eternity"); if (et && !tgt.insEt) for (let k = 0; k < tgt.cd.length; k++) tgt.cd[k] += 1;
      const va = tx(c, "vanish"); if (va && !tgt.insVan && tgt.tox.length) { tgt.tox.pop(); }
    }
    const aoe = tx(c, "aoe");
    if (aoe) for (const di of [-1, 1]) {
      const n = E.cards[tgt.i + di];
      if (n && n.alive && n !== tgt) rawDamage(n, (dealt * aoe.v) / 100, c);
    }
    // effets sur la cible
    const rf = tx(tgt, "reflect"); if (rf) rawDamage(c, (dealt * rf.v) / 100, null);
    const pb = tx(tgt, "punching"); if (pb && tgt.d.element < 6) E.pts[tgt.d.element] += pb.v;
    if (tgt.steel) for (let e = 0; e < 6; e++) tgt.res[e] = Math.min(50, tgt.res[e] + 1);
    if (!tgt.alive) {
      if (c.resetUlt) c.hp = c.max;
      if (tx(c, "reset")) for (let k = 0; k < c.cd.length; k++) if (c.cd[k] === c.d.abilities[k].cd) c.cd[k] = 0;
    }
    return dealt;
  };

  /* ----- ciblage ----- */
  const pickTarget = (S: RSide, E: RSide, c: RCard, a: CAbility, brut: boolean): RCard | null => {
    let cand = E.cards.filter((x) => x.alive);
    if (!cand.length) return null;
    if (!brut && E.taunt && E.taunt.alive) return E.taunt;
    const visible = cand.filter((x) => !(tx(x, "camo") && !x.revealed));
    if (visible.length) cand = visible;
    let best: RCard = cand[0];
    let bestS = -1e9;
    const el = a.dmg[0]?.el ?? -1;
    const pts = el >= 0 ? S.pts[el] : 0;
    const avg = a.dmg.reduce((p, q) => p + (q.min + q.max) / 2, 0) * (1 + 0.1 * pts) * (1 + berserk(S));
    for (const x of cand) {
      const r = el >= 0 && el < 6 && !brut ? 1 - x.res[el] / 100 : 1;
      const dmg = avg * r;
      const immune = !brut && !!tx(x, "immunity");
      let sc = immune ? -500 : (x.d.threat + 40) * Math.min(1, dmg / Math.max(1, x.hp)) + dmg * 0.02;
      if (!immune && dmg >= x.hp) sc += 1000 + x.d.threat;
      if (x.frozen) sc -= 20;
      sc += rng() * 0.5;
      if (sc > bestS) { bestS = sc; best = x; }
    }
    return best;
  };

  /* ----- lancer une capacité ----- */
  const castAbility = (S: RSide, E: RSide, c: RCard, ai: number) => {
    const a = c.d.abilities[ai];
    const crit = rng() * 100 < a.crit + c.critB + S.critB;
    const critM = a.critMult + c.critMB;
    const opt = !!tx(c, "optimization");
    const brut = !!tx(c, "brut");
    const multTox = tx(c, "multiplier");
    const mult = multTox ? 2 : 1;
    let target: RCard | null = null;
    let enemies: RCard[] = [];
    const accOk = rng() * 100 < a.acc;
    const roll = (x: CAction) => (opt ? x.max : ri(x.min, x.max));
    say(`${nm(c)} lance « ${a.name} »`);
    for (const k of a.cost) S.pts[k.el] -= k.amt;
    if (a.hpCost) c.hp -= a.hpCost;
    if (a.hasDmg) {
      if (a.aoe) enemies = alive(E);
      else { target = pickTarget(S, E, c, a, brut); if (target) enemies = [target]; }
      if (accOk) {
        for (const d of a.dmg) {
          const baseRaw = roll(d) + c.baseB + c.abB[ai];
          if (a.randEnemy && !a.aoe) {
            const al = alive(E);
            if (al.length) dealHit(S, E, c, al[Math.floor(rng() * al.length)], baseRaw, d.el, crit, critM, brut, mult);
            continue;
          }
          for (const t of enemies) {
            if (!t.alive) continue;
            dealHit(S, E, c, t, baseRaw, d.el, crit, critM, brut, mult);
          }
        }
      }
      if (tx(c, "smoke") || tx(c, "taunt")) { /* effets de terrain simplifiés */ }
      if (tx(c, "taunt")) S.taunt = c;
    }
    // soins & autres effets
    let healTarget: RCard | null = null;
    const lowestAlly = () => {
      let b: RCard | null = null; let br = 2;
      for (const x of S.cards) if (x.alive) { const r = x.hp / x.max; if (r < br) { br = r; b = x; } }
      return b;
    };
    for (const x of a.actions) {
      const v = opt ? x.max : ri(x.min, x.max);
      switch (x.effect) {
        case "AddAllPlayerAttack": {
          let boost = v;
          if (x.min === 0 && x.max === 0) boost = 0;
          if (x.el >= 0) addPts(S, E, x.el, boost);
          else if (/tous les éléments/i.test(a.text)) for (let e = 0; e < 6; e++) addPts(S, E, e, boost);
          else addPts(S, E, Math.floor(rng() * 6), boost);
          break;
        }
        case "AddAllPlayerAttackRandomTeam": addPts(S, E, Math.floor(rng() * 6), v); break;
        case "AddAllPlayerAttackCountActivation1": if (x.el >= 0) { addPts(S, E, x.el, v + c.stack[ai]); c.stack[ai] += 1; } break;
        case "healTarget": case "healCaster": case "healCasterWithoutElement": {
          const t = x.effect === "healTarget" ? (healTarget ?? (healTarget = lowestAlly())) : c;
          if (!t) break;
          const pts = x.el >= 0 && x.effect !== "healCasterWithoutElement" ? S.pts[x.el] * mult : 0;
          const amt = v * (1 + 0.1 * pts) * (crit ? critM : 1) * (1 + berserk(S));
          if (accOk) { healCard(t, amt); say(`  ${nm(c)} soigne ${nm(t)} +${Math.floor(amt)}`); if (tx(c, "temporality") && !t.insEt) for (let k = 0; k < t.cd.length; k++) t.cd[k] = Math.max(0, t.cd[k] - 1); }
          break;
        }
        case "healPVmaxTarget": case "healPVmaxCaster": {
          const t = /Se soigne/.test(a.text) || x.effect === "healPVmaxCaster" ? c : lowestAlly();
          if (t) healCard(t, (t.max * v) / 100);
          break;
        }
        case "healAllPlayerCard": for (const t of S.cards) healCard(t, v * (1 + berserk(S))); break;
        case "AddCardHPMax": c.max += v; c.hp += v; break;
        case "AddAllPlayerHPMax": for (const t of S.cards) if (t.alive) { t.max += v; t.hp += v; } break;
        case "AddCooldown": {
          if (a.critOnlyCd && !crit) break;
          const t = target ?? null;
          if (t && t.alive && !t.insEt) for (let k = 0; k < t.cd.length; k++) t.cd[k] += x.min;
          break;
        }
        case "AddCardCriticChance": if (a.alliesAll) for (const t of S.cards) t.critB += v; else c.critB += v; break;
        case "AddOppCardCriticChance": for (const t of S.cards) t.critB += Math.abs(v); break;
        case "AddCardMiss": c.critB += Math.abs(v); break;
        case "AddAllPlayerCritick": for (const t of S.cards) t.critB += v; break;
        case "AddCardCriticRatio": c.critMB += v; break;
        case "AddOppCardCriticRatio": for (const t of S.cards) t.critMB += v; for (const t of E.cards) t.critMB += v; break;
        case "AddCardBaseDamage": c.baseB += v; break;
        case "AddAbilityBaseDamage": c.abB[ai] += v; break;
        case "AddOppCardBaseDamage": for (const t of S.cards) t.baseB += v; break;
        case "AddSpamton": S.spam += v; break;
        case "AddCardResistance": case "AddOppCardResistance": case "AddAllPlayerResistance": {
          let val = v;
          if (/Baisse|Diminue|réduit|Réduit/.test(a.text) && val > 0) val = -val;
          let group: RCard[];
          if (/Cible toutes les cartes adverses/.test(a.text)) group = alive(E);
          else if (a.alliesAll || x.effect === "AddAllPlayerResistance" || /toutes les cartes alliées/.test(a.text)) group = alive(S);
          else if (/lanceur/.test(a.text)) group = [c];
          else if (a.hasDmg) group = target ? [target] : [];
          else group = healTarget ? [healTarget] : [c];
          const els = x.el >= 0 ? [x.el] : /aléatoire/.test(a.text) ? [Math.floor(rng() * 6)] : [0, 1, 2, 3, 4, 5];
          for (const g of group) for (const e of els) g.res[e] = Math.max(-50, Math.min(50, g.res[e] + val));
          break;
        }
        default: break;
      }
    }
    if (/Provocation/.test(a.text)) S.taunt = c;
    c.revealed = true;
    // recharge
    if (a.uses > 0) c.uses[ai] -= 1;
    const echo = a.echo + c.echoB;
    c.cd[ai] = echo > 0 && rng() * 100 < echo ? 0 : a.cd;
  };

  /* ----- boutique de Tox ----- */
  const byR: ToxFamily[][] = [0, 1, 2, 3].map((r) => comp.tox.filter((f) => f.vals[r] !== null && f.fam !== "optimization" || (f.fam === "optimization" && r === 1)));
  const rollRarity = (luck: number) => {
    const o = LUCK_ODDS[Math.max(0, Math.min(40, Math.floor(luck)))];
    const x = rng();
    let acc = 0;
    for (let r = 0; r < 4; r++) { acc += o[r]; if (x < acc) return r; }
    return o[3] > 0 ? 3 : o[2] > 0 ? 2 : o[1] > 0 ? 1 : 0;
  };
  const rate = (S: RSide, c: RCard) => {
    let r = 0;
    for (let e = 0; e < 7; e++) r += c.d.dmgRate[e] * (1 + 0.1 * S.pts[e]);
    return r;
  };
  const utility = (S: RSide, E: RSide, c: RCard, f: ToxFamily, r: number, t: number): number => {
    const v = f.vals[r] as number;
    const al = alive(S);
    let team = 0; for (const x of al) team += rate(S, x);
    team = team || 1;
    const share = rate(S, c) / team;
    const hpTot = al.reduce((p, x) => p + x.max, 0) || 1;
    const hpShare = c.max / hpTot;
    const rem = Math.max(2, 16 - t);
    const castRate = c.d.castRate || 0.3;
    switch (f.fam) {
      case "berserk": return v / 100;
      case "heart": {
        let sh = 0; for (const x of al) sh += x.d.dmgRate[f.el ?? 0] * (1 + 0.1 * S.pts[f.el ?? 0]);
        return (sh / team) * Math.min(1.6, 0.05 * v * rem) / (1 + 0.05 * S.pts[f.el ?? 0]);
      }
      case "heartres": return 0.012 * v * Math.min(rem, 10) / 10;
      case "spamland": return 0.004 * v;
      case "vital": return ((v * rem) / hpTot) * 0.9;
      case "regen": return (v / 100) * rem * hpShare * 0.7;
      case "shield": return (v / 100) * 0.22 * (0.5 + hpShare);
      case "reflect": return (v / 100) * 0.16;
      case "vamp": return (v / 100) * share * 0.45 + 0.01;
      case "poison": return (v / 100) * 3 * Math.min(rem, 8) * castRate * 0.55;
      case "erosion": return (v / 100) * share * 0.45;
      case "multiplier": { let p = 0; for (let e = 0; e < 6; e++) p += c.d.dmgRate[e] * S.pts[e]; const w = p / (c.d.dmgRate.reduce((a, b) => a + b, 0) || 1); return share * Math.min(1.2, 0.1 * w) * 0.9; }
      case "phoenix": return (v / 100) * hpShare * 0.85 + 0.02;
      case "immunity": return 0.28 * (0.4 + hpShare);
      case "tenacity": return 0.035;
      case "punching": return 0.02 * v * Math.min(rem, 8) / 4;
      case "brut": return 0.07 + 0.2 * share;
      case "optimization": return 0.04 * share * 3;
      case "graveyard": return 0.025 * v;
      case "lucky": return t < 8 ? 0.03 * v : 0;
      case "bomba": return 0.13;
      case "revenge": return 0.1 * share + 0.04;
      case "avenger": return 0.08 + 0.1 * share;
      case "reset": return 0.1 * castRate;
      case "taunt": return 0.05 * hpShare * 2;
      case "camo": return 0.1 * (0.3 + hpShare);
      case "smoke": return 0.02;
      case "mimicry": return 0.08;
      case "backlash": return -1;
      case "freeze": return 0.22 * share + 0.03;
      case "eternity": return 0.2 * share;
      case "temporality": return 0.06;
      case "vanish": return 0.04;
      case "aoe": return (v / 100) * share * 1.3;
      default: return 0;
    }
  };
  const shop = (S: RSide, E: RSide, s: number) => {
    const t = S.turn;
    let rerolls = 0;
    for (let guard = 0; guard < 6; guard++) {
      let best: { f: ToxFamily; r: number; c: RCard; u: number; price: number } | null = null;
      const free = S.cards.filter((c) => c.alive && c.d.abilities.length + c.tox.length < SLOTS);
      for (let k = 0; k < 3; k++) {
        const r = rollRarity(S.luck);
        const pool = byR[r].length ? byR[r] : byR[0];
        const f = pool[Math.floor(rng() * pool.length)];
        const rr = f.vals[r] === null ? 0 : r;
        const price = f.prices[rr];
        if (price === null || S.spam < price) continue;
        for (const c of free) {
          let u = utility(S, E, c, f, rr, t);
          if (f.fam === "berserk" || f.fam === "heartres" || f.fam === "lucky" || f.fam === "graveyard" || f.fam === "spamland") u *= 1; // effet d'équipe
          if (!best || u > best.u) best = { f, r: rr, c, u, price };
        }
      }
      const thr = 0.03 * Math.max(0.25, 1 - t / 24);
      if (best && best.u >= thr) {
        S.spam -= best.price;
        if (S.petit && !S.boughtOnce) S.spam += best.price;
        S.boughtOnce = true;
        const tox: Tox = { fam: best.f.fam, r: best.r, v: best.f.vals[best.r] as number, el: best.f.el ?? -1 };
        best.c.tox.push(tox);
        if (best.c.frozen) { best.c.frozen = false; rawDamage(best.c, best.c.frozenVal, null); }
        S.bought.push(`${best.f.fam}${best.f.el !== undefined ? ":" + best.f.el : ""}:${best.r}`);
        say(`🛒 ${s === 0 ? "A" : "B"} achète ${best.f.name} (${["C", "R", "E", "L"][best.r]}) pour ${best.c.d.name} (${best.price})`);
        return;
      }
      const cost = rerolls === 0 && S.casino ? 0 : 10 + 5 * rerolls;
      if (rerolls < 2 && t < 14 && S.spam >= cost + 20) { S.spam -= cost; rerolls++; continue; }
      S.spam += 10;
      return;
    }
  };

  /* ----- boucle de jeu ----- */
  const snap = (turn: number, side: number) => {
    if (!opts.trace) return;
    opts.trace.push({
      turn, side,
      hp: sides.map((x) => x.cards.map((c) => Math.max(0, Math.round(c.hp)))),
      max: sides.map((x) => x.cards.map((c) => Math.round(c.max))),
      spam: sides.map((x) => Math.round(x.spam)),
      pts: sides.map((x) => x.pts.slice(0, 6).map((p) => Math.round(p))),
      alive: sides.map((x) => x.cards.map((c) => c.alive)),
    });
  };

  const doTurn = (s: number) => {
    const S = sides[s], E = sides[1 - s];
    S.turn++;
    const t = S.turn;
    say(`— Tour ${t} · joueur ${s === 0 ? "A" : "B"} —`);
    let lucky = 0;
    for (const c of S.cards) if (c.alive) { const l = tx(c, "lucky"); if (l) lucky += l.v; c.shieldUsed = false; c.revealed = false; }
    S.luck += 1 + lucky;
    if (t >= 20) for (const c of S.cards) if (c.alive) rawDamage(c, c.max * (0.1 + 0.03 * (t - 20)), null);
    let income = t;
    for (const c of S.cards) if (c.alive) {
      income += c.d.spamton + c.gen;
      const sp = tx(c, "spamland"); if (sp) income += sp.v;
    }
    S.spam += income;
    for (const c of S.cards) {
      if (!c.alive) continue;
      if (c.doubleAt && c.doubleAt === t) { c.hp *= 2; c.max *= 2; }
      for (const x of c.tox) {
        if (x.fam === "heart" && x.el >= 0) addPts(S, E, x.el, x.v, false);
        else if (x.fam === "heartres") for (const o of S.cards) for (let e = 0; e < 6; e++) o.res[e] = Math.min(50, o.res[e] + x.v);
        else if (x.fam === "vital") { c.max += x.v; c.hp += x.v; }
        else if (x.fam === "regen") healCard(c, (c.max * x.v) / 100);
      }
      if (c.poison.length) {
        for (const p of c.poison) rawDamage(c, (c.max * p.pct) / 100, null);
        c.poison = c.poison.map((p) => ({ pct: p.pct, t: p.t - 1 })).filter((p) => p.t > 0);
      }
    }
    if (!anyAlive(S)) return;
    if (t % 2 === 0) shop(S, E, s);
    for (let iter = 0; iter < 7; iter++) {
      const ready: { c: RCard; ai: number; pr: number }[] = [];
      for (const c of S.cards) {
        if (!c.alive || c.frozen) continue;
        c.d.abilities.forEach((a, ai) => {
          if (c.cd[ai] > 0 || (a.uses > 0 && c.uses[ai] <= 0)) return;
          for (const k of a.cost) if (S.pts[k.el] < k.amt) return;
          if (a.hpCost && c.hp <= a.hpCost) return;
          if (a.hasHeal && !a.hasDmg && !a.engine) {
            const hurt = S.cards.some((x) => x.alive && x.hp < x.max * 0.88);
            const buffs = a.actions.some((x) => /^Add/.test(x.effect));
            if (!hurt && !buffs) return;
          }
          if (a.actions.length === 0 || a.actions.every((x) => x.effect === "_NULL")) {
            if (!/Provocation/.test(a.text)) return;
          }
          ready.push({ c, ai, pr: a.prio });
        });
      }
      if (!ready.length) break;
      ready.sort((x, y) => x.pr - y.pr);
      let did = false;
      for (const r of ready) {
        if (!anyAlive(E)) return;
        if (!r.c.alive || r.c.frozen || r.c.cd[r.ai] > 0) continue;
        const ca = r.c.d.abilities[r.ai];
        let afford = true;
        for (const k of ca.cost) if (S.pts[k.el] < k.amt) afford = false;
        if (!afford || (ca.hpCost && r.c.hp <= ca.hpCost)) continue;
        castAbility(S, E, r.c, r.ai);
        did = true;
      }
      if (!did) break;
    }
    for (const c of S.cards) {
      if (!c.alive) continue;
      for (let k = 0; k < c.cd.length; k++) if (c.cd[k] > 0) c.cd[k]--;
      c.frozen = false;
    }
    E.taunt = null;
    snap(t, s);
  };

  let turns = 0;
  let cur = first;
  while (anyAlive(sides[0]) && anyAlive(sides[1]) && turns < 100) {
    doTurn(cur);
    cur = 1 - cur;
    turns++;
  }
  const a0 = anyAlive(sides[0]);
  const a1 = anyAlive(sides[1]);
  const winner: 0 | 1 | -1 = a0 && !a1 ? 0 : a1 && !a0 ? 1 : -1;
  say(winner === -1 ? "Égalité" : `Victoire du joueur ${winner === 0 ? "A" : "B"}`);
  return { winner, turns, bought: [sides[0].bought, sides[1].bought], terrain, first };
}

export const terrainName = (t: number) => EL_FR[t] ?? "?";
