/* Moteur de simulation d'un duel SPAM : 4 cartes par deck, recharges, éléments, Spamtons, boutique de Tox, talents.
 *
 * Règles reprises des textes officiels du SpamDex (mots-clés, Tox, talents) et des règles publiées
 * (guide « How to play » et calculateur de dégâts de MetaBot, tirés du code de combat du jeu) :
 *  - dégâts = (jet + dégâts de base) × (1 + 0,1 × points d'élément) × critique × (1 + Berserk) × (1 − Bouclier, 1er coup) × (1 − résistance)
 *  - résistances bornées à ±50 %, l'Éther ignore les résistances ;
 *  - début de tour : +1 Chance, revenus (numéro du tour + Spamtons des cartes), effets de début de tour ; boutique les tours pairs ;
 *  - le second joueur commence avec toutes ses recharges réduites de 1 ; recharge N = utilisable un tour sur N ;
 *  - une carte détruite rapporte 50 Spamtons à son propriétaire ; passer la boutique rapporte 10 ; relances 10, 15, 20… ;
 *  - mort subite à partir du tour 20 (10 % des PV max, puis +3 % par tour) ;
 *  - UN SEUL talent actif par carte (choisi avant la partie).
 * Les points restés incertains sont signalés « hypothèse » dans le code.
 */
import {
  Compiled, CAbility, CAction, CCard, CTalent, EL_FR, Fam, LUCK_ODDS, Tox, ToxFamily, parseSkillId,
} from "./compile";

/** tal[i] : emplacement du talent actif de la carte i (0 = aucun). Absent : talent par défaut (le plus haut débloqué). */
export interface DeckSpec { cards: number[]; lv: number[]; tal?: number[] }
export interface MatchOpts {
  log?: string[]; trace?: Snapshot[]; collect?: boolean; first?: 0 | 1; terrain?: number;
  /** Point de décision : renvoie l'option jouée (0..n-1). Absent : l'IA heuristique décide seule. */
  choose?: Chooser;
  /** Réglages de l'IA heuristique, par joueur. */
  ai?: [AiParams | undefined, AiParams | undefined];
  /** Expériences d'impact : Tox offert à un tour donné, points d'élément offerts au départ, capacité jamais lancée. */
  giftTox?: { side: 0 | 1; turn: number; fam: Fam; r: number; el: number };
  giftPts?: { side: 0 | 1; el: number; v: number };
  mute?: { side: 0 | 1; card: number; ab: number };
  /** Journal détaillé : chaque ligne est accompagnée de l'état du terrain (page Plateau). */
  frames?: Frame[];
  /** Côté joué « librement » (page Plateau) : sur son tour, il lance ses capacités et utilise la boutique dans l'ordre qu'il veut, puis termine son tour. */
  free?: 0 | 1 | null;
}
/** État public du terrain (affichage du plateau, journal animé). */
export interface BoardCard {
  num: number; name: string; el: number; hp: number; max: number; alive: boolean; frozen: boolean; taunt: boolean;
  abilities: { name: string; cd: number; ready: boolean; text: string }[];
  tox: { fam: string; r: number; v: number; el: number }[]; res: number[]; poison: number;
}
export interface Board {
  turn: number; terrain: number; spam: number[]; luck: number[]; pts: number[][];
  cards: BoardCard[][];
}
/** Une ligne du journal avec l'état du terrain juste après. */
export interface Frame { line: string; board: Board }
/** Ce qu'une option de décision désigne sur le plateau (pour jouer en cliquant sur les cartes). */
export type Ref =
  | { tag: "cast"; card: number; ab: number }
  | { tag: "target"; side: number; card: number }
  | { tag: "buy"; offer: number; card: number }
  | { tag: "reroll" } | { tag: "skip" } | { tag: "ban"; offer: number } | { tag: "end" } | { tag: "opt" };
export interface ShopOffer { fam: string; name: string; group: string; el: number; r: number; price: number; desc: string; value: number; affordable: boolean }
export interface ShopView { offers: (ShopOffer | null)[]; rerollCost: number; banUsed: boolean }
export type DecisionKind = "cast" | "target" | "shop" | "option" | "turn";
/** Une décision de jeu : n options, def = choix de l'IA heuristique, label(i) = description de l'option i. */
export interface Decision { kind: DecisionKind; side: 0 | 1; turn: number; n: number; def: number; label: (i: number) => string; feat?: number[][]; /** État du terrain au moment de la décision. */ board?: () => Board; ref?: (i: number) => Ref; shop?: ShopView | null }
export type Chooser = (d: Decision) => number;

/** Paramètres de l'IA heuristique (valeurs par défaut = réglage de référence). */
export interface AiParams {
  shopThr: number; shopDecay: number; rerollMax: number; rerollTurn: number; rerollReserve: number;
  tKill: number; tThreat: number; tDmg: number; tReflect: number; tFrozen: number;
  /** Coefficient appliqué à l'intérêt de tuer une carte qui va revenir (Phénix, Transition…). */
  tRevive: number;
  /** Part des PV de retour (Phénix, Transition) comptée dans les PV restants de la cible. */
  tBack: number;
  /** Coût d'un Spamton dépensé, en unités d'utilité (0 = le prix est ignoré). */
  priceW: number;
  /** Modèle de ciblage appris (poids des caractéristiques TARGET_FEATURES) ; absent : règle manuelle. */
  tW?: number[];
  /** Modèle de boutique appris (poids des caractéristiques SHOP_FEATURES) ; absent : règle manuelle. */
  sW?: number[];
  /** Ordre des capacités : priorité par catégorie [moteur sans dégâts, utilitaire, soin, dégâts] (plus petit = d'abord). */
  pr: [number, number, number, number];
  fam: Partial<Record<Fam, number>>;
}
/**
 * Réglage appris (novembre 2026, patch 1.31) : ciblage = modèle linéaire appris sur ≈ 6 000 décisions de l'IA experte,
 * boutique et ordre des capacités ajustés par auto-apprentissage. Gagne ≈ 60 % des parties contre le réglage manuel
 * précédent (méta, sièges et decks inversés, 33 000 parties).
 */
export const DEFAULT_AI: AiParams = {
  shopThr: 0.12, shopDecay: 40, rerollMax: 2, rerollTurn: 14, rerollReserve: 20,
  tKill: 1000, tThreat: 150, tDmg: 0.02, tReflect: 0.5, tFrozen: 0, tRevive: 0.1, tBack: 5, priceW: 0.0005, pr: [0, 1, 3, 2],
  fam: { erosion: 0, heart: 0.5, heartres: 2, tenacity: 2 },
  tW: [0.0, 0.4817, -0.5138, 2.4283, -0.8284, -1.2461, -0.0496, 1.015, 0.3216, -0.6336, -0.2852, -0.3852, 0.2736, 0.8516, 0.2794, -0.1512, -4.9295],
};
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

/** Emplacements de talents utilisables pour une carte débloquée jusqu'au niveau lv. */
export function talentSlots(card: CCard, lv: number): number[] {
  return card.talents.filter((t) => t.slot <= lv).map((t) => t.slot);
}
/** Talent par défaut : le plus haut emplacement débloqué (le plus difficile à obtenir). */
export function defaultTalent(card: CCard, lv: number): number {
  const s = talentSlots(card, lv);
  return s.length ? s[s.length - 1] : 0;
}
/** Identifiant de talent sans suffixe de rareté (« TCoeurFeu_C » → « TCoeurFeu »). */
export const talentKey = (id: string) => id.replace(/_[CREL]$/, "");

interface RCard {
  d: CCard; side: number; i: number; hp: number; max: number; alive: boolean;
  abs: CAbility[]; cd: number[]; uses: number[]; abB: number[]; stack: number[]; echoB: number;
  tox: Tox[]; res: number[]; frozen: boolean; frozenVal: number; poison: { pct: number; t: number }[];
  critB: number; critMB: number; accB: number; baseB: number; gen: number; revealed: boolean; tenUsed: boolean; phxUsed: boolean;
  resurrect: number; resurrectMeta: boolean; revived: boolean; chanceVit: number; insEt: boolean; insVan: boolean; resetUlt: boolean;
  steal: number; doubleAt: number; shieldUsed: boolean; multicolor: number; steel: boolean; inv: boolean;
  elCur: number; tk: string; tv: number; once: Set<string>; evo: { t: Tox; r0: number }[]; frenzy: number;
}
interface RSide {
  cards: RCard[]; pts: number[]; spam: number; luck: number; turn: number;
  petit: boolean; casino: boolean; boughtOnce: boolean; taunt: RCard | null; tauntLeft: number; bought: string[];
  dead: RCard[]; got100: boolean;
}

const SLOTS = 3;
const toxVal = (comp: Compiled, fam: Fam, r: number, el: number): number => {
  const f = comp.tox.find((x) => x.fam === fam && (fam !== "heart" || x.el === el));
  return f?.vals[r] ?? 1;
};
const avgOf = (x: CAction) => (x.min + x.max) / 2;
/** Caractéristiques d'une option de boutique (modèle appris) ; « passer » = toutes à zéro. */
export const SHOP_FEATURES = ["achat", "relance", "utilité", "utilité × tour", "prix", "achat × tour", "achat × Spamtons", "relance × tour", "relance × Spamtons", "relance × meilleure offre", "coût de relance", "rareté", "Spamtons restants", "part des PV de la carte", "PV de la carte (%)"];
/** Noms des caractéristiques de ciblage (modèle appris). */
export const TARGET_FEATURES = ["biais", "tue", "tue sans retour", "part des PV ôtée", "menace", "PV restants (%)", "reviendra", "attaque", "soin", "réflexion", "bouclier", "gelée", "PV (milliers)", "facteur de résistance", "capacités prêtes", "passifs", "provocation"];
const ACT_FR: Record<string, string> = {
  damage: "dégâts", healTarget: "soin", healCaster: "soin", AddAllPlayerAttack: "éléments", AddCooldown: "recharge",
  AddCardResistance: "résistance", AddOppCardResistance: "résistance", AddSpamton: "Spamtons",
};
const actLabel = (x: CAction) => `${ACT_FR[x.effect] ?? x.effect}${x.min || x.max ? ` ${x.min === x.max ? x.min : `${x.min}-${x.max}`}` : ""}${x.el >= 0 ? ` ${EL_FR[x.el]}` : ""}`;
const isDmgEffect = (e: string) => e === "damage" || e === "DamageAll" || e === "DamageCasterHP" || e === "DamageWithCardElement" || e === "DamageOnShield2";

