"use client";

import { useMemo, useState } from "react";
import { EL_FR, RAR_LETTER, TOX_CATALOG, type RawCard } from "@/sim/compile";
import { CardChip } from "./CardView";
import { CardModal } from "./CardsBrowser";
import { pct } from "./DeckRow";
import { useSpam } from "./SpamProvider";
import { PageHeader } from "./PageHeader";

const RAR_COLOR = ["text-zinc-300", "text-cyan-300", "text-fuchsia-300", "text-amber-300"];
const pts = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1).replace(".", ",")} pts`;

/** Barre centrée sur 0 : vert à droite (gain), rouge à gauche (perte). */
function Delta({ d, max, lo, hi }: { d: number; max: number; lo?: number; hi?: number }) {
  const w = (x: number) => `${Math.min(50, (Math.abs(x) / max) * 50)}%`;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-white/8">
      <div className="absolute left-1/2 top-[-3px] h-[16px] w-px bg-white/30" />
      {lo !== undefined && hi !== undefined && (
        <div className="absolute top-0 h-2.5 rounded-full bg-white/15" style={{ left: `calc(50% + ${Math.max(-50, (lo / max) * 50)}%)`, width: `${Math.min(100, ((hi - lo) / max) * 50)}%` }} />
      )}
      <div className={`absolute top-0 h-2.5 rounded-full ${d >= 0 ? "bg-emerald-400" : "bg-red-400"}`} style={d >= 0 ? { left: "50%", width: w(d) } : { right: "50%", width: w(d) }} />
    </div>
  );
}

export function ImpactView() {
  const { lab, ds, loading, byNum } = useSpam();
  const [tab, setTab] = useState<"tox" | "cartes" | "elements">("tox");
  const [rar, setRar] = useState<number | null>(null);
  const [sort, setSort] = useState<"tot" | "tard" | "prix">("tot");
  const [open, setOpen] = useState<RawCard | null>(null);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const tox = useMemo(() => {
    if (!lab) return [];
    const m = new Map<string, { fam: string; el: number; r: number; t2?: (typeof lab.impact.tox)[number]; t8?: (typeof lab.impact.tox)[number] }>();
    for (const t of lab.impact.tox) {
      const k = `${t.fam}:${t.el}:${t.r}`;
      const e = m.get(k) ?? m.set(k, { fam: t.fam, el: t.el, r: t.r }).get(k)!;
      if (t.turn === 2) e.t2 = t; else e.t8 = t;
    }
    return [...m.values()].map((e) => {
      const f = TOX_CATALOG.find((x) => x.fam === e.fam && (e.el < 0 || x.el === e.el)) ?? TOX_CATALOG.find((x) => x.fam === e.fam);
      const price = f?.prices[e.r] ?? null;
      const d2 = e.t2?.d ?? 0;
      return { ...e, name: f?.name ?? e.fam, desc: f?.desc ?? "", v: f?.vals[e.r], price, d2, d8: e.t8?.d ?? 0, per100: price ? (d2 / price) * 100 : 0 };
    });
  }, [lab]);

  if (loading || !ds) return <p className="py-20 text-center text-white/60">Chargement…</p>;
  if (!lab) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl text-white sm:text-4xl">Impact sur la victoire</h1>
        <p className="panel p-8 text-center text-white/60">Le calcul d&apos;impact du patch {ds.version} n&apos;est pas encore publié. Il est lancé automatiquement sur le serveur après chaque patch (environ une heure) ; revenez un peu plus tard.</p>
      </div>
    );
  }

  const shownTox = tox
    .filter((t) => rar === null || t.r === rar)
    .sort((a, b) => (sort === "tard" ? b.d8 - a.d8 : sort === "prix" ? b.per100 - a.per100 : b.d2 - a.d2));
  const maxTox = Math.max(0.02, ...tox.map((t) => Math.max(Math.abs(t.d2), Math.abs(t.d8))));

  const avgCard = lab.impact.cards.reduce((p, c) => p + c.wr, 0) / Math.max(1, lab.impact.cards.length);
  const abBy = new Map<number, { ab: number; d: number }[]>();
  for (const a of lab.impact.abilities) (abBy.get(a.num) ?? abBy.set(a.num, []).get(a.num)!).push(a);
  const s = q.trim().toLowerCase();
  const cardsShown = lab.impact.cards.filter((c) => !s || (byNum.get(c.num)?.name.toLowerCase().includes(s) ?? false));
  const maxPts = Math.max(0.01, ...lab.impact.pts.map((p) => Math.abs(p.d)));

  return (
    <div className="space-y-6">
      <PageHeader group="comprendre" title="Impact sur la victoire" lead="Ce que chaque Tox, carte, talent ou capacité rapporte réellement, mesuré en rejouant les mêmes parties avec et sans." more={<p>Ce que chaque Tox, carte, talent, capacité et point d&apos;élément apporte <b>réellement</b> au taux de victoire, mesuré par expérience : la même partie est rejouée avec et sans l&apos;élément testé (mêmes tirages), dans les {lab.meta.decks.length > 0 ? "meilleurs decks de la méta" : "decks de référence"}. Calculé sur le serveur pour le patch {lab.version} : {lab.games.toLocaleString("fr-FR")} parties simulées.</p>} />

      <div className="flex flex-wrap gap-2">
        <button className="chip !px-4 !py-2 !text-sm" data-on={tab === "tox"} onClick={() => setTab("tox")}>Tox</button>
        <button className="chip !px-4 !py-2 !text-sm" data-on={tab === "cartes"} onClick={() => setTab("cartes")}>Cartes, talents & capacités</button>
        <button className="chip !px-4 !py-2 !text-sm" data-on={tab === "elements"} onClick={() => setTab("elements")}>Points d&apos;élément</button>
      </div>

      {tab === "tox" && (
        <section className="space-y-3">
          <p className="max-w-3xl text-xs text-white/55">
            Gain de taux de victoire quand le Tox est obtenu <b>gratuitement</b> au tour 2 (tôt) ou au tour 8 (tard), posé sur la carte que l&apos;IA juge la meilleure. « Pour 100 Spamtons » rapporte le gain tôt à son prix en boutique : c&apos;est le meilleur indicateur de rentabilité. La bande grise est l&apos;intervalle de confiance à 95 %.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button className="chip" data-on={rar === null} onClick={() => setRar(null)}>Toutes raretés</button>
            {RAR_LETTER.map((l, r) => <button key={l} className="chip" data-on={rar === r} onClick={() => setRar(r)}><span className={RAR_COLOR[r]}>{["Commun", "Rare", "Épique", "Légendaire"][r]}</span></button>)}
            <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="tot">Tri : impact tôt</option><option value="tard">Tri : impact tard</option><option value="prix">Tri : rentabilité (pour 100 Spamtons)</option>
            </select>
          </div>
          <div className="panel divide-y divide-white/5">
            {shownTox.map((t, i) => (
              <div key={`${t.fam}:${t.el}:${t.r}`} className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-1.5 p-3 sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:items-center">
                <div className="font-display text-lg text-white/55">{i + 1}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-white"><span className={RAR_COLOR[t.r]}>{t.name}</span> <span className="text-white/55">{RAR_LETTER[t.r]}{t.v !== null && t.v !== undefined && t.v > 1 ? ` · ${t.v}` : ""}{t.price ? ` · ${t.price} Sp.` : ""}</span></div>
                  <div className="truncate text-xs text-white/55" title={t.desc}>{t.desc}</div>
                </div>
                <div className="col-span-2 grid grid-cols-[3rem_1fr_4.6rem] items-center gap-2 sm:col-span-1"><span className="text-xs text-white/55">tôt</span><Delta d={t.d2} lo={t.t2?.lo} hi={t.t2?.hi} max={maxTox} /><span className={`text-right text-xs ${t.d2 >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pts(t.d2)}</span></div>
                <div className="col-span-2 grid grid-cols-[3rem_1fr_4.6rem] items-center gap-2 sm:col-span-1"><span className="text-xs text-white/55">tard</span><Delta d={t.d8} lo={t.t8?.lo} hi={t.t8?.hi} max={maxTox} /><span className={`text-right text-xs ${t.d8 >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pts(t.d8)}</span></div>
                <div className="col-span-2 text-xs text-white/60 sm:col-span-1 sm:text-right">{t.price ? <>{pts(t.per100)}<span className="text-white/55"> /100 Sp.</span></> : "—"}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "cartes" && (
        <section className="space-y-3">
          <p className="max-w-3xl text-xs text-white/55">
            Chaque carte remplace tour à tour une carte des meilleurs decks de la méta ({lab.impact.ctx} situations, contre {lab.impact.opps} decks de référence). Le taux de victoire obtenu mesure sa valeur dans la méta actuelle (moyenne de toutes les cartes : {pct(avgCard)}). Les talents sont testés un par un ; la contribution d&apos;une capacité est la perte de taux de victoire quand la carte ne l&apos;utilise jamais.
          </p>
          <input className="input sm:max-w-xs" type="search" placeholder="Rechercher une carte" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="panel divide-y divide-white/5">
            {cardsShown.slice(0, showAll || s ? undefined : 40).map((c) => {
              const card = byNum.get(c.num);
              if (!card) return null;
              const rank = lab.impact.cards.indexOf(c) + 1;
              const abs = (abBy.get(c.num) ?? []).slice().sort((a, b) => a.ab - b.ab);
              return (
                <div key={c.num} className="flex gap-3 p-3">
                  <div className="w-8 shrink-0 pt-1 font-display text-lg text-white/55">{rank}</div>
                  <CardChip card={card} size={52} onClick={() => setOpen(card)} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <button className="truncate text-left text-sm text-white hover:underline" onClick={() => setOpen(card)}>{card.name}</button>
                      <span className={`font-display text-lg ${c.wr >= avgCard ? "text-emerald-300" : "text-white/70"}`}>{pct(c.wr)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.tal.map((t) => {
                        const tt = card.talents.find((x) => x.slot === t.slot);
                        return (
                          <span key={t.slot} title={tt?.effect} className={`rounded-full px-2 py-0.5 text-xs ${t.slot === c.best ? "bg-[#ff9ad5]/20 text-[#ff9ad5]" : "bg-black/35 text-white/55"}`}>
                            {tt ? tt.name : "sans talent"} · {pct(t.wr, 0)}
                          </span>
                        );
                      })}
                    </div>
                    {abs.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {abs.map((a) => (
                          <span key={a.ab} className="rounded-full bg-black/35 px-2 py-0.5 text-xs text-white/60" title="Perte de taux de victoire si la capacité n'est jamais utilisée">
                            {card.abilities[a.ab]?.name ?? `capacité ${a.ab + 1}`} <span className={a.d >= 0 ? "text-emerald-300" : "text-red-300"}>{pts(a.d)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!showAll && !s && cardsShown.length > 40 && <button className="btn w-full" onClick={() => setShowAll(true)}>Afficher les {cardsShown.length} cartes</button>}
        </section>
      )}

      {tab === "elements" && (
        <section className="space-y-3">
          <p className="max-w-3xl text-xs text-white/55">Gain moyen de taux de victoire quand un deck de la méta commence la partie avec 5 points d&apos;élément en plus (soit +50 % de dégâts et de soins dans cet élément). Indique quels éléments font gagner dans la méta actuelle.</p>
          <div className="panel space-y-3 p-4">
            {lab.impact.pts.slice().sort((a, b) => b.d - a.d).map((p) => {
              const el = ds.elements.find((e) => e.id === ["fire", "light", "earth", "nature", "shadow", "water", "divine"][p.el]);
              return (
                <div key={p.el} className="grid grid-cols-[6.5rem_1fr_4.6rem] items-center gap-3 text-sm">
                  <span style={{ color: el?.color }}>{EL_FR[p.el]}</span>
                  <Delta d={p.d} max={maxPts} />
                  <span className={`text-right text-xs ${p.d >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pts(p.d)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-white/55">Calcul du {new Date(lab.at).toLocaleString("fr-FR")} · {lab.cores} cœurs · {Math.round(lab.seconds / 60)} min · IA rapide réglée par auto-apprentissage (parties simulées contre elle-même et analyse des choix de l&apos;IA experte).</p>
      {open && <CardModal card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
