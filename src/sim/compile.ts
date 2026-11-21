/* Compilation du jeu de données SpamDex vers des structures optimisées pour le simulateur. */

export const EL = ["fire", "light", "earth", "nature", "shadow", "water", "divine"] as const;
export const EL_FR = ["Feu", "Lumière", "Terre", "Nature", "Ombre", "Eau", "Éther"];
export const elIdx = (e: string | null | undefined) => (e ? EL.indexOf(e as (typeof EL)[number]) : -1);

/* ---------- données brutes (partielles) ---------- */
export interface RawAction { effect: string; kind: string; min: number; max: number; element: string | null; chain: number }
export interface RawAbility {
  id: string; name: string; effect: string; effectRich: string; cooldown: number; elements: string[];
  precision: number; critChance: number; critMultiplier: number; duration: number; uses: number;
  cooldownResetChance: number; actions: RawAction[];
}
export interface RawTalent { slot: number; id: string; name: string; effect: string; effectRich: string; elements: string[]; grantsSkill: string | null; actions: RawAction[] }
export interface RawSkill { id: string; name: string; effect: string; effectRich: string; rarity: string; element: string | null; value: number; icon: string }
export interface RawCard {
  id: string; slug: string; number: number; name: string; element: string; rarity: string; spamton: number; hp: number;
  resistances: Record<string, number>;
  artwork: { file: string; small: string; tiny: string; width: number; height: number; artist: { name: string; link: string | null } | null };
  abilities: RawAbility[]; skills: RawSkill[]; talents: RawTalent[];
  lore?: { species?: string; region?: string; era?: string; text?: string };
  styles?: string[];
}
export interface RawDataset {
  schema: number; version: string; language: string; generatedAt: string; terms: string;
  elements: { id: string; name: string; order: number; icon: string; color: string }[];
  rarities: { id: string; name: string; order: number; gem: string; textColor: string | null }[];
  keywords: { id: string; title: string; description: string }[];
  cards: RawCard[];
}

/* ---------- Tox ---------- */
export type Fam =
  | "berserk" | "bomba" | "brut" | "erosion" | "multiplier" | "optimization" | "poison" | "reflect" | "revenge"
  | "avenger" | "lucky" | "graveyard" | "spamland" | "heart" | "heartres" | "mimicry" | "camo" | "backlash"
  | "vital" | "regen" | "immunity" | "phoenix" | "punching" | "reset" | "shield" | "smoke" | "taunt"
  | "tenacity" | "vamp" | "eternity" | "freeze" | "temporality" | "vanish" | "aoe" | "mystery";

export interface ToxFamily {
  fam: Fam;
  el?: number;
  name: string;
  group: string;
  vals: (number | null)[]; // C R E L
  prices: (number | null)[];
  desc: string;
  estimated?: boolean; // prix estimés (non publiés par SpamDex)
}
const N = null;
const HEART_PRICES = [15, 30, 60, 100];
const mk = (fam: Fam, name: string, group: string, vals: (number | null)[], prices: (number | null)[], desc: string, extra: Partial<ToxFamily> = {}): ToxFamily => ({ fam, name, group, vals, prices, desc, ...extra });

export const RAR_NAMES = ["Commun", "Rare", "Épique", "Légendaire"];
export const RAR_LETTER = ["C", "R", "E", "L"];

