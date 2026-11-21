export type El = "fire" | "water" | "earth" | "nature" | "shadow" | "light" | "ether";
export type El6 = Exclude<El, "ether">;
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Divine";

export const EL6: El6[] = ["fire", "water", "earth", "nature", "shadow", "light"];
export const ELS: El[] = [...EL6, "ether"];

export interface Hit {
  min: number;
  max: number;
  el: El | "rand" | "own";
}
export interface Heal {
  min: number;
  max: number;
  el: El | "rand" | "own";
  to: "self" | "ally" | "all" | "random";
}
export interface PointGain {
  el: El | "all" | "rand" | "own";
  min: number;
  max: number;
}

export interface AbilitySim {
  hits: Hit[];
  target: "one" | "all" | "rand";
  times: number;
  heals: Heal[];
  pts: PointGain[];
  pctHp?: number;
  setHpPct?: number;
  hpBuff?: { amount: number; to: "all" | "self" | "ally"; maxOnly: boolean };
  healSelfPct?: number;
  fullHeal?: boolean;
  revive?: boolean;
  freeze?: boolean;
  eternity?: "one" | "all";
  temporality?: boolean;
  taunt?: boolean;
  tauntRandom?: boolean;
  baseUp?: { amount: number; to: "self" | "all" | "random" };
  vampirism?: boolean;
  absorb?: boolean;
  missingHp?: boolean;
  cost?: { el: El; n: number }[];
  costHp?: number;
  limited?: number;
  growth?: number;
  echo?: number;
  oppSpamtonsSet?: number;
  /** Parsing/coverage warnings. Any entry means this effect is not fully simulated. */
  unsupported?: string[];
}

export interface Ability {
  name: string;
  elements: El[];
  lines: string[];
  cooldown: number;
  accuracy: number;
  critChance: number;
  critPower: number;
  sim: AbilitySim;
}

export interface Talent {
  slot: number;
  name: string;
  text: string;
  best: boolean;
  /** modeled effects */
  res?: Partial<Record<El6, number>>;
  startTox?: string;
  echo?: number;
  pts?: Partial<Record<El6, number>>;
  allyHp?: number;
  selfHp?: number;
  modeled: boolean;
}

export interface StartTox {
  id: string;
  name: string;
  rarity?: string;
  text: string;
}

export interface Card {
  slug: string;
  name: string;
  element: El;
  rarity: Rarity;
  hp: number;
  spamton: number;
  abilities: Ability[];
  talents: Talent[];
  startTox: StartTox[];
  res: Record<El6, number>;
  artist?: string;
  patched: string[];
  pending: string[];
  /** Absolute URL of the official illustration, when found on the source page. */
  image?: string;
  /** Official French display texts (metabot.gg/fr). English fields stay the engine's keys. */
  fr?: CardFr;
}

/** French display layer. Indexes match `abilities` / `startTox`; talents match by slot. */
export interface CardFr {
  name: string;
  abilities: ({ name: string; lines: string[] } | null)[];
  talents: { slot: number; name: string; text: string }[];
  startTox: ({ name: string; text: string } | null)[];
}

export interface FrText {
  name: string;
  text: string;
  category?: string;
}

export interface ToxStep {
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  value: number;
  price: number;
}
export interface ToxFamily {
  id: string;
  name: string;
  icon: string;
  category: string;
  ladder: ToxStep[];
  text: string;
  startsOn: string[];
  fr?: FrText;
}
export interface TalentInfo {
  id: string;
  name: string;
  text: string;
  cards: string[];
  fr?: FrText;
}

export interface PatchChange {
  field: string;
  from: string;
  to: string;
  dir: "up" | "down" | "";
}
export interface PatchEntry {
  name: string;
  label: string;
  changes: PatchChange[];
}
export interface Patch {
  id: string;
  version: string;
  title: string;
  date: string;
  url: string;
  summary: string;
  additions: string[];
  balance: PatchEntry[];
  fixes: string[];
}

export interface Snapshot {
  gameVersion: string;
  dataSource: string;
  dataExtracted: string;
  fetchedAt: string;
  cards: Card[];
  tox: ToxFamily[];
  talents: TalentInfo[];
  patches: Patch[];
  /** How much of the French layer could be fetched during the last sync. */
  frCoverage?: { cards: number; cardsTotal: number; tox: number; talents: number; warnings: string[] };
}
