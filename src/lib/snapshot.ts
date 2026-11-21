// Normalisation et contrôles d'intégrité d'un snapshot (fonctions pures).
import type { Snapshot } from "./types";

/** Répare les défauts connus des anciens snapshots sans toucher aux valeurs de jeu. */
export function normalizeSnapshot(s: Snapshot): Snapshot {
  for (const t of s.tox) {
    if (!t.name) t.name = t.id.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  }
  return s;
}

/** Contrôles bloquants : un snapshot qui échoue n'est jamais publié. */
export function checkSnapshot(s: Snapshot, previous?: Snapshot): string[] {
  const errors: string[] = [];
  if (s.cards.length < 50) errors.push(`Seulement ${s.cards.length} cartes`);
  if (previous && s.cards.length < previous.cards.length * 0.9) errors.push(`Chute du nombre de cartes : ${previous.cards.length} → ${s.cards.length}`);
  if (new Set(s.cards.map((c) => c.slug)).size !== s.cards.length) errors.push("Slugs de cartes dupliqués");
  if (s.tox.length < 10) errors.push(`Seulement ${s.tox.length} familles de Tox`);
  if (s.talents.length < 10) errors.push(`Seulement ${s.talents.length} talents`);
  for (const c of s.cards) {
    if (!(c.hp > 0)) errors.push(`${c.slug} : PV invalides (${c.hp})`);
    if (!c.element || !c.rarity) errors.push(`${c.slug} : élément ou rareté manquant`);
    for (const a of c.abilities) {
      if (!(a.cooldown >= 1) || !(a.accuracy >= 0 && a.accuracy <= 1)) errors.push(`${c.slug} / ${a.name} : recharge ou précision invalide`);
      for (const h of a.sim.hits) if (!(h.min <= h.max) || h.min < 0) errors.push(`${c.slug} / ${a.name} : dégâts invalides`);
    }
  }
  return errors.slice(0, 30);
}

/** Contenu comparable (sans l'horodatage) pour savoir si une publication est nécessaire. */
export function contentKey(s: Snapshot): string {
  const { fetchedAt: _ignored, ...rest } = s;
  void _ignored;
  return JSON.stringify(rest);
}