export const TOX_CATALOG: ToxFamily[] = [
  mk("berserk", "Berserk", "Dégâts", [12, 25, 50, 100], [30, 60, 100, 180], "Dégâts et soins de toutes vos cartes +X %"),
  mk("bomba", "Bomba", "Dégâts", [N, N, 500, N], [N, N, 130, N], "Inflige X dégâts bruts à une carte adverse quand cette carte meurt"),
  mk("brut", "Brut", "Dégâts", [N, 1, N, N], [N, 65, N, N], "Ignore résistances, boucliers et provocations"),
  mk("erosion", "Érosion", "Dégâts", [50, N, 100, N], [15, N, 75, N], "Réduit les PV max de la cible de X % des dégâts infligés"),
  mk("multiplier", "Multiplicateur", "Dégâts", [N, 2, N, N], [N, 100, N, N], "Bonus élémentaires doublés pour cette carte"),
  mk("optimization", "Optimisation", "Dégâts", [N, 1, N, N], [N, 40, N, N], "Toutes les valeurs variables prennent leur maximum"),
  mk("poison", "Poison", "Dégâts", [1, 3, 6, 8], [10, 50, 130, 180], "X % des PV max de la cible au début de ses tours, 3 tours"),
  mk("reflect", "Réflexion", "Dégâts", [25, 50, 75, 100], [24, 48, 72, 96], "Renvoie X % des dégâts subis à l'attaquant"),
  mk("revenge", "Vengeance", "Dégâts", [N, 1, N, N], [N, 80, N, N], "Détruite, la carte inflige toutes ses attaques à l'adversaire"),
  mk("avenger", "Vengeur", "Dégâts", [N, N, 1, N], [N, N, 120, N], "Récupère ses attaques quand une carte qu'elle n'a pas tuée meurt"),
  mk("lucky", "Chanceux", "Économie & Chance", [0.5, 1, 2, 4], [5, 10, 15, 20], "+X Chance par tour"),
  mk("graveyard", "Cimetière", "Économie & Chance", [3, 5, 8, 12], [20, 40, 60, 80], "+X à tous vos bonus élémentaires quand une carte meurt"),
  mk("spamland", "Spamland", "Économie & Chance", [4, 8, 24, 48], [5, 10, 16, 24], "Génère +X Spamtons par tour"),
  ...(["fire", "light", "earth", "nature", "shadow", "water"] as const).map((e, i) =>
    mk("heart", "Cœur de " + ["feu", "lumière", "terre", "nature", "ombre", "eau"][i], "Bonus élémentaires", [1, 2, 4, 8], HEART_PRICES, "+X bonus de " + EL_FR[elIdx(e)] + " par tour", { el: elIdx(e), estimated: true }),
  ),
  mk("heartres", "Cœur de résistance", "Bonus élémentaires", [3, 6, 10, 15], [10, 20, 40, 70], "+X résistances à toutes les cartes alliées par tour", { estimated: true }),
  mk("mimicry", "Mimétisme", "Bonus élémentaires", [N, 1, N, N], [N, 50, N, N], "Quand l'adversaire génère un élément, vous en générez 1 du même type"),
  mk("camo", "Camouflage", "Autre", [N, 1, N, N], [N, 70, N, N], "Inciblable tant que la carte n'attaque pas"),
  mk("backlash", "Contrecoup", "Autre", [50, N, N, N], [30, N, N, N], "Subit X % des dégâts infligés"),
  mk("vital", "Cœur vital", "Survie", [15, 30, 60, 100], [10, 30, 70, 150], "+X PV max par tour"),
  mk("regen", "Soin ancestral", "Survie", [4, 9, 14, 19], [20, 40, 60, 120], "Récupère X % des PV max chaque tour"),
  mk("immunity", "Immunité", "Survie", [N, N, 1, N], [N, N, 90, N], "Immunisée contre tous les effets adverses"),
  mk("phoenix", "Phénix", "Survie", [25, 50, 75, 100], [100, 150, 200, 250], "Revient à la vie avec X % de ses PV max (usage unique)"),
  mk("punching", "Punching-ball", "Survie", [1, 2, 3, 4], [25, 50, 100, 150], "+X à l'élément de la carte à chaque attaque subie"),
  mk("reset", "Reset", "Survie", [N, N, 1, N], [N, N, 160, N], "Tuer une carte adverse laisse l'attaque disponible"),
  mk("shield", "Bouclier", "Survie", [25, 50, 75, 100], [30, 60, 120, 180], "Réduit de X % la première attaque reçue chaque tour"),
  mk("smoke", "Fumée", "Survie", [N, 1, N, N], [N, 50, N, N], "Enfume le terrain allié après une attaque ou un soin"),
  mk("taunt", "Provocation", "Survie", [N, 1, N, N], [N, 70, N, N], "Après une attaque, les attaques ennemies doivent la cibler"),
  mk("tenacity", "Ténacité", "Survie", [1, N, N, N], [10, N, N, N], "La première attaque fatale laisse 1 PV"),
  mk("vamp", "Vampirisme", "Survie", [25, 50, 75, 100], [30, 70, 110, 160], "Régénère X % des dégâts infligés"),
  mk("eternity", "Éternité", "Contrôle", [N, N, N, 1], [N, N, N, 220], "Les dégâts infligés augmentent les temps de recharge de la cible de 1"),
  mk("freeze", "Gel", "Contrôle", [N, N, 60, N], [N, N, 140, N], "Les dégâts et soins gèlent la cible (X dégâts si brisé)"),
  mk("temporality", "Temporalité", "Contrôle", [N, N, N, 1], [N, N, N, 190], "Les soins réduisent les temps de recharge de la cible de 1"),
  mk("vanish", "Disparition", "Contrôle", [N, N, N, 1], [N, N, N, 180], "Supprime le dernier passif de la cible"),
  mk("aoe", "AoE", "Dégâts", [20, 40, 60, 80], [40, 80, 120, 180], "Attaque et soigne les cibles adjacentes à X % des dégâts", { estimated: true }),
];