export function playMatch(comp: Compiled, decks: [DeckSpec, DeckSpec], rng: Rng, opts: MatchOpts = {}): MatchResult {
  const log = opts.log ?? (opts.frames ? [] : undefined);
  const AI: [AiParams, AiParams] = [opts.ai?.[0] ?? DEFAULT_AI, opts.ai?.[1] ?? DEFAULT_AI];
  const decide = (d: Decision): number => {
    d.board = board;
    const r = opts.choose!(d);
    return r >= 0 && r < d.n ? r : d.def;
  };
  const first: 0 | 1 = opts.first ?? (rng() < 0.5 ? 0 : 1);
  const terrain = opts.terrain ?? Math.floor(rng() * 6);
  const ri = (a: number, b: number) => (a >= b ? a : a + Math.floor(rng() * (b - a + 1)));
  const pick = <T,>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(rng() * arr.length)] : undefined);

  const sides: RSide[] = [0, 1].map(() => ({
    cards: [], pts: [0, 0, 0, 0, 0, 0, 0], spam: 0, luck: 0, turn: 0, petit: false, casino: false, boughtOnce: false,
    taunt: null, tauntLeft: 0, bought: [], dead: [], got100: false,
  }));
  sides[0].pts[terrain] += 5;
  sides[1].pts[terrain] += 5;
  if (opts.giftPts) sides[opts.giftPts.side].pts[opts.giftPts.el] += opts.giftPts.v;

  /* ----- outils ----- */
  const tx = (c: RCard, fam: Fam): Tox | undefined => {
    for (let k = 0; k < c.tox.length; k++) if (c.tox[k].fam === fam) return c.tox[k];
    return undefined;
  };
  const board = (): Board => ({
    turn: Math.max(sides[0].turn, sides[1].turn), terrain,
    spam: sides.map((x) => Math.round(x.spam)), luck: sides.map((x) => Math.round(x.luck * 10) / 10),
    pts: sides.map((x) => x.pts.slice(0, 7).map((p) => Math.round(p))),
    cards: sides.map((x) => x.cards.map((c) => ({
      num: c.d.num, name: c.d.name, el: c.elCur, hp: Math.max(0, Math.round(c.hp)), max: Math.round(c.max), alive: c.alive, frozen: c.frozen,
      taunt: x.taunt === c && x.tauntLeft > 0,
      abilities: c.abs.map((a, k) => ({ name: a.name, cd: c.cd[k] ?? 0, ready: c.alive && !c.frozen && canCast(x, sides[1 - c.side], c, k), text: a.text })),
      tox: c.tox.map((t) => ({ fam: t.fam, r: t.r, v: t.v, el: t.el })), res: c.res.slice(0, 6).map((r) => Math.round(r)),
      poison: c.poison.length,
    }))),
  });
  const immune = (c: RCard) => !!tx(c, "immunity");
  const alive = (s: RSide) => s.cards.filter((c) => c.alive);
  const anyAlive = (s: RSide) => s.cards.some((c) => c.alive);
  const allCards = () => sides[0].cards.concat(sides[1].cards);
  const berserk = (s: RSide) => {
    let b = 0;
    for (const c of s.cards) if (c.alive) for (const t of c.tox) if (t.fam === "berserk") b += t.v;
    return b / 100;
  };
  const say = (m: string) => { log!.push(m); if (opts.frames) opts.frames.push({ line: m, board: board() }); };
  const nm = (c: RCard) => `${c.side === 0 ? "A" : "B"}·${c.d.name}`;
  const addPts = (s: RSide, o: RSide, el: number, v: number, mimic = true) => {
    if (el < 0 || el > 6 || v === 0) return;
    s.pts[el] += v;
    // Mimétisme : « chaque fois que l'adversaire génère un ou plusieurs éléments, vous en générez 1 du même type »
    if (mimic && v > 0) for (const c of o.cards) if (c.alive && tx(c, "mimicry")) o.pts[el] += 1;
  };
  const clampRes = (v: number) => Math.max(-50, Math.min(50, v));
  const addTox = (c: RCard, t: Tox) => {
    // un emplacement libre, sinon le dernier passif est remplacé (règle des talents « Applique le passif … au tour N »)
    if (c.abs.length + c.tox.length >= SLOTS && c.tox.length) c.tox[c.tox.length - 1] = t;
    else c.tox.push(t);
  };
  const mkTox = (fam: Fam, r: number, el = -1): Tox => ({ fam, r, v: toxVal(comp, fam, r, el), el });
  const changeCd = (t: RCard, delta: number, fromEnemy: boolean) => {
    if (!t.alive) return;
    if (delta > 0 && (t.insEt || (fromEnemy && immune(t)))) return;
    for (let k = 0; k < t.cd.length; k++) t.cd[k] = Math.max(0, t.cd[k] + delta);
  };
  const breakIce = (t: RCard, src: RCard | null) => {
    if (!t.frozen) return;
    t.frozen = false;
    const v = t.frozenVal;
    t.frozenVal = 0;
    if (v > 0) { if (log) say(`  ❄ la glace de ${nm(t)} se brise (−${v})`); rawDamage(t, v, src); }
  };
  const freeze = (t: RCard, v: number, src: RCard) => {
    if (!t.alive || (t.side !== src.side && immune(t))) return;
    t.frozen = true;
    t.frozenVal = Math.max(t.frozenVal, v);
  };

  /* ----- évolution (talent « Évolution ») : les passifs d'origine montent de rareté quand les PV baissent ----- */
  const evolve = (c: RCard) => {
    if (!c.evo.length || !c.alive) return;
    const r = c.hp / c.max;
    const tier = r < 0.25 ? 3 : r < 0.5 ? 2 : r < 0.75 ? 1 : 0;
    for (const e of c.evo) {
      const fam = comp.tox.find((f) => f.fam === e.t.fam && (e.t.fam !== "heart" || f.el === e.t.el));
      if (!fam) continue;
      let nr = Math.min(3, e.r0 + tier);
      while (nr > e.r0 && fam.vals[nr] === null) nr--;
      if (fam.vals[nr] !== null) { e.t.r = nr; e.t.v = fam.vals[nr] as number; }
    }
  };

  /* ----- création des cartes ----- */
  const sameRarity = (rarity: string, not?: number) => comp.cards.filter((x) => x.rarity === rarity && x.num !== not);
  const setCardData = (c: RCard, d: CCard, keepBought: Tox[]) => {
    c.d = d;
    c.abs = d.abilities.slice();
    c.cd = d.abilities.map(() => 0); // « Les nouvelles cartes ont leurs compétences disponibles »
    c.uses = d.abilities.map((a) => a.uses);
    c.abB = d.abilities.map(() => 0);
    c.stack = d.abilities.map(() => 0);
    c.tox = d.skills.map((t) => ({ ...t })).concat(keepBought);
    c.res = d.res.slice();
    c.elCur = d.element;
  };
  /** Métamorphe aléatoire : se transforme en une carte aléatoire de la même rareté. */
  const metamorph = (c: RCard, hpPct: number) => {
    const d = pick(sameRarity(c.d.rarity, c.d.num));
    if (!d) return;
    const bought = c.tox.filter((t) => !c.d.skills.some((s) => s.fam === t.fam && s.r === t.r));
    if (log) say(`  ✧ ${nm(c)} se transforme en ${d.name}`);
    setCardData(c, d, bought);
    c.max = d.hp;
    c.hp = Math.max(1, (d.hp * hpPct) / 100);
  };

  for (let s = 0; s < 2; s++) {
    const S = sides[s];
    decks[s].cards.forEach((num, i) => {
      const d = comp.byNum.get(num);
      if (!d) throw new Error("carte inconnue " + num);
      const c: RCard = {
        d, side: s, i, hp: d.hp, max: d.hp, alive: true, abs: d.abilities.slice(),
        cd: d.abilities.map((a) => Math.max(0, a.cd - 1 - (s !== first ? 1 : 0))),
        uses: d.abilities.map((a) => a.uses), abB: d.abilities.map(() => 0), stack: d.abilities.map(() => 0), echoB: 0,
        tox: d.skills.map((t) => ({ ...t })), res: d.res.slice(), frozen: false, frozenVal: 0, poison: [],
        critB: 0, critMB: 0, accB: 0, baseB: 0, gen: 0, revealed: false, tenUsed: false, phxUsed: false,
        resurrect: 0, resurrectMeta: false, revived: false, chanceVit: 0, insEt: false, insVan: false, resetUlt: false,
        steal: 0, doubleAt: 0, shieldUsed: false, multicolor: 0, steel: false, inv: false,
        elCur: d.element, tk: "", tv: 0, once: new Set(), evo: [], frenzy: 0,
      };
      S.cards.push(c);
    });
  }

  /** Applique le talent choisi (un seul par carte). Les talents à déclencheur sont gérés par c.tk dans la boucle. */
  const applyTalent = (c: RCard, t: CTalent, S: RSide, E: RSide) => {
    const key = talentKey(t.id);
    const a0 = t.actions[0];
    c.tk = key;
    c.tv = a0 ? a0.min : 0;
    if (t.grants) {
      const g = parseSkillId(t.grants, null, 0, "common");
      if (g && g.fam !== "mystery") { g.v = toxVal(comp, g.fam, g.r, g.el); c.tox.push(g); }
      else if (g?.fam === "mystery") grantMystery(c);
      if (/^Inversement/.test(t.grants)) c.inv = true;
      if (/^CoeurCorrompu/.test(t.grants)) { const el = Math.floor(rng() * 6); c.tox.push(mkTox("heart", 2, el)); }
      if (/^MetamorphSimple/.test(t.grants)) { c.resurrect = 100; c.resurrectMeta = true; }
      if (/^Phoenix/.test(t.grants) && /Phénix ou Cimetière/.test(t.text)) {
        c.tox = c.tox.filter((x) => x.fam !== "phoenix");
        c.tox.push(rng() < 0.5 ? mkTox("phoenix", 0) : mkTox("graveyard", 0));
      }
      return;
    }
    const sumAct = (eff: string) => t.actions.filter((x) => x.effect === eff);
    switch (key) {
      case "A la caisse": S.spam += c.tv; break;
      case "Baleine bleue": c.max += c.tv; c.hp += c.tv; break;
      case "Blindage F/E": case "Blindage N/T": case "Blindage O/L": case "Durcissement":
        for (const x of sumAct("AddCardResistance")) if (x.el >= 0) c.res[x.el] = clampRes(c.res[x.el] + x.min);
        break;
      case "Blindage Partagé":
        for (const o of S.cards) for (const x of sumAct("AddOppCardResistance")) if (x.el >= 0) o.res[x.el] = clampRes(o.res[x.el] + x.min);
        break;
      case "Cavalerie": for (const o of S.cards) if (o !== c) { o.max += c.tv; o.hp += c.tv; } break;
      case "Critique": c.critB += c.tv; break;
      case "Frappe": c.critMB += c.tv; break;
      case "Depart multi elements": for (let e = 0; e < 6; e++) S.pts[e] += c.tv; break;
      case "Dette": E.spam += c.tv; break;
      case "Piece magique": S.luck += c.tv; break;
      case "Revalorisation": c.gen += c.tv; break;
      case "Life-8": c.doubleAt = 8; break;
      case "Reset ultime": c.resetUlt = true; break;
      case "Racket": c.steal = c.tv; break;
      case "Imprecision": { const o = pick(E.cards); if (o && !immune(o)) o.accB -= c.tv; break; }
      case "Imprudent": metamorph(c, 100); c.max += 500; c.hp += 500; for (let e = 0; e < 6; e++) S.pts[e] += 2; break;
      case "Nouvelle vie": c.tox.push(rng() < 0.5 ? mkTox("phoenix", 0) : mkTox("graveyard", 0)); break;
      case "Transition": c.resurrect = 100; c.resurrectMeta = true; break;
      case "Evolution": c.evo = c.tox.map((x) => ({ t: x, r0: x.r })); break;
      case "TAttackMulticolor": c.multicolor += 1; break;
      case "TBrut": c.tox.push(mkTox("brut", 1)); break;
      case "TChanceVitale": c.chanceVit = 0.1; break;
      case "TCoeurAcier": c.steel = true; break;
      case "TInsensibleDisparition": c.insVan = true; break;
      case "TInsensibleEternite": c.insEt = true; break;
      case "TInversement": c.inv = true; break;
      case "TPetitPrix": S.petit = true; break;
      case "Casino": S.casino = true; break;
      case "TRoulette": c.echoB += 10; break;
      case "resonance": c.echoB += 5; break;
      case "Paradoxe": c.res = c.res.map((r) => -r); break;
      case "TAoe_E": c.tox.push(mkTox("aoe", 2)); break;
      default:
        // talents d'éléments (« Terrain … ») et autres bonus fixes
        if (/^Terrain /.test(key)) { for (const x of sumAct("AddAllPlayerAttack")) if (x.el >= 0) S.pts[x.el] += x.min; }
        break;
    }
  };
  const grantMystery = (c: RCard) => {
    const fams = comp.tox.filter((f) => f.vals[0] !== null || f.vals[1] !== null);
    const f = pick(fams)!;
    const r = f.vals[0] !== null ? 0 : 1;
    c.tox.push({ fam: f.fam, r, v: f.vals[r] as number, el: f.el ?? -1 });
  };
  for (let s = 0; s < 2; s++) {
    const S = sides[s], E = sides[1 - s];
    for (const c of S.cards) {
      for (const t of c.tox) if (t.fam === "mystery") { c.tox = c.tox.filter((x) => x !== t); grantMystery(c); break; }
      const lv = decks[s].lv[c.i] ?? 0;
      const slot = decks[s].tal?.[c.i] ?? defaultTalent(c.d, lv);
      const t = slot > 0 && slot <= Math.max(lv, decks[s].tal ? 3 : lv) ? c.d.talents.find((x) => x.slot === slot) : undefined;
      if (t) applyTalent(c, t, S, E);
    }
  }

  /* ----- morts ----- */
  const kill = (tgt: RCard, killer: RCard | null) => {
    const S = sides[tgt.side], E = sides[1 - tgt.side];
    const phx = tx(tgt, "phoenix");
    if (phx && !tgt.phxUsed) {
      tgt.hp = Math.max(1, (tgt.max * phx.v) / 100);
      // Plume de Phénix : une fois par partie, le passif Phénix est récupéré après usage
      if (tgt.tk === "TPlumePhoenix" && !tgt.once.has("plume")) tgt.once.add("plume");
      else { tgt.phxUsed = true; tgt.tox = tgt.tox.filter((t) => t !== phx); }
      if (log) say(`✦ ${nm(tgt)} renaît (Phénix)`);
      return;
    }
    if (tgt.resurrect && !tgt.revived) {
      tgt.revived = true;
      if (tgt.resurrectMeta) metamorph(tgt, tgt.resurrect);
      else tgt.hp = (tgt.max * tgt.resurrect) / 100;
      if (log) say(`✦ ${nm(tgt)} revient à la vie`);
      return;
    }
    tgt.alive = false;
    tgt.hp = 0;
    tgt.frozen = false;
    S.dead.push(tgt);
    if (log) say(`✖ ${nm(tgt)} est détruite`);
    S.spam += 50;
    if (tgt.tk === "Heritage") S.spam += tgt.tv;
    if (tgt.tk === "Dernier souffle") for (const o of S.cards) changeCd(o, -1, false);
    if (tgt.tk === "Heure funeste") for (const o of E.cards) changeCd(o, 1, true);
    if (tgt.tk === "Virage360") for (const o of S.cards) if (o.alive && o !== tgt) metamorph(o, (o.hp / o.max) * 100);
    if (S.taunt === tgt) S.taunt = null;
    // effets déclenchés par la mort de n'importe quelle carte du terrain
    for (const o of allCards()) {
      if (!o.alive) continue;
      const O = sides[o.side];
      const g = tx(o, "graveyard");
      if (g) for (let e = 0; e < 6; e++) O.pts[e] += g.v; // Cimetière : « lorsqu'une carte meurt »
      if (tx(o, "avenger") && o !== killer) for (let k = 0; k < o.cd.length; k++) o.cd[k] = 0; // Vengeur, même immunisé
      if (o.tk === "Armure des Ames") for (let e = 0; e < 6; e++) o.res[e] = clampRes(o.res[e] + o.tv);
      if (o.tk === "Vitalite des Ames") { o.max += o.tv; o.hp += o.tv; }
      if (o.tk === "OneManArmy") o.baseB += o.tv;
    }
    const bomb = tx(tgt, "bomba");
    if (bomb) {
      const t = pick(alive(E));
      if (t) { if (log) say(`💣 Bomba sur ${nm(t)}`); rawDamage(t, bomb.v, tgt); }
    }
    if (tx(tgt, "revenge")) {
      for (const a of tgt.abs) {
        if (!a.hasDmg) continue;
        const t = pick(alive(E));
        if (!t) break;
        for (const dm of a.dmg) {
          const el = dm.el;
          const res = el >= 0 && el < 6 ? clampRes(t.res[el]) : 0;
          rawDamage(t, Math.floor(avgOf(dm) * (1 + 0.1 * (S.pts[el] || 0)) * (1 - res / 100)), tgt);
        }
      }
    }
  };
  const rawDamage = (tgt: RCard, dmg: number, src: RCard | null) => {
    if (!tgt.alive || dmg <= 0) return 0;
    dmg = Math.floor(dmg);
    tgt.hp -= dmg;
    if (tgt.hp <= 0) {
      if (tx(tgt, "tenacity") && !tgt.tenUsed) { tgt.tenUsed = true; tgt.hp = 1; }
      else kill(tgt, src);
    }
    if (tgt.alive) {
      evolve(tgt);
      // Contre : une fois, sous 25 % des PV, riposte avec toutes ses compétences sur l'attaquant
      if (tgt.tk === "Contre" && !tgt.once.has("contre") && src && src.side !== tgt.side && tgt.hp < tgt.max * 0.25) {
        tgt.once.add("contre");
        const S = sides[tgt.side], E = sides[src.side];
        for (let k = 0; k < tgt.abs.length; k++) if (tgt.abs[k].hasDmg && anyAlive(E)) castAbility(S, E, tgt, k, src, true);
      }
    }
    return dmg;
  };
  const healCard = (c: RCard, amt: number, src: RCard | null): number => {
    if (!c.alive || amt <= 0) return 0;
    if (c.frozen) breakIce(c, src);
    if (!c.alive) return 0;
    const before = c.hp;
    c.hp = Math.min(c.max, c.hp + amt);
    if (src && src !== c && src.side === c.side && c.tk === "convalescence") c.critB += c.tv;
    evolve(c);
    return c.hp - before;
  };

  /* ----- un coup ----- */
  const effRes = (t: RCard, el: number) => {
    let r = t.res[el];
    if (t.tk === "Resilience" && t.hp < t.max * 0.5) r += 25;
    return clampRes(r);
  };
  interface HitOpts { noPts?: boolean; noRes?: boolean }
  const dealHit = (S: RSide, E: RSide, c: RCard, tgt: RCard, base: number, el: number, crit: boolean, critM: number, brut: boolean, mult: number, o: HitOpts = {}): number => {
    if (!tgt.alive) return 0;
    const pts = o.noPts || el < 0 || el > 6 ? 0 : S.pts[el] * mult;
    let shield = 1;
    const sh = tx(tgt, "shield");
    if (sh) {
      if (brut) { tgt.tox = tgt.tox.filter((t) => t !== sh); if (log) say(`  ${nm(c)} détruit le Bouclier de ${nm(tgt)}`); }
      else if (!tgt.shieldUsed) { tgt.shieldUsed = true; shield = 1 - sh.v / 100; }
    }
    if (brut && E.taunt === tgt) E.taunt = null; // Brut détruit les provocations des ennemis ciblés
    const res = brut || o.noRes || el >= 6 || el < 0 ? 0 : effRes(tgt, el);
    const raw = Math.max(0, base) * (1 + 0.1 * pts) * (crit ? critM : 1) * (1 + berserk(S)) * shield * (1 - res / 100);
    let dmg = Math.max(0, Math.floor(raw));
    if (tgt.chanceVit && rng() < tgt.chanceVit) { healCard(tgt, dmg, null); return 0; }
    if (tgt.frozen) breakIce(tgt, c);
    if (!tgt.alive) return 0;
    const hpBefore = tgt.hp;
    const dealt = rawDamage(tgt, dmg, c);
    if (dealt <= 0) return 0;
    dmg = dealt;
    if (log) say(`  ${nm(c)} → ${nm(tgt)} : −${dealt}${crit ? " (CRIT)" : ""}`);
    const enemyHit = tgt.side !== c.side;
    const imm = enemyHit && immune(tgt);
    // effets de l'attaquant
    const vamp = tx(c, "vamp"); if (vamp) healCard(c, (Math.min(dealt, hpBefore) * vamp.v) / 100, c);
    const ero = tx(c, "erosion"); if (ero && tgt.alive && !imm) { tgt.max = Math.max(1, tgt.max - (dealt * ero.v) / 100); tgt.hp = Math.min(tgt.hp, tgt.max); }
    const back = tx(c, "backlash"); if (back) rawDamage(c, (dealt * back.v) / 100, null);
    if (c.steal && E.spam > 0 && enemyHit) { const st = Math.min(E.spam, c.steal); E.spam -= st; S.spam += st; }
    if (tgt.alive && !imm) {
      const fr = tx(c, "freeze"); if (fr) freeze(tgt, fr.v, c);
      const po = tx(c, "poison"); if (po) tgt.poison.push({ pct: po.v, t: 3 });
      if (tx(c, "eternity")) changeCd(tgt, c.inv ? -1 : 1, enemyHit);
      if (tx(c, "temporality") && c.inv) changeCd(tgt, 1, enemyHit);
      if (tx(c, "vanish") && !tgt.insVan && tgt.tox.length) { const lost = tgt.tox.pop()!; if (log) say(`  ⌫ Disparition : ${nm(tgt)} perd « ${lost.fam} »`); }
    }
    const aoe = tx(c, "aoe");
    if (aoe) for (const di of [-1, 1]) {
      const n = sides[tgt.side].cards[tgt.i + di];
      if (n && n.alive && n !== tgt) rawDamage(n, (dealt * aoe.v) / 100, c);
    }
    // effets de la cible
    if (enemyHit) {
      const rf = tx(tgt, "reflect"); if (rf && tgt.alive) rawDamage(c, (dealt * rf.v) / 100, null);
      const pb = tx(tgt, "punching"); if (pb && tgt.d.element < 6) E.pts[tgt.d.element] += pb.v;
      if (tgt.steel) for (let e = 0; e < 6; e++) tgt.res[e] = Math.min(50, tgt.res[e] + 1);
      if (tgt.tk === "sac_de_crit") tgt.critB += tgt.tv;
      if (tgt.tk === "Corrosion" && !immune(c)) for (let e = 0; e < 6; e++) c.res[e] = clampRes(c.res[e] - Math.abs(tgt.tv));
    }
    if (!tgt.alive && enemyHit) {
      if (c.resetUlt) c.hp = c.max;
    }
    return dealt;
  };

  /* ----- ciblage ----- */
  const tauntOf = (E: RSide): RCard | null => {
    if (E.taunt && E.taunt.alive) return E.taunt;
    for (const x of E.cards) if (x.alive && x.tk === "Protection sauvage" && x.hp < x.max * 0.5) return x;
    return null;
  };
  /** Caractéristiques d'une cible (voir TARGET_FEATURES). */
  const targetFeatures = (x: RCard, d: number, hpEff: number, back: number, r: number): number[] => {
    const kill = d >= x.hp ? 1 : 0;
    let atk = 0; for (let e = 0; e < 7; e++) atk += x.d.dmgRate[e];
    let ready = 0; for (let k = 0; k < x.cd.length; k++) if (x.cd[k] <= 1) ready++;
    return [
      1, kill, kill * (back ? 0 : 1), Math.min(1, d / Math.max(1, hpEff)), x.d.threat / 100, x.hp / x.max, back ? 1 : 0,
      atk / 100, x.d.healRate / 100, tx(x, "reflect") ? 1 : 0, tx(x, "shield") && !x.shieldUsed ? 1 : 0, x.frozen ? 1 : 0,
      x.hp / 1000, r, ready / Math.max(1, x.cd.length), x.tox.length / 3, sides[x.side].taunt === x ? 1 : 0,
    ];
  };
  const pickTarget = (S: RSide, E: RSide, c: RCard, a: CAbility, brut: boolean, acts: CAction[]): RCard | null => {
    let cand = E.cards.filter((x) => x.alive);
    if (!cand.length) return null;
    const tt = tauntOf(E);
    if (!brut && tt) return tt;
    const visible = cand.filter((x) => !(tx(x, "camo") && !x.revealed));
    if (visible.length) cand = visible;
    const P = AI[c.side];
    let bi = 0;
    let bestS = -1e9;
    const feats: number[][] | null = opts.choose || P.tW ? [] : null;
    const dmg = acts.filter((x) => isDmgEffect(x.effect));
    const el = dmg[0]?.el ?? -1;
    const pts = el >= 0 ? S.pts[el] : 0;
    const avg = dmg.reduce((p, q) => p + avgOf(q), 0) * (1 + 0.1 * pts) * (1 + berserk(S));
    for (let k = 0; k < cand.length; k++) {
      const x = cand[k];
      const r = el >= 0 && el < 6 && !brut ? 1 - effRes(x, el) / 100 : 1;
      const d = avg * r * (tx(x, "shield") && !x.shieldUsed && !brut ? 1 - (tx(x, "shield")!.v / 100) : 1);
      // une carte qui reviendra (Phénix, Transition, Métamorphe…) a en réalité plus de PV à abattre
      const phx = !x.phxUsed ? tx(x, "phoenix") : undefined;
      const back = phx ? phx.v / 100 : x.resurrect && !x.revived ? x.resurrect / 100 : 0;
      const hpEff = x.hp + back * x.max * P.tBack;
      let sc = (x.d.threat + P.tThreat) * Math.min(1, d / Math.max(1, hpEff)) + d * P.tDmg;
      if (d >= x.hp) sc += (P.tKill + x.d.threat) * (back ? P.tRevive : 1);
      if (tx(x, "reflect")) sc -= d * (tx(x, "reflect")!.v / 100) * P.tReflect;
      if (x.frozen) sc -= P.tFrozen;
      if (feats) {
        const f = targetFeatures(x, d, hpEff, back, r);
        feats.push(f);
        if (P.tW) { sc = 0; for (let q = 0; q < f.length; q++) sc += f[q] * (P.tW[q] ?? 0); }
      }
      sc += rng() * (P.tW ? 0.001 : 0.5);
      if (sc > bestS) { bestS = sc; bi = k; }
    }
    if (opts.choose && cand.length > 1) {
      const cc = cand;
      bi = decide({ kind: "target", side: c.side as 0 | 1, turn: S.turn, n: cc.length, def: bi, feat: feats ?? undefined, ref: (i) => ({ tag: "target", side: cc[i].side, card: cc[i].i }), label: (i) => `${a.name} → ${cc[i].d.name} (${Math.max(0, Math.round(cc[i].hp))}/${Math.round(cc[i].max)} PV${(cc[i].resurrect && !cc[i].revived) || (!cc[i].phxUsed && tx(cc[i], "phoenix")) ? ", reviendra" : ""})` });
    }
    return cand[bi];
  };
  const bestAlly = (S: RSide, pred: (x: RCard) => boolean = () => true): RCard | null => {
    let b: RCard | null = null, bs = -1;
    for (const x of S.cards) if (x.alive && pred(x)) { const sc = x.d.threat; if (sc > bs) { bs = sc; b = x; } }
    return b;
  };
  const lowestAlly = (S: RSide): RCard | null => {
    let b: RCard | null = null; let br = 2;
    for (const x of S.cards) if (x.alive) { const r = x.hp / x.max; if (r < br) { br = r; b = x; } }
    return b;
  };

  /* ----- choix d'option (capacités « Choix ») : meilleure valeur attendue ----- */
  const optionValue = (S: RSide, E: RSide, c: RCard, a: CAbility, acts: CAction[], fr: boolean): number => {
    let v = 0;
    const hurt = S.cards.reduce((p, x) => p + (x.alive ? x.max - x.hp : 0), 0);
    const ae = alive(E);
    for (const x of acts) {
      if (isDmgEffect(x.effect)) {
        const pts = x.el >= 0 ? S.pts[x.el] : 0;
        const r = ae.length ? ae.reduce((p, t) => p + (x.el >= 0 && x.el < 6 ? 1 - effRes(t, x.el) / 100 : 1), 0) / ae.length : 1;
        v += avgOf(x) * (1 + 0.1 * pts) * r * (a.aoe ? ae.length : 1);
      } else if (/^heal/.test(x.effect)) v += Math.min(avgOf(x), hurt) * 0.8;
      else if (/^AddAllPlayerAttack/.test(x.effect)) {
        let dr = 0; for (const t of S.cards) if (t.alive) dr += x.el >= 0 ? t.d.dmgRate[x.el] : 0;
        v += avgOf(x) * Math.max(2, dr * 0.6);
      } else if (x.effect === "AddCooldown") v += 18;
      else v += 6;
    }
    if (fr) v += 25;
    return v + rng() * 0.01;
  };

  /* ----- lancer une capacité ----- */
  const castAbility = (S: RSide, E: RSide, c: RCard, ai: number, forced: RCard | null = null, free = false) => {
    const a = c.abs[ai];
    const crit = rng() * 100 < a.crit + c.critB;
    const critM = a.critMult + c.critMB;
    const opt = !!tx(c, "optimization");
    const brut = !!tx(c, "brut");
    const mult = tx(c, "multiplier") ? 2 : 1;
    const roll = (x: CAction) => (opt ? x.max : ri(x.min, x.max));
    // Précision : probabilité de réussite des effets de la compétence (pas seulement du coup)
    const accOk = rng() * 100 < a.acc + c.accB;
    if (log) say(`${nm(c)} lance « ${a.name} »${accOk ? "" : " (raté)"}`);
    if (!free) {
      for (const k of a.cost) S.pts[k.el] -= k.amt;
      if (a.hpCost) c.hp -= a.hpCost;
    }
    let acts = a.actions;
    let doFreeze = a.freeze === 1 || (a.freeze === 2 && crit);
    if (a.options) {
      let bi = 0, bv = -1e9;
      a.options.forEach((o, oi) => {
        const v = optionValue(S, E, c, a, o.map((i) => a.actions[i]), a.optFreeze[oi]);
        if (v > bv) { bv = v; bi = oi; }
      });
      if (opts.choose && a.options.length > 1) {
        const ops = a.options;
        bi = decide({ kind: "option", side: c.side as 0 | 1, turn: S.turn, n: ops.length, def: bi, ref: () => ({ tag: "opt" }), label: (i) => `${a.name} : ${ops[i].map((j) => actLabel(a.actions[j])).join(" + ")}` });
      }
      acts = a.options[bi].map((i) => a.actions[i]);
      doFreeze = !!a.optFreeze[bi];
    }
    acts = acts.filter((x) => x.effect !== "_NULL" && (!a.critCond.includes(x.effect) || crit));
    const dmgActs = acts.filter((x) => isDmgEffect(x.effect));
    const hasDmgNow = dmgActs.length > 0 || acts.some((x) => x.effect === "DamageOpponentHPMAX" || x.effect === "DamageCasterSpamton");
    const hitTargets = new Set<RCard>();
    /** Pour les capacités à cibles aléatoires : cible touchée par chaque action de dégâts (les effets de la chaîne s'y appliquent). */
    const chainHit = new Map<number, RCard[]>();
    let main: RCard | null = null;
    let dealtTotal = 0;

    if (accOk) {
      if (hasDmgNow && !c.inv) {
        const enemies = a.aoe ? alive(E) : [];
        if (!a.aoe && !a.randEnemy && !a.randField) main = forced && forced.alive ? forced : pickTarget(S, E, c, a, brut, acts);
        if (main) enemies.push(main);
        const randomTarget = (): RCard | undefined => {
          if (a.randField) return pick(allCards().filter((x) => x.alive && !(x.side !== c.side && tx(x, "camo") && !x.revealed)));
          const tt = brut ? null : tauntOf(E);
          return tt ?? pick(alive(E).filter((x) => !(tx(x, "camo") && !x.revealed))) ?? pick(alive(E));
        };
        for (const x of acts) {
          if (!isDmgEffect(x.effect) && x.effect !== "DamageOpponentHPMAX" && x.effect !== "DamageCasterSpamton") continue;
          const targets = a.randEnemy || a.randField ? [randomTarget()].filter((t): t is RCard => !!t) : enemies;
          for (const t of targets) {
            if (!t.alive) continue;
            let base = roll(x) + c.baseB + c.abB[ai];
            let el = x.el;
            const o: HitOpts = {};
            if (x.effect === "DamageWithCardElement") el = c.elCur;
            if (x.effect === "DamageOnShield2" && tauntOf(sides[t.side]) === t) base *= 2;
            if (x.effect === "DamageOpponentHPMAX") { base = (t.max * x.min) / 100; o.noPts = true; }
            if (x.effect === "DamageCasterSpamton") { base = S.spam; el = -1; o.noPts = true; o.noRes = true; }
            // hypothèse : les dégâts bonus selon les PV manquants (Aleera, Rongeur Nuageux) ne sont pas publiés, seul le socle est joué
            // une attaque qui tombe sur une carte alliée (cible aléatoire du terrain) la blesse comme n'importe quelle autre
            const dealt = dealHit(S, sides[t.side], c, t, base, el, crit, critM, brut, mult, o);
            dealtTotal += dealt;
            hitTargets.add(t);
            chainHit.set(x.chain, [...(chainHit.get(x.chain) ?? []), t]);
          }
        }
        if (a.textAoe && main) for (const di of [-1, 1]) {
          const n = E.cards[main.i + di];
          if (n && n.alive) rawDamage(n, (dealtTotal * a.textAoe) / 100, c);
        }
        if (a.textVamp && dealtTotal > 0) healCard(c, (dealtTotal * a.textVamp) / 100, c);
        for (const t of hitTargets) {
          if (t.side === c.side || !t.alive || immune(t)) continue;
          if (doFreeze) freeze(t, 60, c); // hypothèse : dégâts du dégel = ceux du Tox Gel (60)
          if (a.textEternity) changeCd(t, 1, true);
          for (let v = 0; v < a.textVanish && !t.insVan && t.tox.length; v++) { const lost = t.tox.pop()!; if (log) say(`  ⌫ Disparition : ${nm(t)} perd « ${lost.fam} »`); }
          if (x_reset(acts)) for (let k = 0; k < t.cd.length; k++) t.cd[k] = t.abs[k]?.cd ?? t.cd[k];
        }
        if (tx(c, "taunt")) { S.taunt = c; S.tauntLeft = 1; } // Provocation (Tox) : en attaquant
        if (c.multicolor) for (let e = 0; e < 6; e++) addPts(S, E, e, c.multicolor);
        if (c.tk === "Erreur Croissante") { const o = pick(alive(E)); if (o && !immune(o)) o.accB -= c.tv; }
      } else if (hasDmgNow && c.inv) {
        // Inversement : les dégâts deviennent des soins
        const t = lowestAlly(S);
        if (t) for (const x of dmgActs) healCard(t, (roll(x) + c.baseB) * (1 + 0.1 * (x.el >= 0 ? S.pts[x.el] * mult : 0)) * (crit ? critM : 1) * (1 + berserk(S)), c);
      }
      applyEffects(S, E, c, a, ai, acts, crit, critM, mult, roll, main, hitTargets, chainHit);
      if (doFreeze && !hasDmgNow) { const t = main ?? pickTarget(S, E, c, a, brut, acts); if (t) freeze(t, 60, c); }
      if (a.taunt === "self") { S.taunt = c; S.tauntLeft = a.tauntTurns; }
      else if (a.taunt === "randomAlly") { const t = pick(alive(S).filter((x) => x !== S.taunt)); if (t) { S.taunt = t; S.tauntLeft = 1; } }
    }
    c.revealed = true;
    if (free) return;
    // recharge
    if (a.uses > 0) c.uses[ai] -= 1;
    const echo = a.echo + c.echoB;
    let cd = a.cd;
    if (a.cdPerDead) cd = Math.max(1, cd - (S.dead.length + E.dead.length));
    if (echo > 0 && rng() * 100 < echo) {
      c.cd[ai] = 0;
      if (c.tk === "echo") { c.max += c.tv; c.hp += c.tv; }
    } else c.cd[ai] = cd;
  };
  const x_reset = (acts: CAction[]) => acts.some((x) => x.effect === "ResetCooldownTarget");

  /** Effets autres que les dégâts directs. */
  const applyEffects = (
    S: RSide, E: RSide, c: RCard, a: CAbility, ai: number, acts: CAction[], crit: boolean, critM: number, mult: number,
    roll: (x: CAction) => number, main: RCard | null, hitTargets: Set<RCard>, chainHit: Map<number, RCard[]>,
  ) => {
    let healTarget: RCard | null = null;
    const enemyTargets = (): RCard[] => {
      if (hitTargets.size) return [...hitTargets].filter((t) => t.side !== c.side && t.alive);
      if (/Cible toutes les cartes adverses/.test(a.text)) return alive(E);
      const t = pickTarget(S, E, c, a, false, acts);
      return t ? [t] : [];
    };
    const allyTarget = (): RCard | null => {
      if (/du lanceur|pour le lanceur|au lanceur|^Se /m.test(a.text)) return c;
      return healTarget ?? bestAlly(S);
    };
    const allyGroup = (): RCard[] => (a.alliesAll || /toutes les cartes alliées/.test(a.text) ? alive(S) : [allyTarget()].filter((x): x is RCard => !!x));
    for (const x of acts) {
      if (isDmgEffect(x.effect) || x.effect === "DamageOpponentHPMAX" || x.effect === "DamageCasterSpamton") continue;
      const v = roll(x);
      switch (x.effect) {
        case "AddAllPlayerAttack": {
          if (x.min === 0 && x.max === 0) break;
          if (x.el >= 0) addPts(S, E, x.el, v);
          else if (/(tous les|chaque) élément/i.test(a.text)) for (let e = 0; e < 6; e++) addPts(S, E, e, v);
          else addPts(S, E, Math.floor(rng() * 6), v);
          break;
        }
        case "AddAllPlayerAttackRandomTeam": addPts(S, E, Math.floor(rng() * 6), v); break;
        case "AddAllPlayerAttackCountActivation1": if (x.el >= 0) { addPts(S, E, x.el, v + c.stack[ai]); c.stack[ai] += 1; } break;
        case "AddAllPlayerAttackWithCardType": addPts(S, E, c.elCur, v); break;
        case "ChangeElementTargetRandom": { let e = Math.floor(rng() * 6); if (e === c.elCur) e = (e + 1) % 6; c.elCur = e; break; }
        case "StealElement": if (x.el >= 0) { const st = Math.max(0, Math.min(v, E.pts[x.el])); E.pts[x.el] -= st; S.pts[x.el] += st; } break;
        case "healTarget": case "healCaster": case "healCasterWithoutElement": {
          const t = x.effect !== "healTarget" ? c : a.randAlly ? (pick(alive(S)) ?? null) : (healTarget ?? (healTarget = lowestAlly(S)));
          if (!t) break;
          const pts = x.el >= 0 && x.effect !== "healCasterWithoutElement" ? S.pts[x.el] * mult : 0;
          const amt = v * (1 + 0.1 * pts) * (crit ? critM : 1) * (1 + berserk(S));
          if (c.inv) {
            // Inversement : les soins deviennent des dégâts
            const e = pickTarget(S, E, c, a, !!tx(c, "brut"), acts);
            if (e) dealHit(S, E, c, e, v, x.el, crit, critM, !!tx(c, "brut"), mult);
            break;
          }
          const healed = healCard(t, amt, c);
          if (log) say(`  ${nm(c)} soigne ${nm(t)} +${Math.floor(healed)}`);
          const aoe = tx(c, "aoe");
          if (aoe) for (const di of [-1, 1]) { const n = S.cards[t.i + di]; if (n && n.alive) healCard(n, (amt * aoe.v) / 100, c); }
          const fr = tx(c, "freeze"); if (fr && t !== c) freeze(t, fr.v, c); // « les dégâts et les soins de cette carte gèlent leur cible »
          if (tx(c, "temporality") && !c.inv) changeCd(t, -1, false);
          break;
        }
        case "healPVmaxTarget": case "healPVmaxCaster": {
          const t = /Se soigne|se soigner/.test(a.text) || x.effect === "healPVmaxCaster" ? c : lowestAlly(S);
          if (t) healCard(t, (t.max * v) / 100, c);
          break;
        }
        case "healAllPlayerCard": for (const t of S.cards) healCard(t, v * (1 + 0.1 * (x.el >= 0 ? S.pts[x.el] * mult : 0)) * (1 + berserk(S)), c); break;
        case "AddCardHPMax": c.max += v; c.hp += v; break;
        case "AddAllPlayerHPMax": for (const t of S.cards) if (t.alive) { t.max += v; t.hp += v; } break;
        case "AddOppHPMax": {
          if (v < 0) {
            // Transfusion : vole des PV max à un allié
            const donor = alive(S).filter((t) => t !== c).sort((p, q) => q.max - p.max)[0];
            if (donor) { donor.max = Math.max(1, donor.max + v); donor.hp = Math.min(donor.hp, donor.max); }
          } else { const t = allyTarget(); if (t) { t.max += v; t.hp += v; } }
          break;
        }
        case "RemoveTauntRunning": if (S.taunt) { healTarget = S.taunt; S.taunt = null; } break;
        case "AddCooldown": {
          const val = c.inv ? -x.min : x.min;
          const own = (a.randField || a.randEnemy) && chainHit.has(x.chain) ? chainHit.get(x.chain)!.filter((t) => t.alive) : null;
          if (own) {
            // cibles aléatoires : Éternité/Temporalité s'applique à la carte touchée par l'attaque de la même chaîne
            for (const t of own) changeCd(t, val, t.side !== c.side);
          } else if (val > 0) {
            const ts = a.cdAllField ? allCards().filter((t) => t.alive) : enemyTargets();
            for (const t of ts) changeCd(t, val, t.side !== c.side);
          } else {
            const ts = a.cdAllies ? alive(S) : hitTargets.size ? [...hitTargets] : [bestAlly(S, (t) => t.cd.some((k) => k > 0)) ?? c];
            for (const t of ts) changeCd(t, val, false);
          }
          break;
        }
        case "ResetCooldownTarget": break; // appliqué avec les dégâts
        case "AddCardCriticChance": for (const t of a.alliesAll ? alive(S) : [c]) t.critB += v; break;
        case "AddOppCardCriticChance": {
          const g = /aléatoirement sur une carte alliée/.test(a.text) ? [pick(alive(S))].filter((t): t is RCard => !!t) : allyGroup();
          for (const t of g) t.critB += v;
          break;
        }
        case "AddAllPlayerCritick": for (const t of S.cards) t.critB += v; break;
        case "AddAllOpponentCritick": for (const t of E.cards) t.critB += v; break;
        case "AddCardCriticRatio": c.critMB += v; break;
        case "AddOppCardCriticRatio": {
          const g = /toutes les cartes du terrain/.test(a.text) ? allCards() : allyGroup();
          for (const t of g) t.critMB += v;
          break;
        }
        // Précision : une valeur « Miss » positive fait perdre de la précision, négative en fait gagner
        case "AddCardMiss": c.accB -= v; break;
        case "AddAllPlayerMiss": for (const t of S.cards) t.accB -= v; break;
        case "AddOppCardMiss": {
          if (v > 0) { for (const t of enemyTargets()) if (!immune(t)) t.accB -= v; }
          else for (const t of allyGroup()) t.accB -= v;
          break;
        }
        case "AddOppAbilityMiss": {
          if (v > 0) { for (const t of enemyTargets()) if (!immune(t)) t.accB -= v; }
          else for (const t of /alliées/.test(a.text) ? alive(S) : [c]) t.accB -= v;
          break;
        }
        case "AddCardBaseDamage": c.baseB += v; break;
        case "AddAbilityBaseDamage": c.abB[ai] += v; break;
        case "AddOppCardBaseDamage": for (const t of allyGroup()) t.baseB += v; break;
        case "AddOppCardBaseDamageCountActivation1": { const t = pick(alive(S)); if (t) t.baseB += v + c.frenzy; c.frenzy += 1; break; }
        case "AddSpamton": S.spam += v; break;
        case "AddSpamtonGenerationCaster": c.gen += v; break;
        case "AddLuck": S.luck += v; break;
        case "ResetSpamton": E.spam = 0; break;
        case "StealOppHPMax": {
          const amt = Math.abs(v);
          for (const t of alive(E)) {
            if (immune(t)) continue;
            const st = Math.min(amt, t.max - 1);
            t.max -= st; t.hp = Math.min(t.hp, t.max);
            c.max += st; c.hp += st;
          }
          break;
        }
        case "SetHPInPercent": {
          // Cornu : « la cible se retrouve à X % de ses PV max » — joué sur l'ennemi le plus haut en PV
          const t = alive(E).filter((e) => !immune(e)).sort((p, q) => q.hp / q.max - p.hp / p.max)[0];
          if (t && t.hp > (t.max * v) / 100) { const loss = t.hp - (t.max * v) / 100; rawDamage(t, loss, c); }
          break;
        }
        case "Resurection": {
          const t = S.dead[S.dead.length - 1];
          if (t && !t.alive) {
            S.dead.pop();
            t.alive = true; t.hp = (t.max * (x.min || 50)) / 100; t.poison = [];
            if (log) say(`✦ ${nm(t)} est ressuscitée`);
          }
          break;
        }
        case "HealCasterWithOppHPMAX": {
          if (a.absorbAlly) break;
          const t = alive(E).filter((e) => !immune(e)).sort((p, q) => q.max - p.max)[0];
          if (t) { c.max += t.max; if (log) say(`  ${nm(c)} absorbe ${nm(t)}`); kill(t, c); }
          break;
        }
        case "AddPImmunity": {
          const t = bestAlly(S, (u) => !immune(u));
          if (t) addTox(t, mkTox("immunity", 2));
          break;
        }
        case "AddCardResistance": case "AddOppCardResistance": case "AddAllPlayerResistance": {
          let val = v;
          if (/Baisse|Diminue|réduit|Réduit/.test(a.text) && val > 0) val = -val;
          let group: RCard[];
          if (/de l'adversaire|adverse/.test(a.text) && val < 0) group = enemyTargets().filter((t) => !immune(t));
          else if (/Cible toutes les cartes adverses/.test(a.text)) group = alive(E).filter((t) => !immune(t));
          else if (a.alliesAll || x.effect === "AddAllPlayerResistance" || /toutes les cartes alliées/.test(a.text)) group = alive(S);
          else if (/lanceur/.test(a.text)) group = [c];
          else if (/carte ciblée/.test(a.text) && val < 0) group = enemyTargets().filter((t) => !immune(t));
          else if (a.hasDmg) group = main ? [main].filter((t) => !immune(t)) : [];
          else group = healTarget ? [healTarget] : [c];
          const els = x.el >= 0 ? [x.el] : /aléatoire/.test(a.text) ? [Math.floor(rng() * 6)] : [0, 1, 2, 3, 4, 5];
          for (const g of group) for (const e of els) g.res[e] = clampRes(g.res[e] + val);
          break;
        }
        default: break;
      }
    }
    void critM;
  };

  /* ----- capacités jouables ce tour ----- */
  const canCast = (S: RSide, E: RSide, c: RCard, ai: number): boolean => {
    const a = c.abs[ai];
    if (!a) return false; // la carte s'est transformée pendant le tour
    if (c.cd[ai] > 0 || (a.uses > 0 && c.uses[ai] <= 0)) return false;
    for (const k of a.cost) if (S.pts[k.el] < k.amt) return false;
    if (a.hpCost && c.hp <= a.hpCost) return false;
    if (a.absorbAlly) return false; // Avalement : sacrifier un allié n'est jamais joué par l'IA
    if (a.needsTaunt && !(S.taunt && S.taunt.alive)) return false;
    const effs = a.actions.map((x) => x.effect);
    if (effs.includes("Resurection") && !S.dead.length) return false;
    if (effs.includes("AddPImmunity") && !S.cards.some((u) => u.alive && !immune(u))) return false;
    if (effs.includes("SetHPInPercent")) {
      const v = a.actions.find((x) => x.effect === "SetHPInPercent")!.min;
      if (!E.cards.some((t) => t.alive && !immune(t) && t.hp > (t.max * v) / 100 + 40)) return false;
    }
    if (effs.includes("HealCasterWithOppHPMAX") && !E.cards.some((t) => t.alive && !immune(t))) return false;
    if (effs.includes("AddOppHPMax") && a.actions.some((x) => x.effect === "AddOppHPMax" && x.min < 0) && c.hp > c.max * 0.7) return false;
    if (a.hasHeal && !a.hasDmg && !a.engine) {
      const hurt = S.cards.some((x) => x.alive && x.hp < x.max * 0.88);
      const buffs = a.actions.some((x) => /^Add/.test(x.effect));
      if (!hurt && !buffs) return false;
    }
    if (a.actions.length === 0 || a.actions.every((x) => x.effect === "_NULL")) {
      if (a.taunt === "none") return false;
    }
    return true;
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
    const healer = c.d.healRate > 0;
    switch (f.fam) {
      case "berserk": return v / 100;
      case "heart": {
        let sh = 0; for (const x of al) sh += x.d.dmgRate[f.el ?? 0] * (1 + 0.1 * S.pts[f.el ?? 0]);
        return (sh / team) * Math.min(1.6, 0.05 * v * rem) / (1 + 0.05 * S.pts[f.el ?? 0]);
      }
      case "heartres": return 0.012 * v * Math.min(rem, 10) / 10;
      case "spamland": return 0.004 * v * Math.min(1, rem / 8);
      case "vital": return ((v * rem) / hpTot) * 0.9;
      case "regen": return (v / 100) * rem * hpShare * 0.7;
      case "shield": return (v / 100) * 0.22 * (0.5 + hpShare);
      case "reflect": return (v / 100) * 0.16;
      case "vamp": return (v / 100) * share * 0.45 + 0.01;
      case "poison": return (v / 100) * 3 * Math.min(rem, 8) * castRate * 0.55;
      case "erosion": return (v / 100) * share * 0.45;
      case "multiplier": { let p = 0; for (let e = 0; e < 6; e++) p += c.d.dmgRate[e] * S.pts[e]; const w = p / (c.d.dmgRate.reduce((a, b) => a + b, 0) || 1); return share * Math.min(1.2, 0.1 * w) * 0.9; }
      case "phoenix": return (v / 100) * hpShare * 0.85 + 0.02;
      case "immunity": return 0.06 * (0.4 + hpShare); // protège des effets (poison, gel, Éternité…), pas des dégâts
      case "tenacity": return 0.035;
      case "punching": return 0.02 * v * Math.min(rem, 8) / 4;
      case "brut": { let prot = 0; for (const x of alive(E)) if (tx(x, "shield") || x.res.some((rr) => rr > 15)) prot++; return 0.04 + 0.12 * share + 0.03 * prot; }
      case "optimization": return 0.04 * share * 3;
      case "graveyard": return 0.025 * v;
      case "lucky": return t < 8 ? 0.03 * v : 0;
      case "bomba": return 0.13;
      case "revenge": return 0.1 * share + 0.04;
      case "avenger": return 0.08 + 0.1 * share;
      case "reset": return 0.1 * castRate;
      case "taunt": return 0.05 * hpShare * 2;
      case "camo": return 0.1 * (0.3 + hpShare);
      case "smoke": return 0; // effet non publié : jamais acheté par l'IA
      case "mimicry": return 0.08;
      case "backlash": return -1;
      case "freeze": return (healer ? -0.05 : 0) + 0.22 * share + 0.03;
      case "eternity": return 0.2 * share;
      case "temporality": return healer ? 0.08 : 0.01;
      case "vanish": return 0.04;
      case "aoe": return (v / 100) * share * 1.3 + (healer ? 0.03 : 0);
      case "inversion": {
        // les soins deviennent des dégâts (gain) mais les dégâts deviennent des soins et les soins sont perdus (coût)
        const gain = c.d.healRate * 0.6 - c.d.dmgRate.reduce((p, q) => p + q, 0);
        return gain > 8 ? Math.min(0.15, gain / 200) : -1;
      }
      case "metamorph": return c.d.threat < 25 ? 0.03 : -1; // pari : seulement sur une carte faible
      case "mystery": return 0.05;
      default: return 0;
    }
  };
  const shop = (S: RSide, E: RSide, s: number) => {
    const t = S.turn;
    const P = AI[s];
    let rerolls = 0;
    for (let guard = 0; guard < 6; guard++) {
      const buys: { f: ToxFamily; r: number; c: RCard; u: number; price: number }[] = [];
      const free = S.cards.filter((c) => c.alive && c.abs.length + c.tox.length < SLOTS);
      for (let k = 0; k < 3; k++) {
        const r = rollRarity(S.luck);
        const pool = byR[r].length ? byR[r] : byR[0];
        const f = pool[Math.floor(rng() * pool.length)];
        const rr = f.vals[r] === null ? 0 : r;
        const price = f.prices[rr];
        if (price === null || S.spam < price) continue;
        for (const c of free) {
          let u = utility(S, E, c, f, rr, t);
          if (u > 0) u *= P.fam[f.fam] ?? 1;
          u -= P.priceW * price;
          buys.push({ f, r: rr, c, u, price });
        }
      }
      buys.sort((x, y) => y.u - x.u);
      const cands = buys.slice(0, 4);
      const thr = P.shopThr * Math.max(0.25, 1 - t / P.shopDecay);
      const cost = rerolls === 0 && S.casino ? 0 : 10 + 5 * rerolls;
      const canReroll = rerolls < 3 && S.spam >= cost;
      const nOpt = cands.length + (canReroll ? 1 : 0) + 1;
      const iReroll = canReroll ? cands.length : -1;
      let ch = cands.length && cands[0].u >= thr ? 0
        : canReroll && rerolls < P.rerollMax && t < P.rerollTurn && S.spam >= cost + P.rerollReserve ? iReroll : nOpt - 1;
      let feats: number[][] | undefined;
      if (opts.choose || P.sW) {
        const bestU = cands.length ? cands[0].u : 0;
        const tt = t / 20, sp = S.spam / 100;
        feats = [];
        for (let i = 0; i < nOpt; i++) {
          if (i < cands.length) {
            const b = cands[i];
            const hpTot = S.cards.reduce((p, x) => p + (x.alive ? x.max : 0), 0) || 1;
            feats.push([1, 0, b.u, b.u * tt, b.price / 100, tt, sp, 0, 0, 0, 0, b.r / 3, (S.spam - b.price) / 100, b.c.max / hpTot, b.c.hp / b.c.max]);
          } else if (i === iReroll) feats.push([0, 1, 0, 0, 0, 0, 0, tt, sp, bestU, cost / 100, 0, 0, 0, 0]);
          else feats.push(new Array(15).fill(0));
        }
        if (P.sW) {
          let bs = -1e9;
          feats.forEach((f, i) => { let v = 0; for (let q = 0; q < f.length; q++) v += f[q] * (P.sW![q] ?? 0); if (v > bs) { bs = v; ch = i; } });
        }
      }
      if (opts.choose && nOpt > 1) {
        const cc = cands;
        ch = decide({
          kind: "shop", side: s as 0 | 1, turn: t, n: nOpt, def: ch, feat: feats,
          label: (i) => i < cc.length ? `Acheter ${cc[i].f.name} (${["C", "R", "E", "L"][cc[i].r]}, ${cc[i].price}) pour ${cc[i].c.d.name}` : i === iReroll ? `Relancer la boutique (${cost})` : "Passer (+10 Spamtons)",
        });
      }
      if (ch < cands.length) {
        const best = cands[ch];
        S.spam -= best.price;
        if (S.petit && !S.boughtOnce) S.spam += best.price;
        S.boughtOnce = true;
        giveTox(S, best.c, best.f, best.r);
        if (log) say(`🛒 ${s === 0 ? "A" : "B"} achète ${best.f.name} (${["C", "R", "E", "L"][best.r]}) pour ${best.c.d.name} (${best.price})`);
        return;
      }
      if (ch === iReroll) { S.spam -= cost; rerolls++; if (log) say(`🔄 ${s === 0 ? "A" : "B"} relance la boutique (${cost})`); continue; }
      S.spam += 10;
      return;
    }
  };
  const giveTox = (S: RSide, c: RCard, f: ToxFamily, r: number) => {
    const tox: Tox = { fam: f.fam, r, v: f.vals[r] as number, el: f.el ?? -1 };
    if (c.frozen) breakIce(c, null); // « un nouveau Tox brise la glace »
    if (tox.fam === "inversion") c.inv = true;
    if (tox.fam === "metamorph") metamorph(c, (c.hp / c.max) * 100);
    else if (tox.fam === "mystery") grantMystery(c);
    else c.tox.push(tox);
    S.bought.push(`${f.fam}${f.el !== undefined ? ":" + f.el : ""}:${r}`);
  };
  /** Expérience d'impact : Tox offert à la meilleure carte (selon l'IA) au tour indiqué. */
  const gift = (S: RSide, E: RSide, s: number) => {
    const g = opts.giftTox;
    if (!g || g.side !== s || S.turn !== g.turn) return;
    const f = comp.tox.find((x) => x.fam === g.fam && (g.fam !== "heart" || x.el === g.el));
    if (!f || f.vals[g.r] === null) return;
    let best: RCard | null = null, bu = -1e9;
    for (const c of S.cards) if (c.alive && c.abs.length + c.tox.length < SLOTS) { const u = utility(S, E, c, f, g.r, S.turn); if (u > bu) { bu = u; best = c; } }
    if (!best) for (const c of S.cards) if (c.alive) { best = c; break; }
    if (best) giveTox(S, best, f, g.r);
  };


  /** Tour « libre » : la boutique (tours pairs) s'ouvre en premier et doit être réglée (acheter ou passer, relances et bannissement possibles), puis les capacités se lancent dans l'ordre voulu jusqu'à « Terminer le tour ». Renvoie true si la partie est finie. */
  const banned: Set<string>[] = [new Set(), new Set()];
  const freeTurn = (S: RSide, E: RSide, s: number): boolean => {
    const t = S.turn;
    const P = AI[s];
    const who = s === 0 ? "A" : "B";
    type Off = { f: ToxFamily; r: number; price: number };
    const rollOffer = (): Off | null => {
      for (let g = 0; g < 30; g++) {
        const r = rollRarity(S.luck);
        const pool = (byR[r].length ? byR[r] : byR[0]).filter((f) => !banned[s].has(f.fam + (f.el ?? "")));
        if (!pool.length) continue;
        const f = pool[Math.floor(rng() * pool.length)];
        const rr = f.vals[r] === null ? 0 : r;
        const price = f.prices[rr];
        if (price !== null) return { f, r: rr, price };
      }
      return null;
    };
    let shopOpen = t % 2 === 0;
    let offers: (Off | null)[] = shopOpen ? [rollOffer(), rollOffer(), rollOffer()] : [];
    let rerolls = 0, banUsed = false;
    const nc = new Array<number>(32).fill(0);
    for (let guard = 0; guard < 120; guard++) {
      if (!anyAlive(E)) return true;
      if (!anyAlive(S)) return true;
      const opts_: { ref: Ref; label: string; u?: number; pr?: number; n?: number }[] = [];
      // la boutique s'ouvre au début du tour : elle se règle d'abord (acheter ou passer), ensuite seulement les capacités
      if (!shopOpen) for (const c of S.cards) {
        if (!c.alive || c.frozen) continue;
        for (let ai = 0; ai < c.abs.length; ai++) {
          const n = nc[c.i * 8 + ai];
          if (n >= 7 || !canCast(S, E, c, ai)) continue;
          opts_.push({ ref: { tag: "cast", card: c.i, ab: ai }, label: `${c.d.name} : ${c.abs[ai].name}`, pr: P.pr[c.abs[ai].prio] ?? c.abs[ai].prio, n });
        }
      }
      const cost = rerolls === 0 && S.casino ? 0 : 10 + 5 * rerolls;
      if (shopOpen) {
        const free = S.cards.filter((c) => c.alive && c.abs.length + c.tox.length < SLOTS);
        offers.forEach((o, k) => {
          if (!o || S.spam < o.price) return;
          for (const c of free) {
            let u = utility(S, E, c, o.f, o.r, t);
            if (u > 0) u *= P.fam[o.f.fam] ?? 1;
            u -= P.priceW * o.price;
            opts_.push({ ref: { tag: "buy", offer: k, card: c.i }, label: `Acheter ${o.f.name} (${["C", "R", "E", "L"][o.r]}, ${o.price}) pour ${c.d.name}`, u });
          }
        });
        if (rerolls < 6 && S.spam >= cost) opts_.push({ ref: { tag: "reroll" }, label: `Relancer la boutique (${cost})` });
        opts_.push({ ref: { tag: "skip" }, label: "Passer la boutique (+10 Spamtons)" });
        if (!banUsed) offers.forEach((o, k) => { if (o) opts_.push({ ref: { tag: "ban", offer: k }, label: `Bannir la famille ${o.f.name}` }); });
      }
      if (!shopOpen) opts_.push({ ref: { tag: "end" }, label: "Terminer le tour" });
      if (!opts_.length || (!shopOpen && opts_.length === 1)) break; // plus rien à faire
      // conseil : meilleur achat s'il dépasse le seuil de l'IA, sinon la capacité la plus prioritaire, sinon passer / finir
      const thr = P.shopThr * Math.max(0.25, 1 - t / P.shopDecay);
      let def = -1, bu = -1e9;
      opts_.forEach((o, i) => { if (o.ref.tag === "buy" && o.u! > bu) { bu = o.u!; def = i; } });
      if (def < 0 || bu < thr) {
        def = -1;
        let bn = 1e9, bp = 1e9;
        opts_.forEach((o, i) => { if (o.ref.tag === "cast" && (o.n! < bn || (o.n === bn && o.pr! < bp))) { bn = o.n!; bp = o.pr!; def = i; } });
      }
      if (def < 0) def = opts_.findIndex((o) => o.ref.tag === (shopOpen ? "skip" : "end"));
      const shopView: ShopView | null = shopOpen ? {
        rerollCost: cost, banUsed,
        offers: offers.map((o) => o && { fam: o.f.fam, name: o.f.name, group: o.f.group, el: o.f.el ?? -1, r: o.r, price: o.price, desc: o.f.desc, value: o.f.vals[o.r] ?? 0, affordable: S.spam >= o.price }),
      } : null;
      const snapshot = opts_;
      const ch = decide({ kind: "turn", side: s as 0 | 1, turn: t, n: snapshot.length, def, label: (i) => snapshot[i].label, ref: (i) => snapshot[i].ref, shop: shopView });
      const o = snapshot[ch] ?? snapshot[def];
      const ref = o.ref;
      if (ref.tag === "end") { if (log) say(`⏹ ${who} termine son tour`); break; }
      if (ref.tag === "cast") {
        nc[ref.card * 8 + ref.ab]++;
        castAbility(S, E, S.cards[ref.card], ref.ab);
      } else if (ref.tag === "buy") {
        const of = offers[ref.offer]!;
        const c = S.cards[ref.card];
        S.spam -= of.price;
        if (S.petit && !S.boughtOnce) S.spam += of.price;
        S.boughtOnce = true;
        giveTox(S, c, of.f, of.r);
        if (log) say(`🛒 ${who} achète ${of.f.name} (${["C", "R", "E", "L"][of.r]}) pour ${c.d.name} (${of.price})`);
        shopOpen = false;
      } else if (ref.tag === "reroll") {
        S.spam -= cost; rerolls++;
        offers = [rollOffer(), rollOffer(), rollOffer()];
        if (log) say(`🔄 ${who} relance la boutique (${cost})`);
      } else if (ref.tag === "skip") {
        S.spam += 10; shopOpen = false;
        if (log) say(`⏭ ${who} passe la boutique (+10 Spamtons)`);
      } else if (ref.tag === "ban") {
        const of = offers[ref.offer]!;
        banned[s].add(of.f.fam + (of.f.el ?? ""));
        banUsed = true;
        offers = offers.map((x) => (x && banned[s].has(x.f.fam + (x.f.el ?? "")) ? rollOffer() : x));
        if (log) say(`🚫 ${who} bannit la famille ${of.f.name} pour le reste de la partie`);
      }
    }
    return false;
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
    if (log) say(`— Tour ${t} · joueur ${s === 0 ? "A" : "B"} —`);
    let lucky = 0;
    for (const c of S.cards) if (c.alive) { const l = tx(c, "lucky"); if (l) lucky += l.v; c.revealed = false; }
    for (const c of E.cards) c.shieldUsed = false; // Bouclier : « au début de chaque tour ennemi »
    S.luck += 1 + lucky;
    if (t >= 20) for (const c of S.cards) if (c.alive) rawDamage(c, c.max * (0.1 + 0.03 * (t - 20)), null);
    let income = t;
    for (const c of S.cards) if (c.alive) {
      income += c.d.spamton + c.gen;
      const sp = tx(c, "spamland"); if (sp) income += sp.v;
    }
    S.spam += income;
    for (const c of S.cards) if (c.alive && c.tk === "13eme mois" && !S.got100 && S.spam >= 100) { S.got100 = true; S.spam += c.tv; }
    for (const c of S.cards) {
      if (!c.alive) continue;
      if (c.doubleAt && c.doubleAt === t) { c.hp *= 2; c.max *= 2; }
      // talents de début de tour
      switch (c.tk) {
        case "Affaiblissement": for (const o of E.cards) if (o.alive && !immune(o)) for (let e = 0; e < 6; e++) o.res[e] = clampRes(o.res[e] - Math.abs(c.tv)); break;
        case "BouleDeCrit": c.critB += c.tv; break;
        case "Fortune": c.gen += c.tv; break;
        case "Incisif": for (const o of S.cards) if (o.alive) { o.critB += c.tv; o.accB += c.tv; } break;
        case "Focus": if (rng() < 0.25) { S.taunt = c; S.tauntLeft = 1; } break;
        case "SursautVital": if (c.hp < c.max * 0.1) c.hp = c.max; break;
        case "TRevitalisation": if (!c.once.has("revit") && t <= 20 && c.hp < c.max * 0.35) { c.once.add("revit"); c.hp = c.max; } break;
        case "Longueur": if (t === 1) { const o = pick(alive(E)); if (o) changeCd(o, 1, true); } break;
        case "Reducteur": if (t === 1) { const o = pick(alive(S)); if (o) changeCd(o, -1, false); } break;
        case "Bombe-8": if (t === 8) addTox(c, mkTox("bomba", 2)); break;
        case "Immunite-6": if (t === 6) addTox(c, mkTox("immunity", 2)); break;
        case "Souffle-8": case "Jugement-6": {
          const at = c.tk === "Souffle-8" ? 8 : 6;
          if (t !== at) break;
          let ab: CAbility | undefined;
          if (c.tk === "Souffle-8") {
            const el = c.elCur;
            ab = { ...BREATH, actions: [{ effect: "damage", kind: "damage", min: 30, max: 30, el, chain: 0 }], dmg: [{ effect: "damage", kind: "damage", min: 30, max: 30, el, chain: 0 }] };
          } else ab = pick(comp.cards.flatMap((x) => x.abilities.filter((y) => y.hasDmg && !y.cost.length)));
          if (!ab) break;
          if (c.abs.length) { const k = c.abs.length - 1; c.abs[k] = ab; c.cd[k] = 0; c.uses[k] = ab.uses; c.abB[k] = 0; c.stack[k] = 0; }
          else { c.abs.push(ab); c.cd.push(0); c.uses.push(ab.uses); c.abB.push(0); c.stack.push(0); }
          break;
        }
        case "Anticipation":
          if (t === 1 && !c.once.has("antic")) {
            c.once.add("antic");
            const tgt = pick(alive(E)) ?? null;
            for (let k = 0; k < c.abs.length; k++) if (anyAlive(E) && !c.abs[k].cost.length) castAbility(S, E, c, k, tgt, true);
          }
          break;
        default: break;
      }
      for (const x of c.tox) {
        if (x.fam === "heart" && x.el >= 0) addPts(S, E, x.el, x.v, false);
        else if (x.fam === "heartres") for (const o of S.cards) for (let e = 0; e < 6; e++) o.res[e] = Math.min(50, o.res[e] + x.v);
        else if (x.fam === "vital") { c.max += x.v; c.hp += x.v; }
        else if (x.fam === "regen") healCard(c, (c.max * x.v) / 100, c);
      }
      if (c.poison.length) {
        for (const p of c.poison) rawDamage(c, (c.max * p.pct) / 100, null);
        c.poison = c.poison.map((p) => ({ pct: p.pct, t: p.t - 1 })).filter((p) => p.t > 0);
      }
    }
    if (!anyAlive(S)) return;
    gift(S, E, s);
    if (opts.choose && opts.free === s) {
      if (freeTurn(S, E, s)) return;
    } else {
      if (t % 2 === 0) shop(S, E, s);
      // capacités : l'IA choisit l'ordre (par défaut : priorité, chaque capacité une fois avant les relances par Écho)
      const nc = new Array<number>(32).fill(0);
      const P = AI[s];
      const muted = opts.mute && opts.mute.side === s ? opts.mute : null;
      for (let guard = 0; guard < 60; guard++) {
        if (!anyAlive(E)) return;
        const ready: { c: RCard; ai: number; pr: number; n: number }[] = [];
        for (const c of S.cards) {
          if (!c.alive || c.frozen) continue;
          for (let ai = 0; ai < c.abs.length; ai++) {
            const n = nc[c.i * 8 + ai];
            if (n >= 7 || (muted && muted.card === c.i && muted.ab === ai)) continue;
            if (canCast(S, E, c, ai)) ready.push({ c, ai, pr: P.pr[c.abs[ai].prio] ?? c.abs[ai].prio, n });
          }
        }
        if (!ready.length) break;
        let bi = 0;
        for (let k = 1; k < ready.length; k++) {
          const x = ready[k], b = ready[bi];
          if (x.n < b.n || (x.n === b.n && x.pr < b.pr)) bi = k;
        }
        if (opts.choose && ready.length > 1) {
          const rr = ready;
          bi = decide({ kind: "cast", side: s as 0 | 1, turn: t, n: rr.length, def: bi, label: (i) => `${rr[i].c.d.name} : ${rr[i].c.abs[rr[i].ai].name}` });
        }
        const r = ready[bi];
        nc[r.c.i * 8 + r.ai]++;
        castAbility(S, E, r.c, r.ai);
      }
    }
    for (const c of S.cards) {
      if (!c.alive) continue;
      for (let k = 0; k < c.cd.length; k++) if (c.cd[k] > 0) c.cd[k]--;
      c.frozen = false; // le gel dure jusqu'à la fin du tour de la carte gelée
      c.frozenVal = 0;
    }
    // la Provocation adverse dure jusqu'à la fin de ce tour (ou plus pour « pendant 2 tours »)
    if (E.taunt) { E.tauntLeft--; if (E.tauntLeft <= 0) E.taunt = null; }
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
  if (log) say(winner === -1 ? "Égalité" : `Victoire du joueur ${winner === 0 ? "A" : "B"}`);
  return { winner, turns, bought: [sides[0].bought, sides[1].bought], terrain, first };
}

/** Souffle élémentaire (talent « Souffle-8 ») : « Attaque 30 dans son élément ». Hypothèse : recharge 1, précision 100 %. */
const BREATH: CAbility = {
  name: "Souffle élémentaire", cd: 1, acc: 100, crit: 1, critMult: 2, uses: 0, echo: 0, actions: [], dmg: [], text: "Attaque 30 dans son élément",
  aoe: false, hasDmg: true, hasHeal: false, engine: false, prio: 3, alliesAll: false, critOnlyCd: false, cost: [], hpCost: 0, randEnemy: false,
  randField: false, randAlly: false, options: null, optFreeze: [], freeze: 0, textEternity: false, textVamp: 0, textAoe: 0, textVanish: 0, taunt: "none",
  tauntTurns: 1, critCond: [], cdPerDead: false, cdAllField: false, cdAllies: false, absorbAlly: false, needsTaunt: false,
};

export const terrainName = (t: number) => EL_FR[t] ?? "?";
