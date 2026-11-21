"use client";

import { useMemo, useState } from "react";
import { compile, LUCK_ODDS, RAR_NAMES } from "@/sim/compile";
import { useSpam, img } from "./SpamProvider";

const RC = ["#9692A0", "#4FE6FF", "#C06AFF", "#FFC756"];

export function ToxView() {
  const { ds, loading } = useSpam();
  const [q, setQ] = useState("");
  const comp = useMemo(() => (ds ? compile(ds) : null), [ds]);
  const talents = useMemo(() => {
    if (!ds) return [];
    const m = new Map<string, { id: string; name: string; effect: string; cards: { n: number; name: string; slot: number }[] }>();
    for (const c of ds.cards) for (const t of c.talents) {
      const e = m.get(t.id) ?? { id: t.id, name: t.name, effect: t.effect, cards: [] };
      e.cards.push({ n: c.number, name: c.name, slot: t.slot });
      m.set(t.id, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [ds]);
  if (loading || !ds || !comp) return <p className="py-20 text-center text-white/60">Chargement…</p>;
  const groups = [...new Set(comp.tox.map((t) => t.group))];
  const s = q.trim().toLowerCase();
  const tl = talents.filter((t) => !s || (t.name + t.effect + t.cards.map((c) => c.name).join(" ")).toLowerCase().includes(s));
  const skillIcons = new Map<string, string>();
  for (const c of ds.cards) for (const k of c.skills) skillIcons.set(k.name, k.icon);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-4xl text-white">Boutique de Tox, passifs & talents</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/65">
          Les Tox sont des passifs achetés avec des Spamtons : la boutique s&apos;ouvre aux tours pairs avec 3 offres, vous en achetez une, relancez (10 ⬢, +5 à chaque relance) ou passez (+10 ⬢). Chaque carte dispose de 3 emplacements partagés entre capacités et Tox. Chaque tour augmente la Chance, qui rend les offres plus rares (Épique dès la Chance 5, Légendaire dès 11).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-white">Probabilité de rareté selon la Chance</h2>
        <div className="panel overflow-x-auto p-4">
          <div className="flex h-44 min-w-[640px] items-end gap-[3px]">
            {LUCK_ODDS.map((o, l) => (
              <div key={l} className="flex flex-1 flex-col-reverse" title={`Chance ${l} : ${o.map((x, i) => RAR_NAMES[i] + " " + (x * 100).toFixed(1) + "%").join(" · ")}`}>
                {o.map((x, i) => <div key={i} style={{ height: `${x * 100}%`, background: RC[i] }} />)}
                <span className="mt-1 text-center text-[9px] text-white/40">{l % 5 === 0 ? l : ""}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">{RAR_NAMES.map((n, i) => <span key={n} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded" style={{ background: RC[i] }} />{n}</span>)}</div>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="font-display text-2xl text-white">Catalogue des Tox ({comp.tox.length} variantes, valeurs du patch {ds.version})</h2>
        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#ffc756]">{g}</h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {comp.tox.filter((t) => t.group === g).map((t, i) => (
                <div key={t.fam + i} className="panel p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {skillIcons.get(t.name) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(skillIcons.get(t.name)!)} alt="" className="h-8 w-8" loading="lazy" />}
                    <b className="text-white">{t.name}</b>
                  </div>
                  <p className="mt-1 text-white/65">{t.desc}</p>
                  <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
                    {RAR_NAMES.map((n, r) => (
                      <div key={n} className={`rounded-md bg-black/30 py-1 ${t.vals[r] === null ? "opacity-25" : ""}`}>
                        <div style={{ color: RC[r] }}>{n.slice(0, 4)}.</div>
                        <div>{t.vals[r] ?? "—"}</div>
                        <div className="text-white/45">{t.prices[r] !== null ? `${t.prices[r]} ⬢${t.estimated ? "*" : ""}` : ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-white/45">* prix estimés par échelle de rareté (non publiés dans le SpamDex). Les valeurs des passifs présents sur des cartes sont lues directement dans les données officielles ; les autres valeurs proviennent du client de jeu v1.28.1.</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-white">Talents ({talents.length})</h2>
          <input className="input max-w-xs" placeholder="Filtrer les talents ou cartes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {tl.map((t) => (
            <div key={t.id} className="panel p-3 text-sm">
              <b className="text-white">{t.name}</b>
              <p className="text-white/70">{t.effect}</p>
              <p className="mt-1 text-[11px] text-white/45">{t.cards.map((c) => `${c.name} (slot ${c.slot})`).join(" · ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-white">Glossaire</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {ds.keywords.filter((k) => !k.id.startsWith("talent.") && !k.id.startsWith("tox.") && !k.id.startsWith("ability.")).map((k) => (
            <div key={k.id} className="panel p-3 text-sm"><b className="text-[#ffff59]">{k.title}</b><p className="text-white/65">{k.description}</p></div>
          ))}
        </div>
      </section>
    </div>
  );
}