export const LUCK_ODDS: number[][] = (() => {
  // [C,R,E,L] pour la Chance 0..40 (courbes publiées par SpamDex / MetaBot)
  const t: [number, number, number, number][] = [
    [100, 0, 0, 0], [100, 0, 0, 0], [100, 0, 0, 0], [92.8, 7.2, 0, 0], [80, 20, 0, 0], [64.3, 34.3, 1.3, 0], [50, 45, 5, 0],
    [38.9, 49.9, 11.2, 0], [27, 53, 20, 0], [16.5, 53.3, 30.3, 0], [10, 50, 40, 0], [6.9, 45.6, 47.2, 0.3], [4.4, 41.7, 52.7, 1.2],
    [1.6, 38.3, 57.4, 2.7], [0, 35, 60, 5], [0, 31.5, 60, 8.5], [0, 27.8, 58.9, 13.3], [0, 24.2, 56.9, 18.9], [0, 20.8, 54.5, 24.7],
    [0, 17.7, 52.1, 30.2], [0, 14.9, 50, 35], [0, 12.4, 48.3, 39.3], [0, 10, 46.5, 43.5], [0, 7.8, 44.6, 47.5], [0, 5.9, 42.7, 51.4],
    [0, 4.2, 40.8, 55.1], [0, 2.7, 38.7, 58.5], [0, 1.6, 36.7, 61.8], [0, 0.7, 34.5, 64.8], [0, 0.2, 32.3, 67.5], [0, 0, 30, 70],
    [0, 0, 27.7, 72.3], [0, 0, 25.5, 74.5], [0, 0, 23.3, 76.7], [0, 0, 21.2, 78.8], [0, 0, 19.1, 80.9], [0, 0, 17.1, 82.9],
    [0, 0, 15.1, 84.9], [0, 0, 13.3, 86.7], [0, 0, 11.4, 88.6], [0, 0, 9.7, 90.3],
  ];
  return t.map((r) => r.map((x) => x / 100));
})();

