"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Loading, PageTitle, RAR_COLOR, RAR_FR, Section, ToxIcon } from "@/components/ui";
import { LUCK_TABLE } from "@/lib/sim/engine";
import { nameIndex, talentInfoFr, toxCategoryFr, toxFr } from "@/lib/fr";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const CAT_FR: Record<string, string> = {
  "Element bonuses": "Bonus d'éléments",
  Damage: "Dégâts",
  Survival: "Survie",
  Control: "Contrôle",
  "Economy & Luck": "Économie & Chance",
  Transformation: "Transformation",
  Other: "Autres",
  "Starting Tox only": "Départ uniquement",
};

export default function ToxPage() {
  const { snap, loading, bySlug } = useData();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"tox" | "talents">("tox");
  const dq = useDeferredValue(q);
  const cats = useMemo(() => {
    if (!snap) return [];
    const m = new Map<string, typeof snap.tox>();
    for (const t of snap.tox) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [snap]);
  const nameToSlug = useMemo(() => new Map([...bySlug.values()].map((c) => [c.name, c.slug])), [bySlug]);
  const frName = useMemo(() => (snap ? nameIndex(snap) : new Map<string, string>()), [snap]);
  const fn = (en: string) => frName.get(en.toLowerCase()) ?? en;
  if (loading || !snap) return <Loading />;
  const n = norm(dq);
  const talents = snap.talents.filter((t) => !n || norm(t.name + " " + t.text + " " + talentInfoFr(t).name + " " + talentInfoFr(t).text).includes(n));

  return (
    <div>
      <PageTitle title="Tox & Boutique" sub="Les Tox sont les passifs achetés en match avec des Spamtons. La boutique s'ouvre tous les 2 tours avec 3 offres ; la Chance (qui monte de 1 par tour) décide de la rareté." />

      <Section title="Règles de la boutique">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Tours pairs", "La boutique s'ouvre aux tours 2, 4, 6…"],
            ["3 offres", "Chacune avec sa propre rareté"],
            ["1 achat", "Acheter ferme la boutique"],
            ["Relance 10", "+5 par relance supplémentaire"],
            ["Passer +10", "Spamtons gagnés en passant"],
            ["+50 Spamtons", "Quand une de vos cartes meurt"],
          ].map(([a, b]) => (
            <div key={a} className="card-panel p-3"><div className="font-bold text-amber-300">{a}</div><div className="mt-1 text-xs text-zinc-400">{b}</div></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">Chaque joueur a aussi 1 bannissement par match. Les revenus : numéro du tour + somme des Spamtons de vos cartes vivantes. Épique dès le tour 6, Légendaire dès le tour 12.</p>
      </Section>

      <Section title="Probabilités de rareté selon la Chance" sub="Part des offres à chaque rareté (la Chance = numéro du tour sauf Tox/talents qui l'augmentent).">
        <div className="card-panel overflow-x-auto p-4">
          <div className="flex min-w-[720px] items-end gap-[3px]" style={{ height: 160 }}>
            {LUCK_TABLE.slice(0, 31).map((r, i) => {
              const c = Math.max(0, 100 - r[0] - r[1] - r[2]);
              return (
                <div key={i} className="flex flex-1 flex-col-reverse" title={`Chance ${i} — Commune ${c.toFixed(1)}% · Rare ${r[0]}% · Épique ${r[1]}% · Légendaire ${r[2]}%`} style={{ height: "100%" }}>
                  <div style={{ height: `${c}%`, background: RAR_COLOR.Common }} />
                  <div style={{ height: `${r[0]}%`, background: RAR_COLOR.Rare }} />
                  <div style={{ height: `${r[1]}%`, background: RAR_COLOR.Epic }} />
                  <div style={{ height: `${r[2]}%`, background: RAR_COLOR.Legendary }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex min-w-[720px] justify-between text-[10px] text-zinc-500"><span>Chance 0</span><span>10</span><span>20</span><span>30</span></div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {["Common", "Rare", "Epic", "Legendary"].map((r) => (
              <span key={r} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: RAR_COLOR[r] }} />{RAR_FR[r]}</span>
            ))}
          </div>
        </div>
      </Section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className={`btn ${tab === "tox" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("tox")}>Tox ({snap.tox.length})</button>
        <button className={`btn ${tab === "talents" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("talents")}>Talents ({snap.talents.length})</button>
        <input className="input ml-auto min-w-[200px]" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {tab === "tox" &&
        cats.map(([cat, list]) => {
          const shown = list.filter((t) => !n || norm(t.name + " " + t.text + " " + toxFr(t).name + " " + toxFr(t).text).includes(n));
          if (!shown.length) return null;
          return (
            <Section key={cat} title={CAT_FR[cat] ?? toxCategoryFr(cat, list[0])}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {shown.map((t) => (
                  <div key={t.id} className="card-panel p-3" style={{ contentVisibility: "auto", containIntrinsicSize: "200px 170px" }}>
                    <div className="mb-2 flex items-center gap-2">
                      <ToxIcon icon={t.icon} />
                      <div className="font-bold text-white">{toxFr(t).name}</div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {t.ladder.map((l) => (
                        <span key={l.rarity} className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: RAR_COLOR[l.rarity] + "26", color: RAR_COLOR[l.rarity] }}>
                          {l.value} · {l.price} ⬢
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-zinc-300">{toxFr(t).text}</p>
                    {t.startsOn.length > 0 && (
                      <p className="mt-2 text-xs text-zinc-500">Départ sur : {t.startsOn.slice(0, 6).map(fn).join(", ")}{t.startsOn.length > 6 ? "…" : ""}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          );
        })}

      {tab === "talents" && (
        <div className="grid gap-2 md:grid-cols-2">
          {talents.map((t) => (
            <div key={t.id} className="card-panel p-3" style={{ contentVisibility: "auto", containIntrinsicSize: "100px 90px" }}>
              <div className="font-semibold text-white">{talentInfoFr(t).name}</div>
              <div className="text-sm text-zinc-300">{talentInfoFr(t).text}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {t.cards.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ", "}
                    {nameToSlug.get(c) ? <a className="hover:text-amber-300" href={`/cards/${nameToSlug.get(c)}`}>{fn(c)}</a> : fn(c)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
