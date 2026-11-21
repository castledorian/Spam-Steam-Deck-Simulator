"use client";

import { useState } from "react";
import { Precision, PRECISION_INFO, PRECISION_LABEL, PRECISIONS } from "@/sim/pool";
import { CardChip } from "./CardView";
import { CardModal } from "./CardsBrowser";
import { DeckCards, DeckTalents, ToxPlan, WinBar, pct } from "./DeckRow";
import { useSpam } from "./SpamProvider";
import type { RawCard } from "@/sim/compile";

const TIERS: { t: string; min: number; color: string }[] = [
  { t: "S", min: 0.75, color: "#ff7a7a" }, { t: "A", min: 0.5, color: "#ffb25a" }, { t: "B", min: 0.3, color: "#ffe45a" }, { t: "C", min: 0.12, color: "#9bf07a" }, { t: "D", min: 0, color: "#7ac8ff" },
];

export function MetaView() {
  const { meta, metaBusy, ensureMeta, ds, byNum, cards, loading } = useSpam();
  const [precision, setPrecision] = useState<Precision>("precis");
  const [phase, setPhase] = useState("");
  const [p, setP] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<RawCard | null>(null);

  const run = async () => {
    setErr(null);
    try { await ensureMeta(precision, (ph, v) => { setPhase(ph); setP(v); }, true); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  if (loading || !ds) return <p className="py-20 text-center text-white/60">Chargement…</p>;

  // tier list : présence pondérée dans les meilleurs decks de la méta
  const maxPresence = meta ? Math.max(1, ...Object.values(meta.cards).map((c) => c.presence)) : 1;
  const tiers = TIERS.map((t) => ({ ...t, cards: [] as { c: RawCard; v: number }[] }));
  if (meta) {
    for (const c of cards) {
      const e = meta.cards[c.number];
      const v = e ? (e.presence / maxPresence) * 0.7 + Math.max(0, (e.wr - 0.5) * 2) * 0.3 : 0;
      const t = tiers.find((x) => v >= x.min) ?? tiers[tiers.length - 1];
      t.cards.push({ c, v });
    }
    tiers.forEach((t) => t.cards.sort((a, b) => b.v - a.v));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-white sm:text-4xl">Méta & Tier list</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/65">
            Les meilleurs decks de <b>toutes les cartes du jeu</b> (talents débloqués) s&apos;affrontent entre eux avec boutique de Tox, Chance et passifs. Le résultat est mémorisé dans ce navigateur et sert d&apos;adversaires de référence dans le simulateur.
          </p>
        </div>
        <div className="panel flex flex-wrap items-center gap-3 p-3 text-sm">
          <select className="input !w-auto" value={precision} onChange={(e) => setPrecision(e.target.value as Precision)} disabled={metaBusy}>
            {PRECISIONS.map((x) => <option key={x} value={x}>{PRECISION_LABEL[x]} — {PRECISION_INFO[x]}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => void run()} disabled={metaBusy}>{metaBusy ? "Calcul…" : meta ? "↻ Recalculer la méta" : "▶ Calculer la méta"}</button>
        </div>
      </div>
      {metaBusy && (
        <div className="panel space-y-2 p-4"><div className="flex justify-between text-sm"><span>{phase}</span><span>{Math.round(p * 100)} %</span></div><div className="progress"><div style={{ width: `${p * 100}%` }} /></div></div>
      )}
      {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}
      {!meta && !metaBusy && <p className="panel p-8 text-center text-white/60">Aucune méta calculée pour le patch {ds.version}. Lancez le calcul : le résultat est ensuite mémorisé dans ce navigateur pour ce patch.</p>}

      {meta && (
        <>
          <div className="panel grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-4">
            <div><div className="font-display text-2xl">{meta.combos.toLocaleString("fr-FR")}</div><div className="text-xs text-white/50">decks de 4 cartes évalués</div></div>
            <div><div className="font-display text-2xl">{meta.candidates}</div><div className="text-xs text-white/50">candidats retenus</div></div>
            <div><div className="font-display text-2xl">{meta.sims.toLocaleString("fr-FR")}</div><div className="text-xs text-white/50">matchs simulés</div></div>
            <div><div className="font-display text-2xl">patch {meta.version}</div><div className="text-xs text-white/50">calculée le {new Date(meta.at).toLocaleDateString("fr-FR")}</div></div>
          </div>

          <section className="space-y-3">
            <h2 className="font-display text-2xl text-white">Meilleurs decks (decks contre decks)</h2>
            <p className="text-xs text-white/50">Taux de victoire moyen face aux autres decks du championnat (50 % = équilibre), intervalle de confiance à 95 %.</p>
            {meta.decks.slice(0, 12).map((d, i) => (
              <article key={i} className="panel p-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="font-display text-3xl text-[#ffc756]">#{i + 1}</div>
                  <DeckCards cards={d.cards} size={68} />
                  <div className="min-w-0 flex-1 basis-56 space-y-1"><div className="text-xs text-white/45">Plan de Tox</div><ToxPlan tox={d.tox} max={6} /></div>
                  <div className="w-full sm:w-auto"><WinBar d={d} /></div>
                </div>
                <DeckTalents cards={d.cards} tal={d.tal} />
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl text-white">Tier list des cartes</h2>
            <p className="text-xs text-white/50">Classement par présence et taux de victoire dans les meilleurs decks simulés.</p>
            {tiers.map((t) => (
              <div key={t.t} className="panel flex gap-3 p-3">
                <div className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl font-display text-3xl text-black sm:h-16 sm:w-14 sm:text-4xl" style={{ background: t.color }}>{t.t}</div>
                <div className="flex flex-wrap gap-1.5">
                  {t.cards.length === 0 && <span className="self-center text-sm text-white/35">—</span>}
                  {t.cards.map(({ c }) => {
                    const e = meta.cards[c.number];
                    return <div key={c.number} className="text-center"><CardChip card={c} size={54} onClick={() => setOpen(byNum.get(c.number) ?? null)} title={e ? `${c.name} — dans ${e.decks} decks du top, ${pct(e.wr, 0)}` : c.name} /></div>;
                  })}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {open && <CardModal card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