const SKILL_FAM: Record<string, Fam> = {
  Spamland: "spamland", CoeurTerre: "heart", CoeurFeu: "heart", CoeurEau: "heart", CoeurNature: "heart", CoeurOmbre: "heart",
  CoeurLumiere: "heart", CoeurVital: "vital", Reset: "reset", Brut: "brut", Phoenix: "phoenix", Cimetiere: "graveyard",
  Eternity: "eternity", Mimetisme: "mimicry", Erosion: "erosion", CoeurResistance: "heartres", Disparition: "vanish",
  PunchingBag: "punching", "Primitive heal": "regen", Aoe: "aoe", "Life Steal": "vamp", Revenge: "revenge",
  Temporality: "temporality", Multiplicator: "multiplier", Reflect: "reflect", ContreCoup: "backlash", Poison: "poison",
  Berserk: "berserk", Smoked: "smoke", Frozen: "freeze", Vengeur: "avenger", Tenacite: "tenacity", Immunity: "immunity",
  Mystere: "mystery", Taunt: "taunt", Bomba: "bomba", Camouflage: "camo",
};
const LETTER_R: Record<string, number> = { C: 0, R: 1, E: 2, L: 3 };

export interface Tox { fam: Fam; r: number; v: number; el: number }
export function parseSkillId(id: string, element: string | null, value: number, rarity: string): Tox | null {
  const m = id.match(/^(.*?)(?:_([CREL]))?$/);
  if (!m) return null;
  const fam = SKILL_FAM[m[1]];
  if (!fam) return null;
  const r = m[2] ? LETTER_R[m[2]] : ({ common: 0, rare: 1, epic: 2, legendary: 3 } as Record<string, number>)[rarity] ?? 1;
  let el = elIdx(element);
  if (fam === "heart" && el < 0) {
    const map: Record<string, string> = { CoeurTerre: "earth", CoeurFeu: "fire", CoeurEau: "water", CoeurNature: "nature", CoeurOmbre: "shadow", CoeurLumiere: "light" };
    el = elIdx(map[m[1]]);
  }
  return { fam, r, v: value, el };
}

/* ---------- cartes compilées ---------- */
export interface CAction { effect: string; kind: string; min: number; max: number; el: number }
export interface CAbility {
  name: string; cd: number; acc: number; crit: number; critMult: number; uses: number; echo: number;
  actions: CAction[]; dmg: CAction[]; text: string; aoe: boolean; hasDmg: boolean; hasHeal: boolean;
  engine: boolean; prio: number; alliesAll: boolean; critOnlyCd: boolean;
  cost: { el: number; amt: number }[]; hpCost: number; randEnemy: boolean;
}
export interface CTalent { slot: number; id: string; text: string; actions: CAction[]; grants: string | null }
export interface CCard {
  num: number; slug: string; name: string; element: number; rarity: string; hp: number; spamton: number;
  res: number[]; abilities: CAbility[]; talents: CTalent[]; skills: Tox[];
  threat: number; dmgRate: number[]; engRate: number[]; healRate: number; hpEff: number; castRate: number;
  costNeed: number[]; costDmg: number[];
}

const COND = /(Si |Tant que|Quand|Chaque fois|Lorsque|lorsque|À chaque|a chaque|tour \d|au tour|en cas)/;
export function talentIsStatic(t: CTalent): boolean {
  return !COND.test(t.text) || /^Au début de la partie/.test(t.text);
}

export interface Compiled {
  version: string;
  cards: CCard[];
  byNum: Map<number, CCard>;
  tox: ToxFamily[];
  coverage: number;
}

