"use client";
import Link from "next/link";
import { useData } from "./DataProvider";
import { CardFace, ElIcon, ToxIcon, pct } from "./ui";
import { toxFr } from "@/lib/fr";
import type { DeckResult } from "@/lib/sim/search";

export function DeckCards({ slugs, lvls, size = "w-full" }: { slugs: string[]; lvls?: number[]; size?: string }) {
  const { bySlug } = useData();
  return (
    <div className="grid grid-cols-4 gap-2">
      {slugs.map((s, i) => {
        const c = bySlug.get(s);
        if (!c) return <div key={s} />;
        return (
          <Link key={s + i} href={`/cards/${s}`} className={size}>
            <CardFace card={c} lvl={lvls ? lvls[i] : undefined} />
          </Link>
        );
      })}
    </div>
  );
}

export function RateBadge({ r, big = false }: { r: DeckResult; big?: boolean }) {
  const color = r.rate >= 0.6 ? "text-emerald-400" : r.rate >= 0.5 ? "text-amber-300" : "text-red-400";
  return (
    <div className="text-right">
      <div className={`${big ? "text-3xl" : "text-xl"} font-extrabold ${color}`}>{pct(r.rate)}</div>
      <div className="text-xs text-zinc-400">
        IC 95 % : {pct(r.lo)} – {pct(r.hi)}
      </div>
      <div className="text-xs text-zinc-500">{r.n.toLocaleString("fr-FR")} parties · ±{(((r.hi - r.lo) / 2) * 100).toFixed(1).replace(".", ",")} pt</div>
      {r.experimental && <div className="mt-1 text-xs font-semibold text-amber-300" title={(r.validationWarnings ?? []).join("\n")}>Simulation expérimentale · mécaniques incomplètes</div>}
      {!r.experimental && <div className="mt-1 text-xs text-zinc-500">Aucune limitation connue détectée · fidélité non certifiée</div>}
    </div>
  );
}

export function ToxUse({ tox }: { tox?: Record<string, number> }) {
  const { snap } = useData();
  if (!tox || !snap) return null;
  const total = Object.values(tox).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(tox)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map(([id, n]) => {
        const f = snap.tox.find((t) => t.id === id);
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs text-zinc-200" title="Part des achats en boutique dans les parties simulées">
            <ToxIcon icon={f?.icon} size={14} />
            {f ? toxFr(f).name : id} · {Math.round((n / total) * 100)} %
          </span>
        );
      })}
    </div>
  );
}

export function ElementMix({ slugs }: { slugs: string[] }) {
  const { bySlug } = useData();
  const m: Record<string, number> = {};
  for (const s of slugs) {
    const c = bySlug.get(s);
    if (c) m[c.element] = (m[c.element] || 0) + 1;
  }
  return (
    <span className="inline-flex items-center gap-1">
      {Object.entries(m).map(([e, n]) => (
        <span key={e} className="inline-flex items-center gap-0.5 text-xs text-zinc-300">
          <ElIcon el={e} size={14} />×{n}
        </span>
      ))}
    </span>
  );
}
