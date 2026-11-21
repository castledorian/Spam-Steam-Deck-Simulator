"use client";

import { useState } from "react";
import { TOX_CATALOG, RAR_LETTER, EL_FR } from "@/sim/compile";
import type { DeckStat } from "@/sim/pool";
import { CardChip } from "./CardView";
import { CardModal } from "./CardsBrowser";
import { useSpam } from "./SpamProvider";
import type { RawCard } from "@/sim/compile";

export const toxLabel = (key: string) => {
  const p = key.split(":");
  const fam = p[0];
  const hasEl = p.length === 3;
  const el = hasEl ? +p[1] : undefined;
  const r = +p[p.length - 1];
  const f = TOX_CATALOG.find((x) => x.fam === fam && (el === undefined || x.el === el)) ?? TOX_CATALOG.find((x) => x.fam === fam);
  const v = f?.vals[r];
  return { name: f?.name ?? fam, r: RAR_LETTER[r], v, el: el !== undefined ? EL_FR[el] : undefined };
};

const RAR_COLOR = ["text-zinc-300", "text-cyan-300", "text-fuchsia-300", "text-amber-300"];

export function pct(x: number, d = 1) {
  return (x * 100).toFixed(d).replace(".", ",") + " %";
}

export function DeckCards({ cards, size = 64 }: { cards: number[]; size?: number }) {
  const { byNum } = useSpam();
  const [open, setOpen] = useState<RawCard | null>(null);
  return (
    <>
      <div className="flex gap-1.5">
        {cards.map((n) => {
          const c = byNum.get(n);
          return c ? <CardChip key={n} card={c} size={size} onClick={() => setOpen(c)} /> : null;
        })}
      </div>
      {open && <CardModal card={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Talent actif retenu pour chaque carte du deck. */
export function DeckTalents({ cards, tal }: { cards: number[]; tal?: number[] }) {
  const { byNum } = useSpam();
  if (!tal?.length) return null;
  return (
    <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
      {cards.map((n, i) => {
        const c = byNum.get(n);
        const t = c?.talents.find((x) => x.slot === tal[i]);
        return (
          <div key={n} className="flex min-w-0 gap-1.5 rounded-lg bg-black/25 px-2 py-1" title={t?.effect}>
            <span className="shrink-0 text-white/45">{c?.name ?? n} :</span>
            <span className="truncate text-[#ff9ad5]">{t ? `${t.name} (talent ${t.slot})` : "aucun talent"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ToxPlan({ tox, max = 8 }: { tox?: [string, number][]; max?: number }) {
  if (!tox?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tox.slice(0, max).map(([k, v]) => {
        const l = toxLabel(k);
        return (
          <span key={k} className="rounded-full bg-black/40 px-2 py-0.5 text-[11px]" title={`Acheté dans ${pct(v, 0)} des parties`}>
            <span className={RAR_COLOR[+k.split(":").pop()!]}>{l.name}{l.el ? ` ${l.el}` : ""}</span> <span className="text-white/45">{l.r}{l.v !== null && l.v !== undefined && l.v > 1 ? ` ${l.v}` : ""} · {pct(v, 0)}</span>
          </span>
        );
      })}
    </div>
  );
}

export function WinBar({ d, big = false }: { d: Pick<DeckStat, "wr" | "lo" | "hi" | "n">; big?: boolean }) {
  const color = d.wr >= 0.6 ? "#7bf08a" : d.wr >= 0.5 ? "#ffc756" : "#ff7a7a";
  return (
    <div className="min-w-[150px]">
      <div className={`font-display ${big ? "text-4xl" : "text-2xl"}`} style={{ color }}>{pct(d.wr)}</div>
      <div className="relative mt-1 h-2 rounded-full bg-white/10">
        <div className="absolute top-0 h-2 rounded-full opacity-40" style={{ left: `${d.lo * 100}%`, width: `${Math.max(1, (d.hi - d.lo) * 100)}%`, background: color }} />
        <div className="absolute -top-0.5 h-3 w-1 rounded bg-white" style={{ left: `calc(${d.wr * 100}% - 2px)` }} />
        <div className="absolute -top-1 left-1/2 h-4 w-px bg-white/30" />
      </div>
      <div className="mt-1 text-[11px] text-white/55">IC 95 % : {pct(d.lo)} – {pct(d.hi)} · ±{((d.hi - d.lo) * 50).toFixed(1).replace(".", ",")} pts · {d.n.toLocaleString("fr-FR")} matchs</div>
    </div>
  );
}