const SUPPORTED = new Set([
  "damage", "DamageAll", "AddAllPlayerAttack", "AddAllPlayerAttackRandomTeam", "AddAllPlayerAttackCountActivation1", "healTarget", "healCaster",
  "healPVmaxTarget", "healPVmaxCaster", "healAllPlayerCard", "AddCardHPMax", "AddAllPlayerHPMax", "AddOppHPMax", "AddCooldown",
  "AddCardCriticChance", "AddAllPlayerCritick", "AddCardCriticRatio", "AddOppCardCriticRatio", "AddCardBaseDamage", "AddAbilityBaseDamage",
  "AddOppCardBaseDamage", "AddCardResistance", "AddOppCardResistance", "AddAllPlayerResistance", "AddSpamton", "AddSpamtonGenerationCaster",
  "AddLuck", "SetSpamton", "MultiplyAllHP_x2", "SetHPInPercent", "Resurection", "AddPMetamorph", "StealSpamtonTaken", "AddSChanceVitale",
  "AddCardMiss", "AddSBrut", "AddSAoe_C", "AddSAoe_R", "AddSAoe_E", "AddSCoeurFeu_C", "AddSCoeurDeFeu_C", "AddSCoeurEau_C", "AddSCoeurNature_C",
  "AddSCoeurTerre_C", "AddSCoeurOmbre_C", "AddSCoeurLumiere_C", "AddSMimetisme", "AddSRoulette", "AddSAttackMulticolor", "AddSCoeurAcier",
  "AddSPetitPrix", "AddSCasino", "AddSPunchingBag_C", "AddSParadoxe", "AddSInsensibleEternite", "AddSInsensibleDisparition", "AddCardMiss",
  "AddOppCardCriticChance", "healCasterWithoutElement", "DamageCasterHP", "AddSPlumePhoenix", "DamageWithCardElement", "AddAllPlayerMiss",
]);

