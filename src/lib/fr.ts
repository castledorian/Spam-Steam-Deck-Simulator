// Couche d'affichage en français. Les champs anglais du snapshot restent les clés
// techniques du moteur (Tox de départ, patchs) : ne jamais les remplacer en place.
import type { Card, Snapshot, TalentInfo, ToxFamily } from "./types";

export const cardName = (c: Card | undefined | null, fallback = ""): string => (c ? c.fr?.name || c.name : fallback);

export function abilityFr(c: Card, i: number): { name: string; lines: string[]; fr: boolean } {
  const a = c.abilities[i];
  const f = c.fr?.abilities[i];
  return f ? { name: f.name, lines: f.lines, fr: true } : { name: a.name, lines: a.lines, fr: false };
}

export function talentFr(c: Card, slot: number): { name: string; text: string; fr: boolean } {
  const t = c.talents.find((x) => x.slot === slot);
  const f = c.fr?.talents.find((x) => x.slot === slot);
  if (f) return { name: f.name, text: f.text, fr: true };
  return { name: t?.name ?? "", text: t?.text ?? "", fr: false };
}

export function startToxFr(c: Card, i: number, fam?: ToxFamily): { name: string; text: string; fr: boolean } {
  const f = c.fr?.startTox[i];
  const t = c.startTox[i];
  if (f) return { name: f.name, text: f.text || fam?.fr?.text || "", fr: true };
  if (fam?.fr) return { name: fam.fr.name, text: fam.fr.text, fr: true };
  return { name: t.name, text: t.text || fam?.text || "", fr: false };
}

const TOX_CAT: Record<string, string> = {
  Damage: "Dégâts",
  Survival: "Survie",
  "Element bonuses": "Bonus d'élément",
  Control: "Contrôle",
  "Economy & Luck": "Économie & chance",
  Transformation: "Transformation",
  "Starting Tox only": "Tox de départ uniquement",
  Other: "Autres",
};

export const toxFr = (t: ToxFamily) => ({ name: t.fr?.name || t.name, text: t.fr?.text || t.text, fr: !!t.fr });
export const toxCategoryFr = (cat: string, sample?: ToxFamily) => sample?.fr?.category || TOX_CAT[cat] || cat;
export const talentInfoFr = (t: TalentInfo) => ({ name: t.fr?.name || t.name, text: t.fr?.text || t.text, fr: !!t.fr });

/** Nom anglais (patchs Steam, listes « startsOn ») → nom français. */
export function nameIndex(snap: Snapshot): Map<string, string> {
  return new Map(snap.cards.map((c) => [c.name.toLowerCase(), cardName(c)]));
}

const LABEL: Record<string, string> = { Buff: "Buff", Nerf: "Nerf", Adjustment: "Ajustement", Mixed: "Mixte", Rework: "Refonte", New: "Nouveau" };
export const patchLabelFr = (l: string) => LABEL[l] ?? l;

// Glossaire volontairement limité aux termes techniques sûrs des notes de patch.
const GLOSS: [RegExp, string][] = [
  [/^HP$/i, "PV"],
  [/^Spamton(s)? (generation|per turn)$/i, "Spamtons par tour"],
  [/^Resistance to all elements$/i, "Résistance à tous les éléments"],
  [/^Spamton cost$/i, "Coût en Spamtons"],
  [/^Talent (\d)$/i, "Talent $1"],
  [/\bcritical chance\b/gi, "chance de critique"],
  [/\bcritical (multiplier|damage|power)\b/gi, "multiplicateur de critique"],
  [/\baccuracy\b/gi, "précision"],
  [/\bcooldown\b/gi, "temps de recharge"],
  [/\bmax HP\b/g, "PV max"],
  [/\bhealing\b/gi, "soin"],
  [/\bdamage\b/gi, "dégâts"],
  [/\bresistance\b/gi, "résistance"],
  [/\bFire\b/g, "Feu"],
  [/\bWater\b/g, "Eau"],
  [/\bEarth\b/g, "Terre"],
  [/\bShadow\b/g, "Ombre"],
  [/\bLight\b/g, "Lumière"],
  [/\bEther\b/g, "Éther"],
  [/ and /g, " et "],
];
export function patchFieldFr(field: string): string {
  const shop = field.match(/^Shop cost(?: \((\w+)\))?$/i);
  if (shop) return shop[1] ? `Coût en boutique (${RAR[shop[1]] ?? shop[1]})` : "Coût en boutique";
  // « Earth and Light resistance » → « résistance Earth and Light » (puis traduction des mots).
  let s = field.replace(/((?:Fire|Water|Earth|Nature|Shadow|Light|Ether)(?: and (?:Fire|Water|Earth|Nature|Shadow|Light|Ether))?) (resistance|damage)\b/g, "$2 $1");
  for (const [re, to] of GLOSS) s = s.replace(re, to);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const RAR: Record<string, string> = { Common: "Commune", Rare: "Rare", Epic: "Épique", Legendary: "Légendaire" };
export const rarityFr = (r: string) => RAR[r] ?? (r === "Divine" ? "Divine" : r);

/** Traduction des avertissements de couverture produits par le parseur (y compris anciens snapshots). */
export function warningFr(w: string): string {
  if (/^Choice:/i.test(w)) return "Capacité à choix : seule la première option est simulée, les autres ne le sont pas";
  return w;
}
