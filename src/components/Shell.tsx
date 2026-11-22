"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSpam } from "./SpamProvider";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/cartes", label: "Cartes" },
  { href: "/collection", label: "Ma collection" },
  { href: "/conseiller", label: "Conseiller" },
  { href: "/simulateur", label: "Simulateur" },
  { href: "/meta", label: "Méta & Tier list" },
  { href: "/impact", label: "Impact" },
  { href: "/plateau", label: "Plateau" },
  { href: "/analyse", label: "Analyse de partie" },
  { href: "/tox", label: "Tox & Talents" },
  { href: "/patchs", label: "Patchs" },
];

export function Nav() {
  const path = usePathname();
  const { info, ds, refresh, syncing, collection } = useSpam();
  const n = Object.keys(collection).length;
  // téléphone : fait défiler la barre jusqu'au lien de la page affichée
  useEffect(() => { document.querySelector('nav a[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" }); }, [path]);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07040f]/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 sm:px-6 sm:py-3 lg:flex-nowrap">
        <Link href="/" className="font-display text-2xl tracking-wide text-[#ffc756]">
          SPAM<span className="text-white">Lab</span>
        </Link>
        {/* sur téléphone : une seule ligne de liens qui défile horizontalement, sous le logo */}
        <nav className="no-scrollbar order-3 -mx-3 flex w-[calc(100%+1.5rem)] flex-nowrap items-center gap-1 overflow-x-auto px-3 pb-1 text-sm lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 transition lg:py-1.5 ${on ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"}`}>
                {l.label}
                {l.href === "/collection" && n > 0 && <span className="ml-1.5 rounded-full bg-emerald-400/20 px-1.5 text-[11px] text-emerald-300">{n}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs text-white/60 lg:ml-0">
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
