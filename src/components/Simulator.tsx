"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { combos, DeckStat, optimize, Precision, PRECISION_INFO, PRECISION_LABEL, PRECISIONS, wilson } from "@/sim/pool";
import type { DeckSpec, Snapshot } from "@/sim/engine";
import { DeckCards, DeckTalents, ToxPlan, WinBar, pct } from "./DeckRow";
import { useSpam } from "./SpamProvider";

interface OptResult { decks: DeckStat[]; candidates: number; combos: number; matches: number; poolSize: number; precision: Precision; ms: number }

export function Simulator() {
  const { ds, cards, collection, lvOf, byNum, getPool, meta, ensureMeta, loading } = useSpam();
  const [tab, setTab] = useState<"opt" | "duel">("opt");
  const [source, setSource] = useState<"collection" | "all">("collection");
  const [precision, setPrecision] = useState<Precision>("precis");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [pctDone, setPctDone] = useState(0);
  const [res, setRes] = useState<OptResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [duelA, setDuelA] = useState<number[]>([]);
  const [duelB, setDuelB] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(0);
  const cancel = useRef(false);

  const ownedNums = useMemo(() => Object.keys(collection).map(Number).filter((n) => byNum.has(n)), [collection, byNum]);
  const poolNums = source === "collection" ? ownedNums : cards.map((c) => c.number);

  useEffect(() => { setRes(null); }, [ds?.version]);

  const run = async () => {
    setErr(null);
    setBusy(true);
    cancel.current = false;
    const t0 = performance.now();
    try {
      const pool = await getPool();
      setPhase("Préparation de la méta (une seule fois par patch)…"); setPctDone(0);
      const m = await ensureMeta(precision === "rapide" ? "rapide" : "precis", (p, v) => { setPhase("Calcul de la méta · " + p); setPctDone(v * 0.35); });
      const gauntlet: DeckSpec[] = m.decks.map((d) => ({ cards: d.cards, lv: d.cards.map(() => 3), tal: d.tal }));
      const r = await optimize(pool, poolNums, (n) => (source === "all" ? 3 : lvOf(n)), gauntlet, precision, (p, v) => { setPhase(p); setPctDone(0.35 + v * 0.65); });
      setRes({ ...r, poolSize: poolNums.length, precision, ms: performance.now() - t0 });
      setExpanded(0);
      if (r.decks[0]) setDuelA(r.decks[0].cards);
      if (m.decks[0]) setDuelB((b) => (b.length ? b : m.decks[0].cards));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !ds) return <p className="py-20 text-center text-white/60">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Simulateur de decks</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/65">
          Le moteur rejoue les duels selon les règles publiées : 4 cartes, recharges, points d&apos;éléments (+10 %/point), résistances, critiques, Spamtons, <b>boutique de Tox</b> toutes les 2 tours (Chance, rareté, relance, passer), passifs de départ et <b>un talent actif par carte</b>, choisi par simulation. Les meilleurs decks sont ensuite affinés en échangeant leurs cartes une à une.
        </p>
      </div>
      <div className="flex gap-2">
        <button className="chip flex-1 !px-4 !py-2 !text-sm sm:flex-none" data-on={tab === "opt"} onClick={() => setTab("opt")}>Optimiser mon deck</button>
        <button className="chip flex-1 !px-4 !py-2 !text-sm sm:flex-none" data-on={tab === "duel"} onClick={() => setTab("duel")}>Duel deck contre deck</button>
      </div>

      {tab === "opt" && (
        <>
          <div className="panel grid gap-5 p-4 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <h2 className="font-semibold text-white">1. Cartes utilisables</h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" checked={source === "collection"} onChange={() => setSource("collection")} /> Ma collection <b className="text-emerald-300">({ownedNums.length} cartes)</b></label>
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" checked={source === "all"} onChange={() => setSource("all")} /> Toutes les cartes du jeu ({cards.length})</label>
              {source === "collection" && ownedNums.length < 4 && (
                <p className="rounded-lg bg-amber-400/10 p-2 text-sm text-amber-200">Il faut au moins 4 cartes. <Link href="/collection" className="underline">Renseigner ma collection</Link></p>
              )}
              <p className="text-xs text-white/50">{combos(poolNums.length).toLocaleString("fr-FR")} decks possibles de 4 cartes — tous évalués par le modèle statique, les meilleurs sont ensuite simulés.</p>
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-white">2. Précision statistique</h2>
              {PRECISIONS.map((p) => (
                <label key={p} className="flex cursor-pointer flex-wrap items-center gap-x-2 text-sm">
                  <input type="radio" checked={precision === p} onChange={() => setPrecision(p)} />
                  <span>{PRECISION_LABEL[p]}</span><span className="text-white/45">{PRECISION_INFO[p]}</span>
                </label>
              ))}
              {precision === "extreme" && <p className="text-xs text-amber-200/80">Recommandé pour décider du deck à jouer en classé. Laissez l&apos;onglet ouvert pendant le calcul.</p>}
            </div>
            <div className="flex flex-col justify-end gap-2">
              <button className="btn btn-primary w-full !px-6 !py-3 text-base lg:w-auto" disabled={busy || poolNums.length < 4} onClick={() => void run()}>
                {busy ? "Simulation en cours…" : "▶ Trouver les meilleurs decks"}
              </button>
            </div>
          </div>
          {busy && (
            <div className="panel space-y-2 p-4">
              <div className="flex justify-between text-sm"><span>{phase}</span><span>{Math.round(pctDone * 100)} %</span></div>
              <div className="progress"><div style={{ width: `${pctDone * 100}%` }} /></div>
              <p className="text-xs text-white/50">Les calculs tournent dans des Web Workers : l&apos;interface reste fluide (60 fps).</p>
            </div>
          )}
          {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

          {res && (
            <section className="space-y-4">
              <div className="panel grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-4">
                <Kpi l="Decks évalués (statique)" v={res.combos.toLocaleString("fr-FR")} />
                <Kpi l="Candidats simulés" v={res.candidates.toLocaleString("fr-FR")} />
                <Kpi l="Matchs simulés" v={res.matches.toLocaleString("fr-FR")} />
                <Kpi l="Durée" v={(res.ms / 1000).toFixed(1).replace(".", ",") + " s"} />
              </div>
              <p className="text-xs text-white/50">
                Taux de victoire = moyenne contre les {meta?.decks.length ?? 24} meilleurs decks de la méta (50 % = équilibre). L&apos;intervalle de confiance (Wilson, 95 %) indique la marge d&apos;erreur statistique ; le premier joueur est alterné pour annuler l&apos;avantage du lancer de pièce.
              </p>
              {res.decks.map((d, i) => (
                <article key={d.cards.join("-")} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <div className="font-display text-3xl text-[#ffc756]">#{i + 1}</div>
                    <DeckCards cards={d.cards} size={68} />
                    <div className="w-full sm:ml-auto sm:w-auto"><WinBar d={d} /></div>
                  </div>
                  <DeckTalents cards={d.cards} tal={d.tal} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-white/45">Plan de Tox le plus joué (part des parties)</div>
                      <ToxPlan tox={d.tox} />
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button className="btn flex-1 sm:flex-none" onClick={() => setExpanded(expanded === i ? null : i)}>{expanded === i ? "Masquer" : "Matchups"}</button>
                      <button className="btn flex-1 sm:flex-none" onClick={() => { setDuelA(d.cards); setTab("duel"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Tester en duel</button>
                    </div>
                  </div>
                  {expanded === i && meta && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {d.vs?.slice().sort((a, b) => a.i - b.i).map((v) => {
                        const opp = meta.decks[v.i];
                        if (!opp) return null;
                        const [lo, hi] = wilson(v.wr * v.n, v.n);
                        return (
                          <div key={v.i} className="rounded-xl bg-black/30 p-2">
                            <div className="mb-1 flex items-center justify-between text-xs"><span className="text-white/55">vs méta #{v.i + 1}</span><span className={v.wr >= 0.5 ? "text-emerald-300" : "text-red-300"}>{pct(v.wr)} <span className="text-white/40">({pct(lo, 0)}–{pct(hi, 0)})</span></span></div>
                            <DeckCards cards={opp.cards} size={40} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {tab === "duel" && <Duel a={duelA} b={duelB} setA={setDuelA} setB={setDuelB} />}
    </div>
  );
}

const Kpi = ({ l, v }: { l: string; v: string }) => (
  <div><div className="font-display text-2xl text-white">{v}</div><div className="text-xs text-white/50">{l}</div></div>
);

/* ---------------------------------- duel ---------------------------------- */

function DeckPicker({ label, deck, setDeck, color }: { label: string; deck: number[]; setDeck: (d: number[]) => void; color: string }) {
  const { cards, meta } = useSpam();
  const set = (i: number, n: number) => { const d = deck.slice(); while (d.length < 4) d.push(0); d[i] = n; setDeck(d); };
  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center justify-between"><h3 className="font-display text-xl" style={{ color }}>{label}</h3>
        {meta && (
          <select className="input !w-auto !py-1 text-xs" value="" onChange={(e) => e.target.value && setDeck(meta.decks[+e.target.value].cards)}>
            <option value="">Deck de la méta…</option>
            {meta.decks.map((d, i) => <option key={i} value={i}>Méta #{i + 1} ({pct(d.wr, 0)})</option>)}
          </select>
        )}
      </div>
      <DeckCards cards={deck.filter(Boolean)} size={70} />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <select key={i} className="input !py-1.5 text-xs" value={deck[i] ?? 0} onChange={(e) => set(i, +e.target.value)}>
            <option value={0}>— carte {i + 1} —</option>
            {cards.map((c) => <option key={c.number} value={c.number}>{c.name}</option>)}
          </select>
        ))}
      </div>
    </div>
  );
}

function Duel({ a, b, setA, setB }: { a: number[]; b: number[]; setA: (d: number[]) => void; setB: (d: number[]) => void }) {
  const { getPool, byNum, lvOf } = useSpam();
  const [n, setN] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [pr, setPr] = useState(0);
  const [out, setOut] = useState<{ aw: number; bw: number; d: number; turns: number; n: number } | null>(null);
  const [replay, setReplay] = useState<{ log: string[]; trace: Snapshot[]; winner: number } | null>(null);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const valid = (d: number[]) => d.length === 4 && d.every((x) => x > 0) && new Set(d).size === 4;
  const ok = valid(a) && valid(b);
  const specA = (): DeckSpec => ({ cards: a, lv: a.map(lvOf) });
  const specB = (): DeckSpec => ({ cards: b, lv: b.map(() => 3) });

  const run = async () => {
    setBusy(true); setErr(null); setPr(0);
    try {
      const pool = await getPool();
      const r = await pool.play([{ a: specA(), b: specB(), n, seed: (Date.now() & 0xffffff) >>> 0 }], false, setPr);
      setOut({ ...r[0], n });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const one = async () => {
    setBusy(true); setErr(null);
    try {
      const pool = await getPool();
      const r = await pool.duel(specA(), specB(), (Math.random() * 1e9) | 0);
      setReplay({ log: r.log, trace: r.trace, winner: r.result.winner });
      setStep(0);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const wr = out ? (out.aw + out.d / 2) / out.n : 0;
  const [lo, hi] = out ? wilson(out.aw + out.d / 2, out.n) : [0, 1];
  const snap = replay?.trace[Math.min(step, (replay?.trace.length ?? 1) - 1)];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <DeckPicker label="Deck A (vous)" deck={a} setDeck={setA} color="#7bf08a" />
        <DeckPicker label="Deck B (adversaire)" deck={b} setDeck={setB} color="#ff9a7a" />
      </div>
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <label className="flex items-center gap-2 text-sm">Nombre de parties
          <select className="input !w-auto" value={n} onChange={(e) => setN(+e.target.value)}>
            {[500, 2000, 10000, 40000, 100000].map((x) => <option key={x} value={x}>{x.toLocaleString("fr-FR")}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" disabled={!ok || busy} onClick={() => void run()}>▶ Simuler</button>
        <button className="btn" disabled={!ok || busy} onClick={() => void one()}>🎞 Rejouer un match détaillé</button>
        {!ok && <span className="text-xs text-amber-200">Choisissez 4 cartes différentes pour chaque deck.</span>}
        {busy && <div className="progress w-40"><div style={{ width: `${pr * 100}%` }} /></div>}
      </div>
      {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}
      {out && (
        <div className="panel grid items-center gap-5 p-4 sm:grid-cols-[auto_1fr]">
          <WinBar big d={{ wr, lo, hi, n: out.n }} />
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <Kpi l="Victoires A" v={out.aw.toLocaleString("fr-FR")} />
            <Kpi l="Victoires B" v={out.bw.toLocaleString("fr-FR")} />
            <Kpi l="Tours moyens" v={(out.turns / out.n).toFixed(1).replace(".", ",")} />
          </div>
        </div>
      )}
      {replay && snap && (
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xl text-white">Match détaillé — {replay.winner === -1 ? "égalité" : `victoire du deck ${replay.winner === 0 ? "A" : "B"}`}</h3>
            <span className="text-xs text-white/50">Tour {snap.turn} · joueur {snap.side === 0 ? "A" : "B"}</span>
          </div>
          <input type="range" min={0} max={replay.trace.length - 1} value={step} onChange={(e) => setStep(+e.target.value)} className="w-full" />
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((s) => (
              <div key={s} className="space-y-1.5 rounded-xl bg-black/30 p-2">
                <div className="flex justify-between text-xs text-white/60"><b style={{ color: s === 0 ? "#7bf08a" : "#ff9a7a" }}>Deck {s === 0 ? "A" : "B"}</b><span>Spamtons {snap.spam[s]} · bonus {snap.pts[s].join("/")}</span></div>
                {(s === 0 ? a : b).map((num, i) => {
                  const c = byNum.get(num);
                  const hp = snap.hp[s][i], mx = snap.max[s][i];
                  return (
                    <div key={i} className="text-xs"><div className="flex justify-between"><span className={snap.alive[s][i] ? "" : "text-white/35 line-through"}>{c?.name}</span><span>{hp}/{mx}</span></div>
                      <div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, (hp / mx) * 100))}%`, background: s === 0 ? "#80E532" : "#ff7a5a" }} /></div></div>
                  );
                })}
              </div>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-white/70">Journal complet du match</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-white/70">{replay.log.join("\n")}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
