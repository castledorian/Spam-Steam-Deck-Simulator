"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { RawCard } from "@/sim/compile";
import { CardView } from "./CardView";
import { img, useSpam } from "./SpamProvider";

const RAR_ORDER: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4, divine: 5 };

export function CardModal({ card, onClose }: { card: RawCard; onClose: () => void }) {
  const { ds, owned, setOwned, collection, setLevel } = useSpam();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);
  const el = ds?.elements.find((e) => e.id === card.element);
  const rar = ds?.rarities.find((r) => r.id === card.rarity);
  const has = owned(card.number);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-8" onClick={onClose}>
      <button type="button" aria-label="Fermer" onClick={onClose} className="fixed right-3 top-3 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-2xl text-white ring-1 ring-white/20 sm:hidden">×</button>
      <div className="panel grid w-full max-w-5xl gap-6 bg-[#120a22] p-4 sm:grid-cols-[minmax(0,340px)_1fr] sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <CardView card={card} big eager />
          <p className="mt-2 text-[11px] text-white/50">
            Illustration : {card.artwork.artist ? (
              card.artwork.artist.link ? <a className="underline hover:text-white" href={card.artwork.artist.link} target="_blank" rel="noreferrer">{card.artwork.artist.name}</a> : card.artwork.artist.name
            ) : "—"}
          </p>
        </div>
        <div className="space-y-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl text-white">{card.name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-white/70">
                {el && <span className="inline-flex items-center gap-1.5">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(el.icon)} alt="" className="h-5 w-5" />{el.name}</span>}
                <span style={{ color: rar?.textColor ?? "#fff" }}>{rar?.name}</span>
                <span>· n°{card.number}</span>
                {card.lore?.species && <span>· {card.lore.species}</span>}
              </p>
            </div>
            <button className="btn hidden !px-3 sm:inline-flex" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={`btn ${has ? "" : "btn-primary"}`} onClick={() => setOwned(card.number, !has)}>
              {has ? "✓ Dans ma collection (retirer)" : "+ Ajouter à ma collection"}
            </button>
            {has && (
              <label className="flex items-center gap-2 text-white/70">
                Talents débloqués
                <select className="input !w-auto" value={collection[card.number] ?? 0} onChange={(e) => setLevel(card.number, +e.target.value)}>
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}/3</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat l="PV" v={card.hp} />
            <Stat l="Spamtons / tour" v={card.spamton} />
            <Stat l="Capacités" v={card.abilities.length} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-white">Résistances</h3>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {ds?.elements.filter((e) => e.id !== "divine").map((e) => (
                <div key={e.id} className="rounded-lg bg-black/30 px-2 py-1 text-center text-xs">
                  <div style={{ color: e.color }}>{e.name}</div>
                  <div className={card.resistances[e.id] < 0 ? "text-red-300" : "text-white"}>{card.resistances[e.id] ?? 0} %</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-white">Capacités</h3>
            <ul className="space-y-1.5">
              {card.abilities.map((a) => (
                <li key={a.id} className="rounded-lg bg-black/30 p-2">
                  <div className="flex items-center justify-between"><b>{a.name}</b><span className="text-xs text-white/60">recharge {a.cooldown} · précision {a.precision}% · crit {a.critChance}% ×{a.critMultiplier}{a.cooldownResetChance ? ` · écho ${a.cooldownResetChance}%` : ""}{a.uses ? ` · ${a.uses} usage(s)` : ""}</span></div>
                  <p className="whitespace-pre-line text-white/75">{a.effect}</p>
                </li>
              ))}
            </ul>
          </div>
          {card.skills.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold text-white">Passifs (Tox) de départ</h3>
              <ul className="space-y-1.5">
                {card.skills.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded-lg bg-black/30 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(s.icon)} alt="" className="h-8 w-8 shrink-0" loading="lazy" />
                    <div><b>{s.name}</b> <span className="text-xs text-white/50">({s.rarity})</span><p className="whitespace-pre-line text-white/75">{s.effect}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-1 font-semibold text-white">Talents (cachés, débloqués par doublons)</h3>
            <ul className="space-y-1.5">
              {card.talents.map((t) => (
                <li key={t.slot} className="rounded-lg bg-black/30 p-2"><b>{t.slot}. {t.name}</b><p className="text-white/75">{t.effect}</p></li>
              ))}
            </ul>
          </div>
          {card.lore?.text && (
            <div>
              <h3 className="mb-1 font-semibold text-white">Histoire</h3>
              <p className="text-white/60">{card.lore.text}</p>
              <p className="mt-1 text-xs text-white/40">{[card.lore.region, card.lore.era].filter(Boolean).join(" · ")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Stat = ({ l, v }: { l: string; v: number }) => (
  <div className="rounded-xl bg-black/30 p-2"><div className="font-display text-2xl text-[#ffc756]">{v}</div><div className="text-[11px] text-white/55">{l}</div></div>
);

export function CardsBrowser({ mode }: { mode: "browse" | "collection" }) {
  const { cards, ds, loading, error, owned, setOwned, setMany, collection, setLevel, clearCollection, talentMode, setTalentMode } = useSpam();
  const [q, setQ] = useState("");
  const [els, setEls] = useState<string[]>([]);
  const [rars, setRars] = useState<string[]>([]);
  const [only, setOnly] = useState<"all" | "owned" | "missing">("all");
  const [sort, setSort] = useState<"number" | "name" | "hp" | "rarity" | "spamton">("number");
  const [open, setOpen] = useState<RawCard | null>(null);
  const dq = useDeferredValue(q);

  const list = useMemo(() => {
    const s = dq.trim().toLowerCase();
    let r = cards.filter((c) => {
      if (els.length && !els.includes(c.element)) return false;
      if (rars.length && !rars.includes(c.rarity)) return false;
      if (only === "owned" && !(c.number in collection)) return false;
      if (only === "missing" && c.number in collection) return false;
      if (s) {
        const hay = (c.name + " " + c.abilities.map((a) => a.name + " " + a.effect).join(" ") + " " + c.talents.map((t) => t.name).join(" ") + " " + c.skills.map((x) => x.name).join(" ") + " " + (c.lore?.species ?? "")).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    r = r.slice().sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "hp" ? b.hp - a.hp : sort === "spamton" ? b.spamton - a.spamton : sort === "rarity" ? RAR_ORDER[b.rarity] - RAR_ORDER[a.rarity] || a.number - b.number : a.number - b.number,
    );
    return r;
  }, [cards, dq, els, rars, only, sort, collection]);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (loading) return <p className="py-20 text-center text-white/60">Chargement des cartes officielles…</p>;
  if (error || !ds) return <p className="py-20 text-center text-red-300">Impossible de charger les données : {error}</p>;

  const ownedCount = Object.keys(collection).length;
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ game: "SPAM", collection }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "spam-collection.json";
    a.click();
  };
  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as { collection?: Record<string, number> };
      const nums = Object.keys(j.collection ?? {}).map(Number).filter((n) => cards.some((c) => c.number === n));
      setMany(nums, true);
      nums.forEach((n) => setLevel(n, Math.max(0, Math.min(3, Number(j.collection?.[n]) || 0))));
    } catch { alert("Fichier invalide"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white sm:text-4xl">{mode === "browse" ? "Toutes les cartes" : "Ma collection"}</h1>
          <p className="text-sm text-white/60">
            {mode === "browse"
              ? `${cards.length} cartes officielles · patch ${ds.version}. Cliquez une carte pour tous les détails.`
              : `Cochez les cartes que vous possédez : le simulateur ne composera des decks qu'avec elles. ${ownedCount}/${cards.length} possédées.`}
          </p>
        </div>
        {mode === "collection" && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={() => setMany(list.map((c) => c.number), true)}>Tout cocher (filtre)</button>
            <button className="btn" onClick={() => setMany(cards.filter((c) => c.rarity === "common").map((c) => c.number), true)}>+ Toutes les communes</button>
            <button className="btn" onClick={() => confirm("Vider la collection ?") && clearCollection()}>Vider</button>
            <button className="btn" onClick={exportJson}>Exporter</button>
            <label className="btn">Importer<input type="file" accept="application/json" hidden onChange={(e) => void importJson(e.target.files?.[0])} /></label>
          </div>
        )}
      </div>

      {mode === "collection" && (
        <div className="panel flex flex-wrap items-center gap-3 p-3 text-sm">
          <span className="text-white/70">Talents pris en compte par le simulateur :</span>
          <button className="chip" data-on={talentMode === "all"} onClick={() => setTalentMode("all")}>Tous débloqués (mode ranked / draft)</button>
          <button className="chip" data-on={talentMode === "collection"} onClick={() => setTalentMode("collection")}>Selon ma collection (0 à 3 par carte)</button>
        </div>
      )}

      <div className="panel space-y-3 p-3">
        <div className="flex flex-wrap gap-3">
          <input className="input sm:max-w-xs" type="search" placeholder="Rechercher (nom, capacité, passif, espèce…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="number">Tri : numéro</option><option value="name">Tri : nom</option><option value="hp">Tri : PV</option><option value="rarity">Tri : rareté</option><option value="spamton">Tri : Spamtons</option>
          </select>
          <select className="input !w-auto" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="all">Toutes</option><option value="owned">Possédées</option><option value="missing">Manquantes</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ds.elements.map((e) => (
            <button key={e.id} className="chip" data-on={els.includes(e.id)} onClick={() => toggle(els, e.id, setEls)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(e.icon)} alt="" className="h-4 w-4" />{e.name}
            </button>
          ))}
          <span className="mx-1 w-px bg-white/15" />
          {ds.rarities.map((r) => (
            <button key={r.id} className="chip" data-on={rars.includes(r.id)} style={{ color: r.textColor ?? "#fff" }} onClick={() => toggle(rars, r.id, setRars)}>{r.name}</button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/50">{list.length} carte(s) affichée(s)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {list.map((c, i) => {
          const has = c.number in collection;
          return (
            <div key={c.id} className="card-cell group">
              <button
                type="button"
                className={`block w-full rounded-[1.6rem] text-left transition-transform duration-150 hover:-translate-y-1 ${mode === "collection" && has ? "owned-ring" : ""} ${mode === "collection" && !has ? "opacity-55 grayscale-[0.6] hover:opacity-90 hover:grayscale-0" : ""}`}
                onClick={() => (mode === "collection" ? setOwned(c.number, !has) : setOpen(c))}
                aria-label={c.name}
              >
                <CardView card={c} eager={i < 6} />
              </button>
              <div className="mt-1.5 flex items-center justify-between gap-1 px-1 text-xs">
                {mode === "collection" ? (
                  <>
                    <button className="text-white/60 underline hover:text-white" onClick={() => setOpen(c)}>détails</button>
                    {has ? (
                      <label className="flex items-center gap-1 text-white/70">
                        talents
                        <select className="rounded bg-black/50 px-1 py-0.5" value={collection[c.number] ?? 0} onChange={(e) => setLevel(c.number, +e.target.value)} onClick={(e) => e.stopPropagation()}>
                          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    ) : <span className="text-white/35">non possédée</span>}
                  </>
                ) : (
                  <>
                    <span className="text-white/50">n°{c.number}</span>
                    <button className={`rounded-full px-2 py-0.5 ${owned(c.number) ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-white/70 hover:bg-white/20"}`} onClick={() => setOwned(c.number, !owned(c.number))}>
                      {owned(c.number) ? "✓ possédée" : "+ collection"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open && <CardModal card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
