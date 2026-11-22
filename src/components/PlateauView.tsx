"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compile, EL, EL_FR, RAR_LETTER, TOX_CATALOG } from "@/sim/compile";
import type { Board, BoardCard, DeckSpec } from "@/sim/engine";
import { runPlay, type PlayState } from "@/sim/play";
import { Picker, type Pick } from "./AnalysisView";
import { CardModal } from "./CardsBrowser";
import { img, useSpam } from "./SpamProvider";
import type { RawCard } from "@/sim/compile";

const SIDE_COLOR = ["#7bf08a", "#ff9a7a"];
const SIDE_NAME = ["Deck A", "Deck B"];
const KIND_TITLE = { cast: "Quelle capacité lancer ?", target: "Choisissez la cible", shop: "Boutique : acheter, relancer ou passer", option: "Choisissez l'option" } as const;
const SPEEDS = [0.5, 1, 2, 4];

const toxName = (t: { fam: string; r: number; el: number }) => {
  const f = TOX_CATALOG.find((x) => x.fam === t.fam && (t.fam !== "heart" || x.el === t.el)) ?? TOX_CATALOG.find((x) => x.fam === t.fam);
  return `${f?.name ?? t.fam} ${RAR_LETTER[t.r] ?? ""}`.trim();
};

/** Ce que la ligne de journal courante met en évidence sur le plateau. */
interface Fx { caster?: [number, string]; target?: [number, string, string] }
function fxOf(line: string | undefined): Fx {
  if (!line) return {};
  let m = line.match(/^ {2}([AB])·(.+?) → ([AB])·(.+?) : −(\d+)/);
  if (m) return { target: [m[3] === "A" ? 0 : 1, m[4], `−${m[5]}`] };
  m = line.match(/^ {2}([AB])·(.+?) soigne ([AB])·(.+?) \+(\d+)/);
  if (m) return { target: [m[3] === "A" ? 0 : 1, m[4], `+${m[5]}`] };
  m = line.match(/^([AB])·(.+?) lance « /);
  if (m) return { caster: [m[1] === "A" ? 0 : 1, m[2]] };
  return {};
}

function Tile({ c, raw, side, selected, fx, orb, onClick }: { c: BoardCard; raw?: RawCard; side: number; selected: boolean; fx: Fx; orb: string | null; onClick: () => void }) {
  const ratio = raw ? `${raw.artwork.width}/${raw.artwork.height}` : "3/4";
  const pct = c.max ? Math.max(0, Math.min(1, c.hp / c.max)) : 0;
  const hit = fx.target && fx.target[0] === side && fx.target[1] === c.name ? fx.target : null;
  const cast = fx.caster && fx.caster[0] === side && fx.caster[1] === c.name;
  return (
    <div className="min-w-0">
      <button type="button" onClick={onClick} aria-label={c.name} className={`relative block w-full overflow-hidden rounded-xl border bg-[#0b0618] text-left transition ${selected ? "border-white" : cast ? "border-amber-300" : "border-white/15 hover:border-white/50"} ${c.alive ? "" : "opacity-40 grayscale"}`} style={{ aspectRatio: ratio, boxShadow: cast ? "0 0 14px rgba(255,199,86,.55)" : undefined }}>
        {raw && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(raw.artwork.tiny)} alt="" decoding="async" className="h-full w-full object-contain" />}
        {c.frozen && <span className="absolute inset-0 bg-cyan-300/25" />}
        {orb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={orb} alt="" className="absolute left-0.5 top-0.5 h-[28%] w-auto drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]" style={{ maxWidth: "38%" }} />}
        <span className="absolute right-1 top-1 flex gap-0.5 text-[11px] leading-none">{c.taunt && <span title="Provocation">🛡</span>}{c.frozen && <span title="Gelée">❄</span>}{c.poison > 0 && <span title="Empoisonnée">☠</span>}</span>
        {hit && <span className={`absolute inset-x-0 top-1/3 text-center font-display text-2xl drop-shadow-[0_2px_3px_rgba(0,0,0,.9)] ${hit[2].startsWith("+") ? "text-emerald-300" : "text-red-400"}`}>{hit[2]}</span>}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1 pb-0.5 pt-4">
          <span className="block truncate text-[10px] leading-tight text-white sm:text-[11px]">{c.name}</span>
          <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-white/15"><span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct > 0.5 ? "#4ade80" : pct > 0.25 ? "#fbbf24" : "#f87171" }} /></span>
          <span className="block text-right text-[10px] leading-tight text-white/85">{c.alive ? `${c.hp.toLocaleString("fr-FR")} / ${c.max.toLocaleString("fr-FR")}` : "détruite"}</span>
        </span>
      </button>
      <div className="mt-1 flex flex-wrap gap-0.5">
        {c.abilities.map((a, k) => (
          <span key={k} title={a.text} className={`max-w-full truncate rounded px-1 py-px text-[9px] leading-tight sm:text-[10px] ${a.ready ? "bg-emerald-400/20 text-emerald-200" : "bg-white/8 text-white/50"}`}>{a.name} · {a.ready ? "prête" : a.cd > 0 ? `${a.cd} t.` : "—"}</span>
        ))}
        {c.tox.map((t, k) => <span key={"t" + k} className="max-w-full truncate rounded bg-fuchsia-400/15 px-1 py-px text-[9px] leading-tight text-fuchsia-200 sm:text-[10px]">{toxName(t)}</span>)}
      </div>
    </div>
  );
}

