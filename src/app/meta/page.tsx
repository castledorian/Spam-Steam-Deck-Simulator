"use client";
import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { DeckCards, ElementMix, RateBadge } from "@/components/DeckView";
import { Loading, PageTitle, Section, pct } from "@/components/ui";
import { useJob } from "@/components/useSim";
import { cachedMeta, getMeta, getPool } from "@/lib/sim/session";
import { roundRobin, type DeckResult, type Matrix, type Quality } from "@/lib/sim/search";

const QUALITY: Record<Quality, string> = { fast: "Rapide (~20 s)", standard: "Standard (~1 min)", deep: "Profond (plusieurs min)" };

export default function MetaPage() {
  const { snap, loading, bySlug } = useData();
  const job = useJob();
  const [quality, setQuality] = useState<Quality>("standard");
  const [meta, setMeta] = useState<DeckResult[] | null>(null);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [games, setGames] = useState(400);
  const [sel, setSel] = useState<number | null>(null);

  const initial = useMemo(() => (snap ? cachedMeta(snap, quality) : null), [snap, quality]);
  const list = meta ?? initial;

  if (loading || !snap) return <Loading />;

  const compute = async (force: boolean) => {
    setMatrix(null);
    const m = await job.run((onP) => getMeta(snap, quality, onP, force));
    if (m) setMeta(m);
  };
  const tournament = async () => {
    if (!list) return;
    const top = list.slice(0, 10);
    const m = await job.run((onP) => roundRobin(getPool(snap), top.map((t) => t.deck), games, onP));
    if (m) setMatrix(m);
  };
  const short = (s: string) => (bySlug.get(s)?.name ?? s).split(/[ ,]+/)[0];

  const order = matrix ? matrix.overall.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]) : [];

  return (
    <div>
      <PageTitle
        title="Méta & Arène"
        sub="Les meilleurs decks de tout le pool de 151 cartes (talents max), trouvés par co-évolution : des centaines de decks s'affrontent, les meilleurs survivent et mutent. Puis tournoi : meilleurs decks contre meilleurs decks."
      />
      <div className="card-panel mb-6 flex flex-wrap items-center gap-3 p-4">
        <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as Quality)} disabled={job.running}>
          {(Object.keys(QUALITY) as Quality[]).map((q) => (
            <option key={q} value={q}>{QUALITY[q]}</option>
          ))}
        </select>
        {!job.running ? (
          <>
            <button className="btn btn-primary" onClick={() => void compute(true)}>▶ {list ? "Recalculer la méta" : "Calculer la méta"}</button>
            {list && (
              <>
                <select className="input" value={games} onChange={(e) => setGames(+e.target.value)}>
                  {[200, 400, 1000, 2000].map((g) => (
                    <option key={g} value={g}>{g} parties / duel</option>
                  ))}
                </select>
                <button className="btn btn-ghost" onClick={() => void tournament()}>⚔ Lancer le tournoi (top 10)</button>
              </>
            )}
          </>
        ) : (
          <button className="btn btn-ghost" onClick={job.cancel}>■ Annuler</button>
        )}
        {job.running && (
          <div className="w-full">
            <div className="mb-1 flex justify-between text-sm text-zinc-300"><span>{job.phase}</span><span>{Math.round(job.pct * 100)} % · {Math.round(job.elapsed)} s</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full origin-left bg-gradient-to-r from-fuchsia-400 to-amber-400" style={{ transform: `scaleX(${job.pct})`, transition: "transform .25s linear" }} />
            </div>
          </div>
        )}
        {job.error && <div className="w-full text-red-400">Erreur : {job.error}</div>}
        {!list && !job.running && <p className="w-full text-sm text-zinc-400">La méta est calculée dans votre navigateur (Web Workers) puis mise en cache pour ce patch.</p>}
      </div>

      {matrix && (
        <Section title="Arène : meilleurs decks entre eux" sub={`${matrix.n} parties par duel, premier joueur alterné. Lecture : la ligne bat la colonne avec ce pourcentage.`}>
          <div className="card-panel overflow-x-auto p-3">
            <table className="tbl w-full text-center text-xs">
              <thead>
                <tr>
                  <th>Deck</th>
                  {order.map((j) => (
                    <th key={j} className="text-center" title={matrix.decks[j].s.map((s) => bySlug.get(s)?.name).join(" · ")}>#{j + 1}</th>
                  ))}
                  <th className="text-center">Moy.</th>
                </tr>
              </thead>
              <tbody>
                {order.map((i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-left text-zinc-300">#{i + 1} {matrix.decks[i].s.map(short).join("/")}</td>
                    {order.map((j) => {
                      const v = matrix.rate[i][j];
                      const bg = i === j ? "transparent" : v >= 0.5 ? `rgba(52,211,153,${(v - 0.5) * 1.6})` : `rgba(248,113,113,${(0.5 - v) * 1.6})`;
                      return <td key={j} style={{ background: bg }} className="text-white">{i === j ? "—" : Math.round(v * 100)}</td>;
                    })}
                    <td className="font-bold text-amber-300">{pct(matrix.overall[i], 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {list && (
        <Section title={`Top ${list.length} decks de la méta`} sub="Taux de victoire contre 40 decks aléatoires + les 20 meilleurs. Les decks trop proches (3 cartes en commun) sont regroupés pour garder des archétypes distincts.">
          <div className="space-y-4">
            {list.map((r, i) => (
              <div key={r.deck.s.join()} className="card-panel p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-fuchsia-400 px-2 py-0.5 text-sm font-extrabold text-black">#{i + 1}</span>
                      <ElementMix slugs={r.deck.s} />
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">{r.deck.s.map((s) => bySlug.get(s)?.name).join(" · ")}</div>
                  </div>
                  <RateBadge r={r} />
                </div>
                <button className="mb-2 text-xs text-amber-300 hover:underline" onClick={() => setSel(sel === i ? null : i)}>{sel === i ? "Masquer les cartes" : "Voir les cartes"}</button>
                {sel === i && <div className="max-w-md"><DeckCards slugs={r.deck.s} /></div>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
