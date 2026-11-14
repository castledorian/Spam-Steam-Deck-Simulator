"use client";
import Link from "next/link";
import { memo, type ReactNode } from "react";
import type { Card, El } from "@/lib/types";

export const EL_COLOR: Record<string, string> = {
  fire: "#FF8A4C",
  water: "#4FB3FF",
  earth: "#D9A066",
  nature: "#6FD36B",
  shadow: "#B98CFF",
  light: "#FFD95A",
  ether: "#FF7AD9",
};
export const EL_FR: Record<string, string> = {
  fire: "Feu",
  water: "Eau",
  earth: "Terre",
  nature: "Nature",
  shadow: "Ombre",
  light: "Lumière",
  ether: "Éther",
};
export const RAR_COLOR: Record<string, string> = {
  Common: "#A8A4B4",
  Rare: "#4FB3FF",
  Epic: "#C77DFF",
  Legendary: "#FFB547",
  Divine: "#FF7AD9",
};
export const RAR_FR: Record<string, string> = { Common: "Commune", Rare: "Rare", Epic: "Épique", Legendary: "Légendaire", Divine: "Divine" };

export function ElIcon({ el, size = 20 }: { el: El | string; size?: number }) {
  if (el === "ether")
    return (
      <span
        className="inline-flex items-center justify-center rounded-full text-[10px] font-bold text-black"
        style={{ width: size, height: size, background: EL_COLOR.ether }}
        title="Éther"
      >
        ✦
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/elements/${el}.webp`} alt={EL_FR[el] ?? el} width={size} height={size} style={{ width: size, height: size }} className="inline-block" />
  );
}

export function Pill({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: (color ?? "#888") + "88", color: color ?? "#ccc", background: (color ?? "#888") + "18" }}
    >
      {children}
    </span>
  );
}

export function SpamtonIcon({ size = 14 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icons/spamton.webp" alt="Spamtons" width={size} height={size} style={{ width: size, height: size }} className="inline-block" />;
}

/** Official illustration inside a lightweight CSS frame (GPU-friendly). */
export const CardFace = memo(function CardFace({ card, className = "", dim = false, lvl }: { card: Card; className?: string; dim?: boolean; lvl?: number }) {
  const ec = EL_COLOR[card.element];
  const rc = RAR_COLOR[card.rarity];
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{
        aspectRatio: "358 / 512",
        border: `2px solid ${rc}`,
        boxShadow: `0 0 0 1px #000, 0 6px 18px -8px ${ec}99`,
        background: "#0d0b14",
        filter: dim ? "grayscale(0.9) brightness(0.55)" : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/cards/${card.slug}.webp`} alt={card.name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-black/70 p-0.5 ring-1" style={{ ["--tw-ring-color" as string]: ec }}>
        <ElIcon el={card.element} size={22} />
      </div>
      {lvl !== undefined && (
        <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5">
          {[1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i <= lvl ? "#FFD95A" : "#555" }} />
          ))}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-2 pb-1.5 pt-6">
        <div className="truncate text-[11px] font-semibold leading-tight text-white drop-shadow sm:text-xs">{card.name}</div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-200">
          <span className="text-red-300">♥ {card.hp}</span>
          <span className="inline-flex items-center gap-0.5">
            <SpamtonIcon size={11} />
            {card.spamton}
          </span>
        </div>
      </div>
    </div>
  );
});

export const CardTile = memo(function CardTile({ card, owned, onClick }: { card: Card; owned?: boolean; onClick?: () => void }) {
  const inner = <CardFace card={card} dim={owned === false} className="transition-transform duration-200 will-change-transform group-hover:-translate-y-1 group-hover:scale-[1.03]" />;
  return onClick ? (
    <button onClick={onClick} className="group block w-full text-left" style={{ contentVisibility: "auto", containIntrinsicSize: "180px 258px" }}>
      {inner}
    </button>
  ) : (
    <Link href={`/cards/${card.slug}`} className="group block" style={{ contentVisibility: "auto", containIntrinsicSize: "180px 258px" }}>
      {inner}
    </Link>
  );
});

export function Section({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {sub && <p className="text-sm text-zinc-400">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <h1 className="bg-gradient-to-r from-amber-300 via-orange-400 to-fuchsia-400 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">{title}</h1>
      {sub && <p className="mt-2 max-w-3xl text-zinc-400">{sub}</p>}
    </header>
  );
}

export function Loading({ what = "données" }: { what?: string }) {
  return <div className="py-20 text-center text-zinc-400">Chargement des {what}…</div>;
}

export function Bar({ pct, color = "#FFB547" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full origin-left rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export const pct = (x: number, d = 1) => (x * 100).toFixed(d).replace(".", ",") + " %";
