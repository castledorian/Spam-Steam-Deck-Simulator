// Parseurs des pages françaises de metabot.gg (aucune I/O).
// Le moteur de simulation continue de lire les pages anglaises : ces parseurs
// ne récupèrent que les textes d'affichage, alignés sur la structure anglaise.
import { decode, stripComments, textOf } from "./parse";
import type { Card, CardFr, FrText, TalentInfo, ToxFamily } from "./types";

function section(h: string, name: string): string {
  const i = h.indexOf(`data-section="${name}"`);
  if (i < 0) return "";
  const j = h.indexOf("data-section=", i + 20);
  return h.slice(i, j < 0 ? i + 40000 : j);
}

export interface CardPageFr {
  name: string;
  abilities: { name: string; lines: string[] }[];
  talents: { slot: number; name: string; text: string }[];
  startTox: { id: string; name: string; text: string }[];
}

/** Fiche carte française : « Esprit Feu (Commune, Feu) est une carte SPAM avec 500 PV… » */
export function parseCardPageFr(raw: string): CardPageFr | null {
  const h = stripComments(raw);
  const dm = h.match(/<p class="txmLEG_description">([\s\S]*?)<\/p>/);
  if (!dm) return null;
  const desc = textOf(dm[1], false);
  const nm = desc.match(/^(.+?)\s+\([^()]+,\s*[^()]+\)\s/);
  if (!nm) return null;
  const out: CardPageFr = { name: nm[1].trim(), abilities: [], talents: [], startTox: [] };

  const abSec = section(h, "abilities");
  for (const a of abSec.match(/<article class="VprGlq_ability"[\s\S]*?<\/article>/g) || []) {
    const name = textOf((a.match(/abilityName">([\s\S]*?)<\/h3>/) || [, ""])[1]);
    const eff = (a.match(/<p class="VprGlq_effect">([\s\S]*?)<\/p>/) || [, ""])[1];
    const lines = textOf(eff)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    out.abilities.push({ name, lines });
  }

  const toxSec = section(h, "tox");
  for (const li of toxSec.match(/<li>[\s\S]*?<\/li>/g) || []) {
    const chip = li.match(/<a class="yGck4G_toxChip"[^>]*href="\/[A-Za-z_]+\/spam\/tox\/([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!chip) continue;
    const chipText = textOf(chip[2]);
    const eff = (li.match(/VprGlq_effect">([\s\S]*?)<\/span>/) || [, ""])[1];
    out.startTox.push({ id: chip[1], name: chipText.replace(/\s*\([^()]*\)\s*$/, ""), text: textOf(eff, false) });
  }

  const talSec = section(h, "talents");
  for (const li of talSec.match(/<li( class="VprGlq_talentBest")?>[\s\S]*?<\/li>/g) || []) {
    const slot = parseInt((li.match(/talentSlot">(\d+)</) || [, "0"])[1], 10);
    const name = textOf((li.match(/talentName"[^>]*>([\s\S]*?)<\/a>/) || [, ""])[1]);
    const eff = (li.match(/<span class="VprGlq_effect">([\s\S]*?)<\/span><\/span><\/li>/) || [, ""])[1];
    out.talents.push({ slot, name, text: textOf(eff, false) });
  }
  return out;
}

/** Page Tox française : seuls id, nom, catégorie et texte sont utiles (l'échelle chiffrée vient de l'anglais). */
export function parseToxPageFr(raw: string): Map<string, FrText> {
  const h = stripComments(raw);
  const out = new Map<string, FrText>();
  for (const t of h.match(/<article class="_3XunXG_famTile"[\s\S]*?<\/article>/g) || []) {
    const id = (t.match(/id="([^"]+)"/) || [, ""])[1];
    if (!id || out.has(id)) continue;
    const name = textOf((t.match(/famHead">[\s\S]*?<a href="[^"]*">([\s\S]*?)<\/a>/) || [, ""])[1]);
    const category = textOf((t.match(/famSub">([\s\S]*?)<\/span>/) || [, ""])[1]);
    const text = textOf((t.match(/<p class="_3XunXG_effect">([\s\S]*?)<\/p>/) || [, ""])[1], false);
    if (name) out.set(id, { name: decode(name), text, category });
  }
  return out;
}

/**
 * Fusionne la couche française dans le snapshot anglais. Toute incohérence
 * (nombre de capacités différent, emplacement de talent absent…) laisse le
 * texte anglais en place et produit un avertissement : la synchro n'échoue jamais
 * à cause de la traduction.
 */
export function attachFrench(
  cards: Card[],
  frCards: Map<string, CardPageFr>,
  tox: ToxFamily[],
  frTox: Map<string, FrText>,
  talents: TalentInfo[],
  frTalents: TalentInfo[],
): { cards: number; tox: number; talents: number; warnings: string[] } {
  const warnings: string[] = [];
  let nCards = 0;
  for (const t of tox) {
    const f = frTox.get(t.id);
    if (f) t.fr = f;
  }
  const frTalById = new Map(frTalents.map((t) => [t.id, t]));
  let nTal = 0;
  for (const t of talents) {
    const f = frTalById.get(t.id);
    if (f) {
      t.fr = { name: f.name, text: f.text };
      nTal++;
    }
  }
  const toxById = new Map(tox.map((t) => [t.id, t]));
  for (const c of cards) {
    const f = frCards.get(c.slug);
    if (!f) {
      warnings.push(`${c.slug} : page française indisponible`);
      continue;
    }
    const fr: CardFr = { name: f.name, abilities: [], talents: [], startTox: [] };
    if (f.abilities.length === c.abilities.length) fr.abilities = f.abilities.map((a) => ({ name: a.name, lines: a.lines }));
    else {
      fr.abilities = c.abilities.map(() => null);
      warnings.push(`${c.slug} : ${f.abilities.length} capacités FR pour ${c.abilities.length} EN, textes anglais conservés`);
    }
    for (const t of c.talents) {
      const ft = f.talents.find((x) => x.slot === t.slot);
      if (ft) fr.talents.push(ft);
    }
    fr.startTox = c.startTox.map((st, i) => {
      const byId = f.startTox.find((x) => x.id === st.id) ?? f.startTox[i];
      if (byId) return { name: byId.name, text: byId.text };
      const fam = toxById.get(st.id)?.fr;
      return fam ? { name: fam.name, text: fam.text } : null;
    });
    c.fr = fr;
    nCards++;
  }
  return { cards: nCards, tox: frTox.size, talents: nTal, warnings };
}

/**
 * Après application des patchs Steam (en anglais), un talent ou un Tox de départ
 * peut avoir changé : on remplace alors le texte français obsolète par celui de
 * la page Talents/Tox française correspondante.
 */
export function refreshFrenchAfterPatches(cards: Card[], talents: TalentInfo[], tox: ToxFamily[]): void {
  const talByName = new Map(talents.map((t) => [t.name.toLowerCase(), t]));
  const toxById = new Map(tox.map((t) => [t.id, t]));
  for (const c of cards) {
    if (!c.fr) continue;
    for (const t of c.talents) {
      const i = c.fr.talents.findIndex((x) => x.slot === t.slot);
      const info = talByName.get(t.name.toLowerCase());
      const patched = c.patched.some((p) => p.includes(`Talent ${t.slot} `));
      if (patched) {
        const repl = info?.fr ? { slot: t.slot, name: info.fr.name, text: info.fr.text } : null;
        if (i >= 0) {
          if (repl) c.fr.talents[i] = repl;
          else c.fr.talents.splice(i, 1);
        } else if (repl) c.fr.talents.push(repl);
      }
    }
    c.fr.startTox = c.startTox.map((st, i) => {
      const fam = toxById.get(st.id)?.fr;
      const prev = c.fr!.startTox[i];
      const patched = !st.text && fam;
      return patched ? { name: fam.name, text: fam.text } : (prev ?? (fam ? { name: fam.name, text: fam.text } : null));
    });
  }
}
