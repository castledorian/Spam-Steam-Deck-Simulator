"use client";

import { useMemo, useState } from "react";
import type { DeckSpec } from "@/sim/engine";
import type { AnalyseOut } from "@/sim/pool";
import type { DecisionRec } from "@/sim/search";
import { DeckCards, DeckTalents, pct } from "./DeckRow";
import { useSpam } from "./SpamProvider";

export interface Pick { cards: number[]; tal?: number[] }
const KIND: Record<DecisionRec["kind"], string> = { cast: "Ordre des capacités", target: "Cible", shop: "Boutique", option: "Choix", turn: "Tour" };
const DEPTH = [
  { r: 16, l: "Rapide", info: "≈ 20-40 s" },
  { r: 40, l: "Normale", info: "≈ 1-2 min" },
  { r: 80, l: "Poussée", info: "≈ 3-5 min" },
];

export function Picker({ label, color, deck, setDeck }: { label: string; color: string; deck: Pick; setDeck: (d: Pick) => void }) {
  const { cards, meta } = useSpam();
  const set = (i: number, n: number) => {
    const c = deck.cards.slice(); while (c.length < 4) c.push(0); c[i] = n;
    const tal = deck.tal?.slice(); if (tal) tal[i] = 0;
    setDeck({ cards: c, tal: tal && tal.every((x, k) => x > 0 || k === i) ? tal : undefined });
  };
  return (
    <div className="panel space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl" style={{ color }}>{label}</h3>
        {meta && (
          <select className="input !w-auto !py-1 text-xs" value="" onChange={(e) => { if (e.target.value) { const d = meta.decks[+e.target.value]; setDeck({ cards: d.cards, tal: d.tal }); } }}>
            <option value="">Deck de la méta…</option>
            {meta.decks.slice(0, 30).map((d, i) => <option key={i} value={i}>Méta #{i + 1} ({pct(d.wr, 0)})</option>)}
          </select>
        )}
      </div>
      <DeckCards cards={deck.cards.filter(Boolean)} size={64} />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <select key={i} className="input !py-1.5 text-xs" value={deck.cards[i] ?? 0} onChange={(e) => set(i, +e.target.value)}>
            <option value={0}>— carte {i + 1} —</option>
            {cards.map((c) => <option key={c.number} value={c.number}>{c.name}</option>)}
          </select>
        ))}
      </div>
      {deck.tal && <DeckTalents cards={deck.cards} tal={deck.tal} />}
    </div>
  );
}

/** Courbe de la probabilité de victoire du deck A au fil des décisions. */
function WinCurve({ ds }: { ds: DecisionRec[] }) {
  const pts = ds.map((d) => { const v = d.wr[d.chosen]; return d.side === 0 ? v : 1 - v; });
  if (pts.length < 2) return null;
  const W = 600, H = 120;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - v * H;
  const path = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const turns: { i: number; t: number }[] = [];
  ds.forEach((d, i) => { if (!i || d.turn !== ds[i - 1].turn) turns.push({ i, t: d.turn }); });
  return (
    <div className="panel p-3">
      <div className="mb-1 flex justify-between text-xs text-white/55"><span>Chances de victoire du deck A, estimées à chaque décision</span><span>100 %</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Courbe des chances de victoire">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {turns.map((t) => <line key={t.i} x1={x(t.i)} x2={x(t.i)} y1={0} y2={H} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />)}
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="rgba(123,240,138,.12)" />
        <path d={path} fill="none" stroke="#7bf08a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-white/40"><span>début</span><span>50 %</span><span>fin</span></div>
    </div>
  );
}