function Resources({ b, side }: { b: Board; side: number }) {
  const { ds } = useSpam();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <b className="font-display text-base" style={{ color: SIDE_COLOR[side] }}>{SIDE_NAME[side]}</b>
      <span title="Spamtons" className="rounded bg-amber-300/15 px-1.5 py-0.5 text-amber-200">💰 {b.spam[side]}</span>
      <span title="Chance" className="rounded bg-white/8 px-1.5 py-0.5 text-white/70">🍀 {b.luck[side]}</span>
      {EL.slice(0, 6).map((e, i) => {
        const ei = ds?.elements.find((x) => x.id === e);
        return (
          <span key={e} title={`${EL_FR[i]} : bonus +${b.pts[side][i] * 10} %`} className={`flex items-center gap-1 rounded px-1 py-0.5 ${b.terrain === i ? "bg-white/12" : ""}`}>
            {ei && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(ei.icon)} alt={EL_FR[i]} className="h-4 w-4" />}
            <span className={b.pts[side][i] ? "text-white" : "text-white/35"}>{b.pts[side][i]}</span>
          </span>
        );
      })}
    </div>
  );
}

function Inspector({ c, raw, onOpen }: { c: BoardCard; raw?: RawCard; onOpen: () => void }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div><div className="font-display text-lg text-white">{c.name}</div><div className="text-white/55">{EL_FR[c.el] ?? ""} · {c.alive ? `${c.hp} / ${c.max} PV` : "détruite"}</div></div>
        {raw && <button className="btn !px-2 !py-1 text-xs" onClick={onOpen}>Voir la carte</button>}
      </div>
      <div className="grid grid-cols-6 gap-1 text-center">
        {c.res.map((r, i) => <div key={i} className="rounded bg-black/25 py-0.5"><div className="text-[10px] text-white/45">{EL_FR[i].slice(0, 3)}</div><div className={r < 0 ? "text-red-300" : "text-white/85"}>{r}%</div></div>)}
      </div>
      <div className="text-[11px] text-white/45">Résistances</div>
      {c.tox.length > 0 && <div className="flex flex-wrap gap-1">{c.tox.map((t, k) => <span key={k} className="rounded bg-fuchsia-400/15 px-1.5 py-0.5 text-fuchsia-200">{toxName(t)}{TOX_CATALOG.find((x) => x.fam === t.fam)?.desc ? "" : ""}</span>)}</div>}
      {c.abilities.map((a, k) => (
        <div key={k} className="rounded-lg bg-black/25 p-2">
          <div className="flex justify-between gap-2"><b className="text-white">{a.name}</b><span className={a.ready ? "text-emerald-300" : "text-white/45"}>{a.ready ? "prête" : a.cd > 0 ? `recharge ${a.cd}` : "indisponible"}</span></div>
          <div className="mt-1 whitespace-pre-wrap leading-snug text-white/65">{a.text.replace(/\n-{3,}\s*ou\s*-{3,}\n/g, "\n— ou —\n")}</div>
        </div>
      ))}
    </div>
  );
}