export function compile(ds: RawDataset): Compiled {
  // valeurs des passifs (Tox) lues directement dans les données: elles sont prioritaires sur la table intégrée
  const tox = TOX_CATALOG.map((f) => ({ ...f, vals: [...f.vals] }));
  for (const c of ds.cards) {
    for (const s of c.skills) {
      const t = parseSkillId(s.id, s.element, s.value, s.rarity);
      if (!t) continue;
      const fam = tox.find((f) => f.fam === t.fam && (t.fam !== "heart" || f.el === t.el));
      if (fam && fam.vals[t.r] !== null && s.value !== undefined && t.fam !== "bomba") fam.vals[t.r] = s.value;
    }
  }
  let total = 0;
  let ok = 0;
  const cards: CCard[] = ds.cards.map((c) => {
    const mapAct = (a: RawAction): CAction => ({ effect: a.effect, kind: a.kind, min: a.min, max: a.max, el: elIdx(a.element) });
    const abilities: CAbility[] = c.abilities.map((a) => {
      const actions = a.actions.map(mapAct);
      for (const x of actions) {
        if (x.effect === "_NULL") continue;
        total++;
        if (SUPPORTED.has(x.effect)) ok++;
      }
      const dmg = actions.filter((x) => x.kind === "damage" && (x.effect === "damage" || x.effect === "DamageAll" || x.effect === "DamageCasterHP" || x.effect === "DamageWithCardElement"));
      const hasHeal = actions.some((x) => /^heal/.test(x.effect));
      const engine = actions.some((x) => /^AddAllPlayerAttack/.test(x.effect));
      const hasDmg = dmg.length > 0;
      const cost: { el: number; amt: number }[] = [];
      let hpCost = 0;
      const cm = a.effect.match(/\[Coût ([^\]]*)\]/);
      if (cm) {
        for (const part of cm[1].split("&")) {
          const m = part.trim().match(/(\d+)\s+(\S+)/);
          if (!m) continue;
          if (m[2] === "PV") hpCost += +m[1];
          else { const e = EL_FR.indexOf(m[2]); if (e >= 0) cost.push({ el: e, amt: +m[1] }); }
        }
      }
      const randEnemy = /Cible aléatoirement (les cartes adverses|une carte adverse|une carte non provoquée)|Cible une carte adverse aléatoire|\[Ennemi aléatoire\]|Ennemis aléatoires/.test(a.effect);
      return {
        cost, hpCost, randEnemy,
        name: a.name, cd: a.cooldown, acc: a.precision, crit: a.critChance, critMult: a.critMultiplier || 2, uses: a.uses, echo: a.cooldownResetChance,
        actions, dmg, text: a.effect, aoe: actions.some((x) => x.effect === "DamageAll"), hasDmg, hasHeal, engine,
        prio: engine && !hasDmg ? 0 : !hasDmg && !hasHeal ? 1 : hasDmg ? 3 : 2,
        alliesAll: /Cible toutes les cartes alliées/.test(a.effect),
        critOnlyCd: /critique/i.test(a.effect) && actions.some((x) => x.effect === "AddCooldown"),
      };
    });
    const talents: CTalent[] = c.talents.map((t) => ({ slot: t.slot, id: t.id, text: t.effect, actions: t.actions.map(mapAct), grants: t.grantsSkill }));
    for (const t of talents) for (const x of t.actions) { total++; if (SUPPORTED.has(x.effect)) ok++; }
    const skills: Tox[] = [];
    for (const s of c.skills) {
      const t = parseSkillId(s.id, s.element, s.value, s.rarity);
      if (t) skills.push(t);
    }
    const res = ["fire", "light", "earth", "nature", "shadow", "water"].map((e) => c.resistances?.[e] ?? 0);
    const dmgRate = [0, 0, 0, 0, 0, 0, 0];
    const engRate = [0, 0, 0, 0, 0, 0, 0];
    const costNeed = [0, 0, 0, 0, 0, 0, 0];
    const costDmg = [0, 0, 0, 0, 0, 0, 0];
    let hpLoss = 0;
    let healRate = 0;
    let castRate = 0;
    for (const a of abilities) {
      const per = 1 / Math.max(1, a.cd);
      const echoMul = 1 / (1 - Math.min(0.9, a.echo / 100));
      const critMul = 1 + (a.crit / 100) * (a.critMult - 1);
      for (const d of a.dmg) {
        const avg = ((d.min + d.max) / 2) * critMul * (a.acc / 100);
        const mul = a.aoe ? 2.4 : 1;
        if (d.el >= 0) {
          dmgRate[d.el] += avg * per * echoMul * mul;
          if (a.cost.length) costDmg[a.cost[0].el] += avg * per * echoMul * mul;
        }
      }
      for (const k of a.cost) costNeed[k.el] += k.amt * per * echoMul;
      hpLoss += a.hpCost * per;
      for (const x of a.actions) {
        if (/^heal(Target|Caster|AllPlayerCard)$/.test(x.effect)) healRate += ((x.min + x.max) / 2) * per * (x.effect === "healAllPlayerCard" ? 3 : 1);
        if (x.effect === "healPVmaxTarget" || x.effect === "healPVmaxCaster") healRate += (c.hp * x.min) / 100 * per * 0.6;
        if (x.effect === "AddAllPlayerAttack") {
          if (x.el >= 0) engRate[x.el] += ((x.min + x.max) / 2) * per * echoMul;
          else for (let e = 0; e < 6; e++) engRate[e] += ((x.min + x.max) / 12) * per;
        }
        if (x.effect === "AddAllPlayerAttackRandomTeam") for (let e = 0; e < 6; e++) engRate[e] += ((x.min + x.max) / 12) * per;
      }
      if (a.hasDmg) castRate += per;
    }
    for (const t of talents) {
      if (!talentIsStatic(t)) continue;
      for (const x of t.actions) if (x.effect === "AddAllPlayerAttack" && x.el >= 0) engRate[x.el] += x.min / 4;
    }
    for (const s of skills) if (s.fam === "heart" && s.el >= 0) engRate[s.el] += s.v;
    const dsum = dmgRate.reduce((p, q) => p + q, 0);
    const threat = dsum + engRate.reduce((p, q) => p + q, 0) * 12 + c.spamton * 0.3 + healRate * 0.5 + c.hp * 0.01;
    return {
      num: c.number, slug: c.slug, name: c.name, element: elIdx(c.element), rarity: c.rarity, hp: c.hp, spamton: c.spamton, res, abilities, talents, skills,
      threat, dmgRate, engRate, healRate, hpEff: Math.max(c.hp * 0.3, c.hp * (1 + res.reduce((p, q) => p + q, 0) / 600) - hpLoss * 6), castRate, costNeed, costDmg,
    };
  });
  const byNum = new Map(cards.map((c) => [c.num, c]));
  return { version: ds.version, cards, byNum, tox, coverage: total ? ok / total : 1 };
}
