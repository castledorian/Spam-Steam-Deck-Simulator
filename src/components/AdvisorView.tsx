"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { adviseDeck, type Advice, type AdviceSwap, Precision, PRECISION_INFO, PRECISION_LABEL, PRECISIONS } from "@/sim/pool";
import type { DeckSpec } from "@/sim/engine";
import { DeckCards, DeckTalents, ToxPlan, WinBar, pct } from "./DeckRow";
import { CardChip } from "./CardView";
import { Picker, type Pick } from "./AnalysisView";
import { useSpam } from "./SpamProvider";

interface Result { advice: Advice; precision: Precision; ms: number; source: "collection" | "all"; deck: number[] }
const signed = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1).replace(".", ",") + " pts";

export function AdvisorView() {
  const { ds, cards, collection, lvOf, byNum, getPool, meta, ensureMeta, loading } = useSpam();
  const [deck, setDeck] = useState<Pick>({ cards: [] });
  const [source, setSource] = useState<"collection" | "all">("collection");
  const [precision, setPrecision] = useState<Precision>("precis");
  const [autoTal, setAutoTal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [done, setDone] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const [stale, setStale] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const owned = useMemo(() => Object.keys(collection).map(Number).filter((n) => byNum.has(n)), [collection, byNum]);
  const valid = deck.cards.length === 4 && deck.cards.every((x) => x > 0) && new Set(deck.cards).size === 4;
  const pool = source === "collection" ? owned : cards.map((c) => c.number);
  const nameOf = (n: number) => byNum.get(n)?.name ?? `#${n}`;
  const notOwned = valid && source === "collection" ? deck.cards.filter((n) => !collection[n]) : [];

  const setD = (d: Pick) => { setDeck(d); if (res) setStale(true); };

  const run = async () => {
    if (!valid) return;
    setErr(null); setBusy(true); setStale(false);
    const t0 = performance.now();
    try {
      const sim = await getPool();
      setPhase("Préparation de la méta de référence…"); setDone(0);
      const m = await ensureMeta(precision === "rapide" ? "rapide" : "precis", (p, v) => { setPhase("Méta · " + p); setDone(v * 0.1); });
      const gauntlet: DeckSpec[] = m.decks.map((d) => ({ cards: d.cards, lv: d.cards.map(() => 3), tal: d.tal }));
      // les cartes déjà possédées gardent leur niveau ; une carte que l'on teste sans la posséder est supposée au niveau maximal
      const lv = (n: number) => (source === "all" || !collection[n] ? 3 : lvOf(n));
      const start: DeckSpec = { cards: deck.cards, lv: deck.cards.map(lv), tal: autoTal ? undefined : deck.tal };
      const advice = await adviseDeck(sim, start, pool, lv, gauntlet, precision, (p, v) => { setPhase(p); setDone(0.1 + v * 0.9); });
      setRes({ advice, precision, ms: performance.now() - t0, source, deck: deck.cards.slice() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const apply = (s: AdviceSwap) => {
    const c = deck.cards.slice(); c[s.pos] = s.in;
    setDeck({ cards: c, tal: autoTal ? undefined : s.tal });
    setStale(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading || !ds) return <p className="py-20 text-center text-white/60">Chargement…</p>;
  const a = res?.advice;
  const gOpp = (i: number) => meta?.decks[i];
  const matchups = a?.base.vs?.slice().sort((x, y) => x.wr - y.wr) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Conseiller de deck</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/65">
          Entrez vos 4 cartes. Le simulateur joue votre deck contre les meilleurs decks de la méta, puis essaie <b>chaque remplacement possible</b> d&apos;une carte
          (avec votre collection ou toutes les cartes), choisit les talents et vous dit ce qui améliore vraiment votre taux de victoire, avec la marge d&apos;erreur de chaque gain.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Picker label="Mon deck" color="#ffc756" deck={deck} setDeck={setD} />
        <div className="panel space-y-3 p-4 text-sm">
          <div className="space-y-1.5">
            <h2 className="font-semibold text-white">Cartes proposées en remplacement</h2>
            <label className="flex cursor-pointer items-center gap-2"><input type="radio" checked={source === "collection"} onChange={() => setSource("collection")} /> Ma collection <b className="text-emerald-300">({owned.length})</b></label>
            <label className="flex cursor-pointer items-center gap-2"><input type="radio" checked={source === "all"} onChange={() => setSource("all")} /> Toutes les cartes du jeu ({cards.length})</label>
            {source === "collection" && owned.length < 5 && <p className="rounded-lg bg-amber-400/10 p-2 text-amber-200">Il faut au moins 5 cartes en collection pour proposer un remplacement. <Link href="/collection" className="underline">Renseigner ma collection</Link></p>}
            {notOwned.length > 0 && <p className="text-xs text-amber-200/80">Hors collection dans votre deck : {notOwned.map(nameOf).join(", ")} (supposées au niveau maximal).</p>}
          </div>
          <div className="space-y-1.5">
            <h2 className="font-semibold text-white">Précision</h2>
            {PRECISIONS.map((p) => (
              <label key={p} className="flex cursor-pointer flex-wrap items-center gap-x-2"><input type="radio" checked={precision === p} onChange={() => setPrecision(p)} /> {PRECISION_LABEL[p]} <span className="text-white/45">{PRECISION_INFO[p].replace(/·.*/, "")}</span></label>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-white/75"><input type="checkbox" checked={autoTal} onChange={(e) => setAutoTal(e.target.checked)} /> Laisser le simulateur choisir les talents</label>
          <button className="btn btn-primary w-full !py-3 text-base" disabled={busy || !valid || pool.length < 5} onClick={() => void run()}>{busy ? "Analyse en cours…" : "▶ Analyser mon deck"}</button>
          {!valid && <p className="text-xs text-amber-200">Choisissez 4 cartes différentes (ou chargez un deck de la méta pour partir d&apos;une base).</p>}
        </div>
      </div>

      {busy && (
        <div className="panel space-y-2 p-4">
          <div className="flex justify-between text-sm"><span>{phase}</span><span>{Math.round(done * 100)} %</span></div>
          <div className="progress"><div style={{ width: `${done * 100}%` }} /></div>
          <p className="text-xs text-white/50">Les calculs tournent dans des Web Workers : l&apos;interface reste fluide. Plus la précision est haute, plus les gains annoncés sont fiables.</p>
        </div>
      )}
      {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}
      {stale && res && !busy && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">Le deck a changé depuis la dernière analyse : relancez-la pour mettre les résultats à jour.</p>}

      {a && res && (
        <>
          <section className="panel space-y-4 p-5">
            <h2 className="font-display text-2xl text-white">Votre deck face à la méta</h2>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <DeckCards cards={res.deck} size={70} />
              <WinBar d={a.base} big />
            </div>
            <DeckTalents cards={res.deck} tal={a.baseTal} />
            {a.talents.length > 0 && <p className="text-xs text-emerald-300">Les talents choisis par le simulateur ont gagné aussi avec de nouveaux tirages (≈ {signed(a.talents.reduce((s, t) => s + t.d, 0))}).</p>}
            <p className="text-xs text-white/50">Taux moyen contre les {a.gauntlet} meilleurs decks de la méta (50 % = équilibre), {a.base.n.toLocaleString("fr-FR")} matchs, premier joueur alterné.</p>
            {a.base.tox && a.base.tox.length > 0 && <div className="space-y-1"><div className="text-xs text-white/45">Tox que l&apos;IA achète le plus avec ce deck (part des parties)</div><ToxPlan tox={a.base.tox} /></div>}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-display text-2xl text-white">Recommandations</h2>
              <p className="text-sm text-white/60">Remplacement d&apos;une carte, remesuré avec de nouveaux tirages après le tri ({a.matches.toLocaleString("fr-FR")} matchs simulés au total). Le gain est la différence avec votre deck actuel, avec son intervalle de confiance à 95 %.</p>
            </div>
            {a.swaps.filter((s) => s.d > 0).length === 0 && <div className="panel p-4 text-sm text-emerald-200">Aucun remplacement ne fait mieux que votre deck avec {res.source === "collection" ? "votre collection" : "toutes les cartes"} : il est déjà très bien optimisé.</div>}
            {a.swaps.filter((s) => s.d > 0).map((s, i) => {
              const out = byNum.get(s.out), inn = byNum.get(s.in);
              const sure = s.dlo > 0;
              const tIn = inn?.talents.find((t) => t.slot === s.tal[s.pos]);
              return (
                <article key={i} className="panel flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
                  <div className="font-display text-3xl text-[#ffc756]">#{i + 1}</div>
                  <div className="flex items-center gap-3">
                    {out && <CardChip card={out} size={58} />}
                    <span className="text-2xl text-white/50">→</span>
                    {inn && <CardChip card={inn} size={58} />}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="text-white"><b>{nameOf(s.out)}</b> remplacée par <b className="text-[#ffc756]">{nameOf(s.in)}</b></div>
                    <div className="text-white/60">Nouveau taux : {pct(s.wr)} · gain <b className={sure ? "text-emerald-300" : "text-amber-200"}>{signed(s.d)}</b> <span className="text-white/40">(IC {signed(s.dlo)} à {signed(s.dhi)})</span></div>
                    <div className="text-xs text-white/45">{sure ? "Gain statistiquement fiable." : "Gain probable mais pas certain : relancez en précision supérieure pour confirmer."}{tIn ? ` Talent conseillé : ${tIn.name}.` : ""}{source_note(res.source, collection, s.in)}</div>
                  </div>
                  <button className="btn" onClick={() => apply(s)}>Appliquer</button>
                </article>
              );
            })}
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="font-display text-2xl text-white">Matchups</h2>
            <p className="text-sm text-white/60">Vos pires et meilleurs adversaires dans la méta.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...matchups.slice(0, 6), ...matchups.slice(-3)].filter((v, i, arr) => arr.indexOf(v) === i).map((v) => {
                const opp = gOpp(v.i);
                if (!opp) return null;
                return (
                  <div key={v.i} className="rounded-xl bg-black/30 p-2">
                    <div className="mb-1 flex justify-between text-xs"><span className="text-white/55">vs méta #{v.i + 1}</span><span className={v.wr >= 0.5 ? "text-emerald-300" : "text-red-300"}>{pct(v.wr, 0)}</span></div>
                    <DeckCards cards={opp.cards} size={40} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel space-y-2 p-5 text-sm text-white/65">
            <h2 className="font-display text-xl text-white">Quelle fiabilité ?</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Chaque variante affronte chaque adversaire avec les <b>mêmes tirages</b> que votre deck et le premier joueur alterné : la comparaison est plus fine qu&apos;un simple taux de victoire.</li>
              <li>Les meilleurs remplacements sont <b>remesurés avec de nouveaux tirages</b> : pas de gain gonflé par le hasard du tri.</li>
              <li>Les adversaires sont les decks de la méta calculée sur des millions de parties, avec leurs talents optimisés ; l&apos;IA qui joue est celle apprise sur l&apos;IA experte.</li>
              <li>Limites : le simulateur n&apos;est pas calibré sur de vraies parties, un remplacement à la fois est testé (pas les échanges de 2 cartes), et le jeu en conditions réelles dépend aussi de vos choix. Pour vérifier un coup précis, utilisez <Link href="/analyse" className="underline">l&apos;analyse de partie</Link> ou jouez le deck sur le <Link href={`/plateau#a=${res.deck.join(",")}&t=${a.baseTal.join(",")}`} className="underline">plateau</Link>.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function source_note(source: "collection" | "all", collection: Record<number, unknown>, n: number) {
  return source === "all" && !collection[n] ? " Carte que vous ne possédez pas." : "";
}
