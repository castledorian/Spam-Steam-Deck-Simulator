"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useData, useOwned } from "@/components/DataProvider";
import { CardTile, EL_FR, ElIcon, Loading, PageTitle, RAR_FR } from "@/components/ui";

const ELS = ["fire", "water", "earth", "nature", "shadow", "light", "ether"];
const RARS = ["Common", "Rare", "Epic", "Legendary", "Divine"];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function CardsPage() {
  const { snap, loading } = useData();
  const { owned } = useOwned();
  const [q, setQ] = useState("");
  const [el, setEl] = useState<string>("");
  const [rar, setRar] = useState<string>("");
  const [sort, setSort] = useState("name");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [limit, setLimit] = useState(48);
  const dq = useDeferredValue(q);
  const sentinel = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    if (!snap) return [];
    const n = norm(dq);
    let l = snap.cards.filter((c) => {
      if (el && c.element !== el) return false;
      if (rar && c.rarity !== rar) return false;
      if (onlyOwned && !(c.slug in owned)) return false;
      if (n) {
        const hay = norm([c.name, ...c.abilities.map((a) => a.name), ...c.talents.map((t) => t.name), ...c.startTox.map((t) => t.name)].join(" "));
        if (!hay.includes(n)) return false;
      }
      return true;
    });
    const ri = (r: string) => RARS.indexOf(r);
    l = [...l].sort((a, b) =>
      sort === "hp" ? b.hp - a.hp : sort === "spamton" ? b.spamton - a.spamton : sort === "rarity" ? ri(b.rarity) - ri(a.rarity) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
    );
    return l;
  }, [snap, dq, el, rar, sort, onlyOwned, owned]);

  useEffect(() => setLimit(48), [dq, el, rar, sort, onlyOwned]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((x) => x + 48), { rootMargin: "600px" });
    io.observe(node);
    return () => io.disconnect();
  }, [list.length]);

  if (loading || !snap) return <Loading />;
  return (
    <div>
      <PageTitle title="Toutes les cartes" sub={`${snap.cards.length} cartes, illustrations officielles. Recherche par nom de carte, capacité, passif ou talent (accents ignorés).`} />
      <div className="card-panel sticky top-[52px] z-20 mb-5 flex flex-wrap items-center gap-2 p-3 backdrop-blur">
        <input className="input min-w-[200px] flex-1" placeholder="Rechercher une carte, une capacité, un talent…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={rar} onChange={(e) => setRar(e.target.value)}>
          <option value="">Toutes raretés</option>
          {RARS.map((r) => (
            <option key={r} value={r}>{RAR_FR[r]}</option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Tri : nom</option>
          <option value="hp">Tri : PV</option>
          <option value="spamton">Tri : Spamtons</option>
          <option value="rarity">Tri : rareté</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Possédées
        </label>
        <div className="flex w-full flex-wrap gap-1.5">
          <button className={`btn ${el === "" ? "btn-primary" : "btn-ghost"} !py-1`} onClick={() => setEl("")}>Tous</button>
          {ELS.map((e) => (
            <button key={e} className={`btn ${el === e ? "btn-primary" : "btn-ghost"} !py-1`} onClick={() => setEl(el === e ? "" : e)}>
              <ElIcon el={e} size={16} /> {EL_FR[e]}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-sm text-zinc-400">{list.length} résultats</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {list.slice(0, limit).map((c) => (
          <CardTile key={c.slug} card={c} owned={Object.keys(owned).length ? c.slug in owned : undefined} />
        ))}
      </div>
      <div ref={sentinel} className="h-10" />
    </div>
  );
}
