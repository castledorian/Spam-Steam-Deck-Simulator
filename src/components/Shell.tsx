"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSpam } from "./SpamProvider";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/cartes", label: "Cartes" },
  { href: "/collection", label: "Ma collection" },
  { href: "/simulateur", label: "Simulateur" },
  { href: "/meta", label: "Méta & Tier list" },
  { href: "/tox", label: "Tox & Talents" },
  { href: "/patchs", label: "Patchs" },
];

export function Nav() {
  const path = usePathname();
  const { info, ds, refresh, syncing, collection } = useSpam();
  const n = Object.keys(collection).length;
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07040f]/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-2xl tracking-wide text-[#ffc756]">
          SPAM<span className="text-white">Lab</span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-1.5 transition ${on ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"}`}>
                {l.label}
                {l.href === "/collection" && n > 0 && <span className="ml-1.5 rounded-full bg-emerald-400/20 px-1.5 text-[11px] text-emerald-300">{n}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span title={info?.message ?? ""} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${info?.ok ? "bg-emerald-400" : "bg-amber-400"}`} />
            Patch {ds?.version ?? "…"}
          </span>
          <button className="btn !px-2.5 !py-1 text-xs" onClick={() => void refresh()} disabled={syncing}>
            {syncing ? "Vérification…" : "↻ Vérifier"}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/30 px-4 py-8 text-xs leading-relaxed text-white/55">
      <div className="mx-auto max-w-7xl space-y-2">
        <p>
          <strong className="text-white/80">SpamLab est un projet de fan non officiel, sans lien avec Ticroco.</strong> Aucun usage commercial : gratuit, sans publicité ni suivi. Unofficial fan project, not affiliated with Ticroco.
        </p>
        <p>
          Données de cartes, icônes et illustrations issues du SpamDex officiel (
          <a className="underline hover:text-white" href="https://spamgame.com/conditions-donnees-cartes" target="_blank" rel="noreferrer">
            conditions d&apos;utilisation des données de cartes
          </a>
          ). Les illustrations ne sont que redimensionnées/recadrées ; l&apos;artiste de chaque illustration est crédité sur la fiche de la carte. Données fournies « en l&apos;état ».
        </p>
        <p>
          Les simulations sont des <em>modèles</em> des règles publiées du jeu (cooldowns, éléments, Spamtons, boutique de Tox, talents) : les taux de victoire sont des estimations statistiques avec intervalle de confiance à 95 %, pas des garanties.
        </p>
      </div>
    </footer>
  );
}
