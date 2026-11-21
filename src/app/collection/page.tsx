"use client";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useData, useOwned } from "@/components/DataProvider";
import { CardFace, EL_FR, ElIcon, Loading, PageTitle } from "@/components/ui";

const ELS = ["fire", "water", "earth", "nature", "shadow", "light", "ether"];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function CollectionPage() {
  const { snap, loading } = useData();
  const { owned, set, setMany } = useOwned();
  const [q, setQ] = useState("");
  const [el, setEl] = useState("");
  const [only, setOnly] = useState<"all" | "owned" | "missing">("all");
  const [limit, setLimit] = useState(60);
  const [io, setIo] = useState("");
  const dq = useDeferredValue(q);
  const sentinel = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    if (!snap) return [];
    const n = norm(dq);
    return snap.cards.filter((c) => (!el || c.element === el) && (only === "all" || (only === "owned") === (c.slug in owned)) && (!n || norm(c.name + " " + (c.fr?.name ?? "")).includes(n)));
  }, [snap, dq, el, only, owned]);

  useEffect(() => setLimit(60), [dq, el, only]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const o = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((x) => x + 60), { rootMargin: "600px" });
    o.observe(node);
    return () => o.disconnect();
  }, [list.length]);

  if (loading || !snap) return <Loading />;
  const ownedCount = Object.keys(owned).filter((s) => snap.cards.some((c) => c.slug === s)).length;
  const allSlugs = snap.cards.map((c) => c.slug);

  return (
    <div>
      <PageTitle title="Ma collection" sub="Cochez les cartes que vous possédez et indiquez combien de talents vous avez débloqués (doublons). Le simulateur n'utilisera que ces cartes et ces talents. Tout est enregistré dans votre navigateur." />
      <div className="card-panel mb-5 flex flex-wrap items-center gap-2 p-3">
        <div className="mr-2 text-sm text-zinc-300">
          <b className="text-xl text-white">{ownedCount}</b> / {snap.cards.length} cartes
        </div>
        <input className="input min-w-[180px] flex-1" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={only} onChange={(e) => setOnly(e.target.value as "all")}>
          <option value="all">Toutes</option>
          <option value="owned">Possédées</option>
          <option value="missing">Manquantes</option>
        </select>
        <button className="btn btn-ghost" onClick={() => setMany(list.map((c) => c.slug), 0)}>Cocher la sélection</button>
        <button className="btn btn-ghost" onClick={() => setMany(list.map((c) => c.slug), null)}>Décocher la sélection</button>
        <button className="btn btn-ghost" onClick={() => setMany(snap.cards.filter((c) => c.rarity === "Common").map((c) => c.slug), 0)}>+ Toutes les communes</button>
        <button className="btn btn-ghost" onClick={() => setMany(allSlugs, 3)}>Tout (talents max)</button>
        <button className="btn btn-ghost" onClick={() => setMany(allSlugs, null)}>Vider</button>
        <div className="flex w-full flex-wrap gap-1.5">
          <button className={`btn ${el === "" ? "btn-primary" : "btn-ghost"} !py-1`} onClick={() => setEl("")}>Tous</button>
          {ELS.map((e) => (
            <button key={e} className={`btn ${el === e ? "btn-primary" : "btn-ghost"} !py-1`} onClick={() => setEl(el === e ? "" : e)}>
              <ElIcon el={e} size={16} /> {EL_FR[e]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {list.slice(0, limit).map((c) => {
          const lvl = owned[c.slug];
          const has = lvl !== undefined;
          return (
            <div key={c.slug} style={{ contentVisibility: "auto", containIntrinsicSize: "180px 290px" }}>
              <button onClick={() => set(c.slug, has ? null : 0)} className="group block w-full text-left" aria-pressed={has}>
                <div className="relative">
                  <CardFace card={c} dim={!has} lvl={has ? lvl : undefined} className="transition-transform duration-200 will-change-transform group-hover:-translate-y-1" />
                  {has && <span className="absolute bottom-10 right-2 rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-black">✓</span>}
                </div>
              </button>
              {has && (
                <div className="mt-1 flex items-center justify-center gap-1" role="group" aria-label="Talents débloqués">
                  {[0, 1, 2, 3].map((n) => (
                    <button key={n} onClick={() => set(c.slug, n)} className={`h-6 w-7 rounded text-xs font-bold ${lvl === n ? "bg-amber-400 text-black" : "bg-white/10 text-zinc-300 hover:bg-white/20"}`} title={`${n} talent(s) débloqué(s)`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div ref={sentinel} className="h-10" />

      <div className="card-panel mt-8 p-4">
        <div className="mb-2 font-semibold text-white">Sauvegarde / transfert</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => setIo(JSON.stringify(owned))}>Exporter</button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              try {
                const o = JSON.parse(io) as Record<string, number>;
                const valid = Object.entries(o).filter(([s, v]) => allSlugs.includes(s) && [0, 1, 2, 3].includes(v));
                setMany(allSlugs, null);
                for (const [s, v] of valid) set(s, v);
                setIo(`${valid.length} cartes importées`);
              } catch {
                setIo("JSON invalide");
              }
            }}
          >
            Importer
          </button>
          <Link href="/simulator" className="btn btn-primary ml-auto">Lancer le simulateur →</Link>
        </div>
        <textarea className="input mt-2 h-20 w-full font-mono text-xs" value={io} onChange={(e) => setIo(e.target.value)} placeholder='{"fire-spirit":0,"ephial":3}' />
      </div>
    </div>
  );
}