function DecisionCard({ d }: { d: DecisionRec }) {
  const order = d.labels.map((l, i) => ({ l, i, wr: d.wr[i] })).sort((a, b) => (b.wr || 0) - (a.wr || 0));
  const diff = d.chosen !== d.def;
  const gain = diff ? d.wr[d.chosen] - d.wr[d.def] : 0;
  const me = d.side === 0 ? "#7bf08a" : "#ff9a7a";
  return (
    <div className={`rounded-xl border p-2.5 ${diff && gain >= 0.05 ? "border-amber-300/40 bg-amber-300/5" : "border-white/10 bg-black/25"}`}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span><b style={{ color: me }}>{d.side === 0 ? "A" : "B"}</b> · {KIND[d.kind]}</span>
        {diff ? <span className="text-amber-200">l&apos;IA rapide aurait joué autrement ({gain >= 0 ? "−" : "+"}{Math.abs(gain * 100).toFixed(0)} pts)</span> : <span className="text-white/40">même choix que l&apos;IA rapide</span>}
      </div>
      <div className="space-y-1">
        {order.map((o) => (
          <div key={o.i} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-xs">
            <span className={`truncate ${o.i === d.chosen ? "text-white" : "text-white/55"}`} title={o.l}>
              {o.i === d.chosen ? "✔ " : ""}{o.l}{o.i === d.def && diff ? <span className="text-white/40"> (IA rapide)</span> : null}
            </span>
            <span className={o.i === d.chosen ? "text-white" : "text-white/50"}>{Number.isNaN(o.wr) ? "—" : pct(o.wr, 0)}</span>
            <div className="col-span-2 h-1.5 rounded-full bg-white/8"><div className="h-1.5 rounded-full" style={{ width: `${(o.wr || 0) * 100}%`, background: o.i === d.chosen ? me : "rgba(255,255,255,.25)" }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalysisView() {
  const { ds, loading, meta, getPool } = useSpam();
  const [a, setA] = useState<Pick>({ cards: [] });
  const [b, setB] = useState<Pick>({ cards: [] });
  const [depth, setDepth] = useState(1);
  const [who, setWho] = useState<"both" | "a">("both");
  const [first, setFirst] = useState<"a" | "b" | "rand">("rand");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [out, setOut] = useState<(AnalyseOut & { decks: [Pick, Pick] }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyKey, setOnlyKey] = useState(true);

  const valid = (d: Pick) => d.cards.length === 4 && d.cards.every((x) => x > 0) && new Set(d.cards).size === 4;
  const ok = valid(a) && valid(b);
  const spec = (d: Pick): DeckSpec => ({ cards: d.cards, lv: [3, 3, 3, 3], tal: d.tal });

  const run = async () => {
    setBusy(true); setErr(null); setProg(0); setOut(null);
    try {
      const pool = await getPool();
      const f: 0 | 1 = first === "a" ? 0 : first === "b" ? 1 : Math.random() < 0.5 ? 0 : 1;
      const r = await pool.analyse([spec(a), spec(b)], (Math.random() * 1e9) >>> 0, DEPTH[depth].r, [true, who === "both"], f, setProg);
      setOut({ ...r, decks: [a, b] });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const timeline = useMemo(() => {
    if (!out) return [];
    type Item = { kind: "log"; text: string } | { kind: "dec"; d: DecisionRec };
    const turns: { title: string; items: Item[] }[] = [];
    let di = 0;
    const ds = out.decisions;
    out.log.forEach((line, li) => {
      while (di < ds.length && (ds[di].at ?? 0) <= li) { turns[turns.length - 1]?.items.push({ kind: "dec", d: ds[di] }); di++; }
      if (line.startsWith("— Tour")) turns.push({ title: line.replace(/—/g, "").trim(), items: [] });
      else (turns[turns.length - 1] ?? turns[turns.push({ title: "Début", items: [] }) - 1]).items.push({ kind: "log", text: line });
    });
    while (di < ds.length) { turns[turns.length - 1]?.items.push({ kind: "dec", d: ds[di] }); di++; }
    return turns;
  }, [out]);

  if (loading || !ds) return <p className="py-20 text-center text-white/60">Chargement…</p>;

  const changed = out ? out.decisions.filter((d) => d.chosen !== d.def) : [];
  const byKind = (k: DecisionRec["kind"]) => changed.filter((d) => d.kind === k);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Analyse de partie</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/65">
          Une partie jouée par l&apos;<b>IA experte</b>, comme un moteur d&apos;échecs : à chaque décision (cible, ordre des capacités, achat ou relance en boutique, option d&apos;un « Choix »), chaque possibilité est jouée puis la partie est terminée des dizaines de fois avec des tirages différents. Vous voyez le pourcentage de victoire de chaque option, le coup retenu et les endroits où l&apos;IA rapide (celle des tournois de decks) se serait trompée.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Picker label="Deck A" color="#7bf08a" deck={a} setDeck={setA} />
        <Picker label="Deck B" color="#ff9a7a" deck={b} setDeck={setB} />
      </div>

      <div className="panel grid gap-3 p-3 text-sm sm:flex sm:flex-wrap sm:items-center">
        <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">Profondeur
          <select className="input w-full sm:!w-auto" value={depth} onChange={(e) => setDepth(+e.target.value)} disabled={busy}>
            {DEPTH.map((x, i) => <option key={i} value={i}>{x.l} · {x.info}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">Joueurs analysés
          <select className="input w-full sm:!w-auto" value={who} onChange={(e) => setWho(e.target.value as typeof who)} disabled={busy}>
            <option value="both">Les deux</option><option value="a">Deck A seulement</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">Commence
          <select className="input w-full sm:!w-auto" value={first} onChange={(e) => setFirst(e.target.value as typeof first)} disabled={busy}>
            <option value="rand">au hasard</option><option value="a">Deck A</option><option value="b">Deck B</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={!ok || busy} onClick={() => void run()}>{busy ? "Analyse…" : "▶ Analyser une partie"}</button>
        {!ok && <span className="text-xs text-amber-200">Choisissez 4 cartes différentes pour chaque deck{meta ? " (ou un deck de la méta)" : ""}.</span>}
        {busy && <span className="text-xs text-white/60">{prog} décisions évaluées…</span>}
        <p className="text-[11px] text-white/45 sm:basis-full">Profondeur : {DEPTH[depth].r * 2} fins de partie ou plus par option testée. Si seul le deck A est analysé, le deck B est joué par l&apos;IA rapide.</p>
      </div>
      {err && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

      {out && (
        <>
          <div className="panel grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-4">
            <div><div className="font-display text-2xl" style={{ color: out.result.winner === 0 ? "#7bf08a" : out.result.winner === 1 ? "#ff9a7a" : "#fff" }}>{out.result.winner === -1 ? "Égalité" : `Victoire ${out.result.winner === 0 ? "A" : "B"}`}</div><div className="text-xs text-white/50">{Math.ceil(out.result.turns / 2)} tours · terrain {["Feu", "Lumière", "Terre", "Nature", "Ombre", "Eau"][out.result.terrain]}</div></div>
            <div><div className="font-display text-2xl">{out.decisions.length}</div><div className="text-xs text-white/50">décisions analysées</div></div>
            <div><div className="font-display text-2xl">{changed.length}</div><div className="text-xs text-white/50">corrigées par l&apos;IA experte ({byKind("target").length} cibles, {byKind("shop").length} boutique, {byKind("cast").length} ordre)</div></div>
            <div><div className="font-display text-2xl">{out.rollouts.toLocaleString("fr-FR")}</div><div className="text-xs text-white/50">fins de partie simulées</div></div>
          </div>

          <WinCurve ds={out.decisions} />

          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl text-white">Déroulé</h2>
            <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} /> Décisions importantes seulement</label>
          </div>
          <div className="space-y-3">
            {timeline.map((t, ti) => (
              <details key={ti} className="panel p-3" open={ti < 4}>
                <summary className="cursor-pointer font-display text-lg text-white">{t.title}</summary>
                <div className="mt-2 space-y-1.5">
                  {t.items.map((it, k) => {
                    if (it.kind === "log") return <div key={k} className="whitespace-pre-wrap text-xs leading-relaxed text-white/65">{it.text}</div>;
                    const d = it.d;
                    const spread = Math.max(...d.wr.filter((x) => !Number.isNaN(x))) - Math.min(...d.wr.filter((x) => !Number.isNaN(x)));
                    if (onlyKey && d.chosen === d.def && spread < 0.1) return null;
                    return <DecisionCard key={k} d={d} />;
                  })}
                </div>
              </details>
            ))}
          </div>
          <p className="text-xs text-white/40">Les pourcentages sont des estimations (quelques dizaines de fins de partie par option) : un écart de moins de 5 à 10 points peut venir du hasard. Augmentez la profondeur pour plus de précision.</p>
        </>
      )}
    </div>
  );
}