const sideOfLine = (l: string) => { const m = l.match(/(?:^|\s|🛒 )([AB])(?:·| achète| relance)/); return m ? (m[1] === "A" ? 0 : 1) : -1; };

export function PlateauView() {
  const { ds, loading, layout, byNum } = useSpam();
  const comp = useMemo(() => (ds ? compile(ds) : null), [ds]);
  const [a, setA] = useState<Pick>({ cards: [] });
  const [b, setB] = useState<Pick>({ cards: [] });
  const [mode, setMode] = useState<"bots" | "play">("bots");
  const [first, setFirst] = useState<"rand" | "a" | "b">("rand");
  const [game, setGame] = useState<PlayState | null>(null);
  const [redo, setRedo] = useState<number[]>([]);
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [hint, setHint] = useState(true);
  const [tab, setTab] = useState<"journal" | "inspecteur" | "glossaire">("journal");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [open, setOpen] = useState<RawCard | null>(null);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const valid = (d: Pick) => d.cards.length === 4 && d.cards.every((x) => x > 0) && new Set(d.cards).size === 4;
  const ok = valid(a) && valid(b);
  const spec = (d: Pick): DeckSpec => ({ cards: d.cards, lv: [3, 3, 3, 3], tal: d.tal });

  // partie partagée par lien : #p=<base64>
  useEffect(() => {
    try {
      const h = window.location.hash.match(/^#p=(.+)$/);
      if (!h) return;
      const o = JSON.parse(decodeURIComponent(atob(h[1]))) as { d: [Pick, Pick]; s: number; f: 0 | 1; t: number; h: 0 | 1 | null; a: number[] };
      setA(o.d[0]); setB(o.d[1]); setMode(o.h === null ? "bots" : "play");
      setGame({ decks: [spec(o.d[0]), spec(o.d[1])], seed: o.s, first: o.f, terrain: o.t, human: o.h, answers: o.a });
    } catch { /* lien invalide : ignoré */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => (comp && game ? runPlay(comp, game) : null), [comp, game]);
  const frames = view?.frames ?? [];

  useEffect(() => { if (mode === "bots") { setFi(0); setPlaying(true); } }, [game, mode]);
  useEffect(() => {
    if (mode !== "bots" || !playing || !frames.length || fi >= frames.length - 1) return;
    const id = setTimeout(() => setFi((x) => Math.min(frames.length - 1, x + 1)), 650 / speed);
    return () => clearTimeout(id);
  }, [mode, playing, fi, frames.length, speed]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [fi, frames.length, tab]);

  const start = (same = false) => {
    if (!ok) return;
    const f: 0 | 1 = first === "a" ? 0 : first === "b" ? 1 : Math.random() < 0.5 ? 0 : 1;
    setRedo([]); setSel(null);
    setGame({ decks: [spec(a), spec(b)], seed: same && game ? game.seed : (Math.random() * 1e9) >>> 0, first: same && game ? game.first : f, terrain: same && game ? game.terrain : Math.floor(Math.random() * 6), human: mode === "play" ? 0 : null, answers: [] });
    if (!same) window.history.replaceState(null, "", window.location.pathname);
  };
  const answer = (i: number) => { if (!game) return; setRedo([]); setGame({ ...game, answers: [...game.answers, i] }); };
  const undo = () => { if (!game || !game.answers.length) return; setRedo([game.answers[game.answers.length - 1], ...redo]); setGame({ ...game, answers: game.answers.slice(0, -1) }); };
  const redoOne = () => { if (!game || !redo.length) return; setGame({ ...game, answers: [...game.answers, redo[0]] }); setRedo(redo.slice(1)); };
  const share = async () => {
    if (!game) return;
    const p = { d: [a, b], s: game.seed, f: game.first, t: game.terrain, h: game.human, a: game.answers };
    const url = `${window.location.origin}${window.location.pathname}#p=${btoa(encodeURIComponent(JSON.stringify(p)))}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("Copiez le lien :", url); }
  };

  if (loading || !ds || !comp) return <p className="py-20 text-center text-white/60">Chargement…</p>;

  const botBoard = frames[Math.min(fi, frames.length - 1)]?.board;
  const board: Board | undefined = mode === "bots" ? botBoard : view?.pending?.board ?? frames[frames.length - 1]?.board;
  const lineNow = mode === "bots" ? frames[Math.min(fi, frames.length - 1)]?.line : undefined;
  const fx = fxOf(lineNow);
  const shownFrames = mode === "bots" ? frames.slice(0, fi + 1) : frames;
  const finished = mode === "bots" ? !!view?.result && fi >= frames.length - 1 : !!view?.result;
  const orbOf = (c: BoardCard) => (layout ? img(layout.elementOrb.image.replace("{element}", EL[c.el] ?? "fire")) : null);
  let turnLine = "";
  for (let k = shownFrames.length - 1; k >= 0; k--) if (shownFrames[k].line.startsWith("— Tour")) { turnLine = shownFrames[k].line.replace(/—/g, "").trim().replace("joueur A", `joueur A`).replace("joueur B", "joueur B"); break; }
  const selCard = sel && board ? board.cards[sel[0]][sel[1]] : null;
  const rawOf = (c: BoardCard) => byNum.get(c.num);
  const pending = mode === "play" ? view?.pending ?? null : null;
  const mark = mode === "play" ? view?.mark ?? 0 : 0;

  const row = (side: number) => board && (
    <div className="space-y-2">
      <Resources b={board} side={side} />
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {board.cards[side].map((c, i) => <Tile key={i} c={c} raw={rawOf(c)} side={side} orb={orbOf(c)} fx={fx} selected={!!sel && sel[0] === side && sel[1] === i} onClick={() => { setSel([side, i]); setTab("inspecteur"); }} />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Plateau</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/65">Regardez deux bots s&apos;affronter en direct, ou prenez la place du deck A : vous choisissez l&apos;ordre des capacités, les cibles, les achats et les relances en boutique, le bot joue le deck B. Chaque partie est rejouable : <b>annuler</b> revient d&apos;une décision en arrière, <b>partager</b> copie un lien qui rouvre exactement la même partie.</p>
      </div>

      <details className="space-y-3" open={!game}>
        <summary className="cursor-pointer font-display text-lg text-white">Decks et options</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Picker label="Deck A" color={SIDE_COLOR[0]} deck={a} setDeck={setA} />
          <Picker label="Deck B" color={SIDE_COLOR[1]} deck={b} setDeck={setB} />
        </div>
      </details>

      <div className="panel grid gap-3 p-3 text-sm sm:flex sm:flex-wrap sm:items-center">
        <div className="inline-flex rounded-xl bg-black/30 p-1" role="tablist">
          {([["bots", "Bot contre bot"], ["play", "Je joue le deck A"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} className={`rounded-lg px-3 py-1.5 text-sm ${mode === k ? "bg-white/15 text-white" : "text-white/60"}`} onClick={() => { setMode(k); setGame(null); }}>{l}</button>
          ))}
        </div>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">Commence
          <select className="input w-full sm:!w-auto" value={first} onChange={(e) => setFirst(e.target.value as typeof first)}>
            <option value="rand">au hasard</option><option value="a">Deck A</option><option value="b">Deck B</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={!ok} onClick={() => start()}>{game ? "Nouvelle partie" : mode === "bots" ? "▶ Lancer le match" : "▶ Commencer à jouer"}</button>
        {game && <button className="btn" onClick={() => start(true)}>↺ Rejouer la même</button>}
        {game && <button className="btn" onClick={() => void share()}>{copied ? "Lien copié ✓" : "Partager"}</button>}
        {!ok && <span className="text-xs text-amber-200">Choisissez 4 cartes différentes pour chaque deck (ou un deck de la méta).</span>}
      </div>

      {game && board && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="space-y-3">
            <div className="panel flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
              <div className="text-white/75">{turnLine || "Début de partie"} · terrain <b className="text-white">{EL_FR[board.terrain]}</b></div>
              {mode === "bots" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button className="btn !px-2.5 !py-1" aria-label="Action précédente" onClick={() => { setPlaying(false); setFi((x) => Math.max(0, x - 1)); }}>⏮</button>
                  <button className="btn !px-3 !py-1" onClick={() => { if (fi >= frames.length - 1) { setFi(0); setPlaying(true); } else setPlaying(!playing); }}>{playing && fi < frames.length - 1 ? "⏸ Pause" : fi >= frames.length - 1 ? "↺ Revoir" : "▶ Lecture"}</button>
                  <button className="btn !px-2.5 !py-1" aria-label="Action suivante" onClick={() => { setPlaying(false); setFi((x) => Math.min(frames.length - 1, x + 1)); }}>⏭</button>
                  <button className="btn !px-2.5 !py-1" onClick={() => { setPlaying(false); setFi(frames.length - 1); }}>Fin</button>
                  <select className="input !w-auto !py-1 text-xs" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Vitesse">{SPEEDS.map((s) => <option key={s} value={s}>× {s}</option>)}</select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button className="btn !px-2.5 !py-1" disabled={!game.answers.length} onClick={undo} aria-label="Annuler">↶ Annuler</button>
                  <button className="btn !px-2.5 !py-1" disabled={!redo.length} onClick={redoOne} aria-label="Rétablir">↷</button>
                </div>
              )}
            </div>
            {mode === "bots" && frames.length > 1 && <input type="range" min={0} max={frames.length - 1} value={Math.min(fi, frames.length - 1)} onChange={(e) => { setPlaying(false); setFi(+e.target.value); }} className="w-full" aria-label="Position dans la partie" />}

            {row(1)}
            {lineNow && <div className="rounded-lg bg-black/30 px-3 py-1.5 text-center text-xs text-white/80">{lineNow.trim()}</div>}
            {row(0)}

            {finished && view?.result && (
              <div className="panel p-4 text-center">
                <div className="font-display text-2xl" style={{ color: view.result.winner >= 0 ? SIDE_COLOR[view.result.winner] : "#fff" }}>{view.result.winner === -1 ? "Égalité" : `Victoire du ${SIDE_NAME[view.result.winner]}`}</div>
                <div className="text-xs text-white/55">{Math.ceil(view.result.turns / 2)} tours · terrain {EL_FR[view.result.terrain]}</div>
              </div>
            )}

            {pending && (
              <div className="panel space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-xl text-white">{KIND_TITLE[pending.kind]} <span className="text-sm text-white/45">· tour {pending.turn}</span></h2>
                  <label className="flex items-center gap-1.5 text-xs text-white/65"><input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} /> Conseil de l&apos;IA</label>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {pending.labels.map((l, i) => (
                    <button key={i} className={`btn !justify-start !text-left text-sm ${hint && i === pending.def ? "!border-amber-300/60" : ""}`} onClick={() => answer(i)}>
                      {hint && i === pending.def ? "★ " : ""}{l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="panel flex min-h-0 flex-col p-3 lg:max-h-[46rem]">
            <div className="mb-2 flex gap-1 text-xs">
              {(["journal", "inspecteur", "glossaire"] as const).map((t) => <button key={t} className={`rounded-lg px-2.5 py-1 capitalize ${tab === t ? "bg-white/15 text-white" : "text-white/55"}`} onClick={() => setTab(t)}>{t}</button>)}
            </div>
            {tab === "journal" && (
              <div ref={logRef} className="max-h-72 space-y-0.5 overflow-y-auto pr-1 text-xs leading-relaxed lg:max-h-none lg:flex-1">
                {shownFrames.map((f, k) => {
                  const turn = f.line.startsWith("— Tour");
                  const s = sideOfLine(f.line);
                  return <div key={k} className={`${turn ? "mt-2 border-t border-white/10 pt-1 font-display text-sm text-white" : ""} ${!turn && mark && k >= mark ? "text-white" : turn ? "" : "text-white/60"}`} style={!turn && s >= 0 && f.line.startsWith("  ") === false ? { color: SIDE_COLOR[s] } : undefined}>{f.line}</div>;
                })}
              </div>
            )}
            {tab === "inspecteur" && (selCard ? <Inspector c={selCard} raw={rawOf(selCard)} onOpen={() => { const r = rawOf(selCard); if (r) setOpen(r); }} /> : <p className="text-xs text-white/55">Touchez une carte du plateau pour voir ses capacités, ses Tox et ses résistances.</p>)}
            {tab === "glossaire" && (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1 text-xs lg:max-h-none lg:flex-1">
                {ds.keywords.filter((k) => !k.id.startsWith("talent.") && !k.id.startsWith("ability.")).map((k) => <div key={k.id}><b className="text-white">{k.title}</b><div className="text-white/60">{k.description}</div></div>)}
              </div>
            )}
          </aside>
        </div>
      )}
      {open && <CardModal card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
