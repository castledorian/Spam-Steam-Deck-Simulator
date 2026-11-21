"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData } from "./DataProvider";

const LINKS = [
  ["/", "Accueil"],
  ["/cards", "Cartes"],
  ["/collection", "Ma collection"],
  ["/simulator", "Simulateur"],
  ["/meta", "Méta & Arène"],
  ["/tox", "Tox & Boutique"],
  ["/patches", "Patchs"],
] as const;

export function Nav() {
  const path = usePathname();
  const { snap } = useData();
  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#09070f]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-2.5 sm:px-6">
        <Link href="/" className="mr-2 shrink-0 text-lg font-extrabold tracking-tight text-white">
          SPAM<span className="text-amber-400">Lab</span>
        </Link>
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-white/12 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              {label}
            </Link>
          );
        })}
        <span className="ml-auto shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
          {snap ? `Patch ${snap.gameVersion} · ${snap.cards.length} cartes` : "…"}
        </span>
      </div>
    </nav>
  );
}
