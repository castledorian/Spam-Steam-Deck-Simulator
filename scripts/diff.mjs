// Différences entre deux versions du SpamDex (repris de l'ancien src/lib/server/dataset.ts) et contrôles d'intégrité.

const flat = (s) => String(s ?? "").replace(/\n/g, " · ");
/** Version du calcul des différences : la changer force le recalcul de tout l'historique. */
export const DIFF_VERSION = 2;
const ab = (a, withStats) => `${flat(a.effect)} (recharge ${a.cooldown}${withStats ? `, précision ${a.precision} %, critique ${a.critChance} %` : ""})`;

/** Liste des changements carte par carte entre deux jeux de données. */
export function diffDatasets(prev, next) {
  const out = [];
  const elName = (id) => next.elements?.find((e) => e.id === id)?.name ?? id;
  const rarName = (id) => next.rarities?.find((r) => r.id === id)?.name ?? id;
  const pc = new Map((prev?.cards ?? []).map((c) => [c.id, c]));
  const seen = new Set();
  for (const c of next.cards) {
    seen.add(c.id);
    const base = { card: c.number, name: c.name, slug: c.slug };
    const o = pc.get(c.id);
    if (!o) {
      if (prev) out.push({ ...base, kind: "ajout", label: "Nouvelle carte" });
      continue;
    }
    if (o.hp !== c.hp) out.push({ ...base, kind: "pv", label: "PV", from: String(o.hp), to: String(c.hp) });
    if (o.spamton !== c.spamton) out.push({ ...base, kind: "spamton", label: "Spamtons", from: String(o.spamton), to: String(c.spamton) });
    if (o.rarity !== c.rarity) out.push({ ...base, kind: "rarete", label: "Rareté", from: rarName(o.rarity), to: rarName(c.rarity) });
    if (o.element !== c.element) out.push({ ...base, kind: "element", label: "Élément", from: elName(o.element), to: elName(c.element) });
    for (const el of Object.keys(c.resistances ?? {})) {
      if (o.resistances?.[el] !== c.resistances[el])
        out.push({ ...base, kind: "resistance", label: `Résistance ${elName(el)}`, from: String(o.resistances?.[el] ?? 0), to: String(c.resistances[el]) });
    }
    const oa = new Map(o.abilities.map((a) => [a.name, a]));
    const na = new Map(c.abilities.map((a) => [a.name, a]));
    for (const [n, a] of na) {
      const b = oa.get(n);
      if (!b) {
        const gone = [...oa.keys()].filter((k) => !na.has(k));
        out.push({ ...base, kind: "capacite", label: `Capacité « ${n} »`, from: gone.length ? gone.join(", ") : "—", to: ab(a, false) });
      } else if (b.effect !== a.effect || b.cooldown !== a.cooldown || b.precision !== a.precision || b.critChance !== a.critChance) {
        // précision et critique affichés quand ce sont eux qui changent (sinon la ligne semblerait identique)
        const stats = b.precision !== a.precision || b.critChance !== a.critChance;
        out.push({ ...base, kind: "capacite", label: `Capacité « ${n} »`, from: ab(b, stats), to: ab(a, stats) });
      }
    }
    // Capacité retirée sans remplacement (l'original ne le signalait que si toutes les capacités disparaissaient).
    const added = [...na.keys()].filter((k) => !oa.has(k)).length;
    const removed = [...oa.keys()].filter((k) => !na.has(k));
    if (removed.length > added) for (const n of removed.slice(added)) out.push({ ...base, kind: "capacite", label: `Capacité « ${n} » retirée` });
    const ot = new Map(o.talents.map((t) => [t.slot, t]));
    for (const t of c.talents) {
      const b = ot.get(t.slot);
      if (!b || b.effect !== t.effect) out.push({ ...base, kind: "talent", label: `Talent ${t.slot} « ${t.name} »`, from: b?.effect, to: t.effect });
    }
    const os = new Map(o.skills.map((s) => [s.id, s]));
    const ns = new Map(c.skills.map((s) => [s.id, s]));
    for (const [id, s] of ns) {
      const b = os.get(id);
      if (!b) out.push({ ...base, kind: "passif", label: `Passif « ${s.name} »`, to: flat(s.effect) });
      else if (b.effect !== s.effect) out.push({ ...base, kind: "passif", label: `Passif « ${s.name} »`, from: flat(b.effect), to: flat(s.effect) });
    }
    for (const [id, s] of os) if (!ns.has(id)) out.push({ ...base, kind: "passif", label: `Passif « ${s.name} » retiré`, from: flat(s.effect) });
  }
  for (const [id, o] of pc) if (!seen.has(id)) out.push({ card: o.number, name: o.name, slug: o.slug, kind: "retrait", label: "Carte retirée" });
  return out;
}

/** Contrôles bloquants : un jeu de données qui échoue n'est jamais publié. */
export function checkDataset(ds, previous) {
  const e = [];
  if (!ds || !Array.isArray(ds.cards)) return ["Format inattendu (pas de liste de cartes)"];
  if (ds.language !== "fr") e.push(`Langue « ${ds.language} » au lieu de « fr »`);
  if (ds.cards.length < 50) e.push(`Seulement ${ds.cards.length} cartes`);
  if (previous?.cards && ds.cards.length < previous.cards.length * 0.9) e.push(`Chute du nombre de cartes : ${previous.cards.length} → ${ds.cards.length}`);
  if (new Set(ds.cards.map((c) => c.id)).size !== ds.cards.length) e.push("Identifiants de cartes dupliqués");
  for (const c of ds.cards) {
    if (!(c.hp > 0)) e.push(`${c.name} : PV invalides (${c.hp})`);
    if (!c.element || !c.rarity) e.push(`${c.name} : élément ou rareté manquant`);
    for (const a of c.abilities ?? []) {
      if (!(a.cooldown >= 0) || !Array.isArray(a.actions)) e.push(`${c.name} / ${a.name} : capacité mal formée`);
      for (const x of a.actions ?? []) if (x.min > x.max || x.min < -100000) e.push(`${c.name} / ${a.name} : valeurs ${x.min}..${x.max} incohérentes`);
    }
  }
  return e.slice(0, 30);
}
