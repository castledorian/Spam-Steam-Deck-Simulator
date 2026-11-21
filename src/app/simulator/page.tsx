"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useData, useOwned } from "@/components/DataProvider";
import { DeckCards, ElementMix, RateBadge, ToxUse } from "@/components/DeckView";
import { Loading, PageTitle, Section, pct } from "@/components/ui";
import { useJob } from "@/components/useSim";
import { getMeta, getPool } from "@/lib/sim/session";
import { searchOwned, versus, scoreConfidence, validateDeckCoverage, type DeckResult, type Quality, type SearchInfo } from "@/lib/sim/search";
import type { DeckSpec } from "@/lib/sim/engine";
import { cardName } from "@/lib/fr";

const QUALITY: Record<Quality, string> = {
  fast: "Rapide (~15 s)",
  standard: "Standard (~1 min)",
  deep: "Profond (plusieurs min)",
};

export default function SimulatorPage() {
  const { snap, loading, bySlug } = useData();
  const { owned } = useOwned();
  const job = useJob();
  const [quality, setQuality] = useState<Quality>("standard");
  const [info, setInfo] = useState<SearchInfo | null>(null);
  const [metaN, setMetaN] = useState(0);
  const [detail, setDetail] = useState<{ idx: number; rows: DeckResult[] } | null>(null);
  const [manual, setManual] = useState<string[]>(["", "", "", ""]);
  const [manualRes, setManualRes] = useState<DeckResult | null>(null);

  const ownedList = useMemo(() => Object.entries(owned).filter(([s]) => bySlug.has(s)).map(([slug, lvl]) => ({ slug, lvl })), [owned, bySlug]);
  const combos = ownedList.length >= 4 ? (ownedList.length * (ownedList.length - 1) * (ownedList.length - 2) * (ownedList.length - 3)) / 24 : 0;
  const metaRef = useMemo(() => ({ current: [] as DeckResult[] }), []);

  if (loading || !snap) return <Loading />;

  const launch = async () => {
    setInfo(null);
    setDetail(null);
    await job.run(async (onP) => {
      const meta = await getMeta(snap, quality, onP);
      metaRef.current = meta;
      setMetaN(meta.length);
      const r = await searchOwned(getPool(snap), snap, ownedList, meta.map((m) => m.deck), quality, onP);
      setInfo(r);
    });
  };

  const showDetail = async (i: number) => {
    if (!info) return;
    if (detail?.idx === i) return setDetail(null);
    const rows = await job.run(async (onP) => versus(getPool(snap), info.results[i].deck, metaRef.current.map((m) => m.deck), 400, onP));
    if (rows) setDetail({ idx: i, rows: rows.map((r, k) => ({ ...r, deck: metaRef.current[k].deck })) });
  };

  const testManual = async () => {
    const d: DeckSpec = { s: manual, l: manual.map((s) => owned[s] ?? 3) };
    const meta = await job.run(async (onP) => getMeta(snap, quality, onP));
    if (!meta) return;
    metaRef.current = meta;
    setMetaN(meta.length);
    const r = await job.run(async (onP) => {
      onP({ phase: "Évaluation du deck", pct: 0.1 });
      const [e] = await getPool(snap).run([{ a: d, games: 6000, seed: 4242 }], meta.map((m) => m.deck));
      onP({ phase: "Évaluation du deck", pct: 1 });
      return e;
    });
    if (r) {
      const ci = scoreConfidence(r.w, r.d, r.n - r.w - r.d);
      setManualRes({ deck: d, w: r.w, d: r.d, n: r.n, rate: (r.w + r.d / 2) / r.n, ...ci, ...validateDeckCoverage(snap, d) });
    }
  };

  const sorted = [...snap.cards].sort((a, b) => cardName(a).localeCompare(cardName(b), "fr"));
  const manualOk = manual.every(Boolean) && new Set(manual).size === 4;

  return (
    <div>
      <PageTitle
        title="Simulateur de decks"
        sub="Cherche les meilleurs decks de 4 cartes avec uniquement vos cartes et vos talents débloqués, face à la méta actuelle (les meilleurs decks de tout le pool), boutique Tox incluse."
      />

      <div className="card-panel mb-6 p-4">
        {ownedList.length < 4 ? (
          <div className="text-zinc-300">
            Il vous faut au moins 4 cartes dans votre collection ({ownedList.length} actuellement).{" "}
            <Link href="/collection" className="font-semibold text-amber-300 hover:underline">Renseigner ma collection →</Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm text-zinc-300">
              <b className="text-xl text-white">{ownedList.length}</b> cartes possédées →{" "}
              <b className="text-white">{combos.toLocaleString("fr-FR")}</b> decks possibles
              <div className="text-zinc-500">{combos <= 40000 ? "Toutes les combinaisons seront testées." : "Exploration génétique (trop de combinaisons pour tout tester)."}</div>
            </div>
            <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as Quality)} disabled={job.running}>
              {(Object.keys(QUALITY) as Quality[]).map((q) => (
                <option key={q} value={q}>{QUALITY[q]}</option>
              ))}
            </select>
            {!job.running ? (
              <button className="btn btn-primary" onClick={() => void launch()}>▶ Trouver mes meilleurs decks</button>
            ) : (
              <button className="btn btn-ghost" onClick={job.cancel}>■ Annuler</button>
            )}
          </div>
        )}
        {(job.running || job.pct > 0) && job.running && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm text-zinc-300">
              <span>{job.phase}</span>
              <span>{Math.round(job.pct * 100)} % · {Math.round(job.elapsed)} s</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full origin-left bg-gradient-to-r from-amber-400 to-orange-500" style={{ transform: `scaleX(${job.pct})`, transition: "transform .25s linear" }} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">Le calcul tourne dans des Web Workers : l&apos;interface reste fluide.</p>
          </div>
        )}
        {job.error && <div className="mt-3 text-red-400">Erreur : {job.error}</div>}
      </div>

      {info && (
        <>
          <div className="card-panel mb-5 grid gap-3 p-4 text-sm sm:grid-cols-4">
            <div><div className="text-xl font-bold text-white">{info.candidates.toLocaleString("fr-FR")}</div><div className="text-zinc-400">decks évalués au 1er tour{info.exhaustive ? " (exhaustif)" : ""}</div></div>
            <div><div className="text-xl font-bold text-white">{info.games.toLocaleString("fr-FR")}</div><div className="text-zinc-400">parties simulées</div></div>
            <div><div className="text-xl font-bold text-white">{metaN}</div><div className="text-zinc-400">decks de méta affrontés</div></div>
            <div><div className="text-xl font-bold text-white">IC 95 %</div><div className="text-zinc-400">Intervalle du score moyen (victoire = 1, nul = 0,5)</div></div>
          </div>
          <Section title="Vos meilleurs decks" sub="Taux de victoire contre la méta (les meilleurs decks de tout le pool, talents max) + 12 decks aléatoires. Alternance du premier joueur à chaque partie.">
            <div className="space-y-4">
              {info.results.slice(0, 10).map((r, i) => (
                <div key={r.deck.s.join()} className="card-panel p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-amber-400 px-2 py-0.5 text-sm font-extrabold text-black">#{i + 1}</span>
                        <ElementMix slugs={r.deck.s} />
                      </div>
                      <div className="mt-1 text-sm text-zinc-400">
                        {r.deck.s.map((s) => cardName(bySlug.get(s), s)).join(" · ")}
                      </div>
                    </div>
                    <RateBadge r={r} big />
                  </div>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
                    <div className="space-y-2">
                      <DeckCards slugs={r.deck.s} lvls={r.deck.l} />
                      {r.experimental && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"><b>Résultat expérimental — fidélité non certifiée</b><ul className="mt-1 list-disc pl-4">{r.validationWarnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white">{r.vsRandom ? pct(r.vsRandom.rate, 0) : "—"}</div><div className="text-xs text-zinc-400">vs decks aléatoires</div></div>
                        <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white">{pct(r.d / r.n, 1)}</div><div className="text-xs text-zinc-400">matchs nuls</div></div>
                        <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white">{r.turns ? r.turns.toFixed(1).replace(".", ",") : "—"}</div><div className="text-xs text-zinc-400">tours / partie</div></div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Plan boutique (achats les plus fréquents)</div>
                        <ToxUse tox={r.tox} />
                      </div>
                      <button className="btn btn-ghost !py-1" onClick={() => void showDetail(i)} disabled={job.running}>
                        {detail?.idx === i ? "Masquer" : "Détail contre chaque deck de méta"}
                      </button>
                    </div>
                  </div>
                  {detail?.idx === i && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="tbl w-full text-sm">
                        <thead><tr><th>Deck de méta</th><th>Victoires</th><th>IC 95 %</th></tr></thead>
                        <tbody>
                          {[...detail.rows].sort((a, b) => a.rate - b.rate).map((d) => (
                            <tr key={d.deck.s.join()}>
                              <td className="text-zinc-300">{d.deck.s.map((s) => cardName(bySlug.get(s), s)).join(" · ")}</td>
                              <td className={d.rate >= 0.5 ? "text-emerald-400" : "text-red-400"}>{pct(d.rate)}</td>
                              <td className="text-zinc-500">{pct(d.lo, 0)} – {pct(d.hi, 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      <Section title="Tester un deck précis" sub="Choisissez 4 cartes (talents max pour les cartes hors collection) et mesurez-le sur 6 000 parties contre la méta.">
        <div className="card-panel p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            {manual.map((v, i) => (
              <select key={i} className="input" value={v} onChange={(e) => setManual((m) => m.map((x, k) => (k === i ? e.target.value : x)))}>
                <option value="">Carte {i + 1}…</option>
                {sorted.map((c) => (
                  <option key={c.slug} value={c.slug}>{cardName(c)}{c.slug in owned ? " ✓" : ""}</option>
                ))}
              </select>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-primary" disabled={!manualOk || job.running} onClick={() => void testManual()}>Simuler ce deck</button>
            {!manualOk && manual.some(Boolean) && <span className="text-sm text-zinc-500">4 cartes différentes requises</span>}
          </div>
          {manualRes && (
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
              <div className="space-y-2">
                <DeckCards slugs={manualRes.deck.s} lvls={manualRes.deck.l} />
                {manualRes.experimental && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"><b>Résultat expérimental — fidélité non certifiée</b><ul className="mt-1 list-disc pl-4">{manualRes.validationWarnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
              </div>
              <div><RateBadge r={manualRes} big /><p className="mt-2 text-sm text-zinc-400">Contre {metaN || "les"} decks de méta, premier joueur alterné.</p></div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
