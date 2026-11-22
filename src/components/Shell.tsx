"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV, groupOf, type NavItem } from "./nav";
import { useSpam } from "./SpamProvider";

function Chevron({ open }: { open: boolean }) {
  return <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Nav() {
  const path = usePathname();
  const { info, ds, refresh, syncing, collection } = useSpam();
  const n = Object.keys(collection).length;
  const [open, setOpen] = useState<string | null>(null); // groupe ouvert (PC) ou "menu" (téléphone)
  const root = useRef<HTMLElement>(null);
  const cur = groupOf(path)?.id;
  // fermeture : changement de page, touche Échap, clic en dehors
  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const click = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, []);
  const itemLink = (i: NavItem, compact = false) => {
    const on = path === i.href || path.startsWith(i.href + "/");
    return (
      <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition ${on ? "bg-white/12" : "hover:bg-white/8"}`}>
        <span className="min-w-0">
          <span className={`block text-sm font-semibold ${on ? "text-[#ffc756]" : "text-white"}`}>{i.label}</span>
          {!compact && <span className="block text-xs leading-snug text-white/65">{i.desc}</span>}
        </span>
        {i.href === "/collection" && n > 0 && <span className="shrink-0 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs text-emerald-300">{n}</span>}
      </Link>
    );
  };
  return (
    <header ref={root} className="sticky top-0 z-40 border-b border-white/10 bg-[#07040f]/90 backdrop-blur">
      <a href="#contenu" className="sr-only rounded-lg bg-[#ffc756] px-3 py-2 text-sm font-semibold text-black focus:not-sr-only focus:absolute focus:left-3 focus:top-2">Aller au contenu</a>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-3 sm:px-6">
        <Link href="/" aria-label="SPAMLab, accueil" className="font-display text-2xl tracking-wide text-[#ffc756]">
          SPAM<span className="text-white">Lab</span>
        </Link>

        {/* PC : 4 rubriques, chacune ouvre la liste de ses pages avec une phrase d'explication */}
        <nav aria-label="Navigation principale" className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV.map((g) => {
            const isOpen = open === g.id;
            return (
              <div key={g.id} className="relative">
                <button type="button" aria-expanded={isOpen} aria-controls={`menu-${g.id}`} onClick={() => setOpen(isOpen ? null : g.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${cur === g.id ? "text-white" : "text-white/75 hover:text-white"} ${isOpen ? "bg-white/12" : "hover:bg-white/8"}`}>
                  {g.label}<Chevron open={isOpen} />
                  {cur === g.id && <span className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded bg-[#ffc756]" />}
                </button>
                {isOpen && (
                  <div id={`menu-${g.id}`} className="absolute left-0 top-full z-50 mt-2 w-80 space-y-0.5 rounded-2xl border border-white/12 bg-[#120b22] p-2 shadow-2xl shadow-black/60">
                    {g.items.map((i) => itemLink(i))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span title={info?.message ?? ""} className="hidden items-center gap-1.5 text-xs text-white/70 sm:flex">
            <span className={`h-2 w-2 rounded-full ${info?.ok ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden />
            Patch {ds?.version ?? "…"}
          </span>
          <button type="button" className="btn !px-3 !py-1.5 text-xs" onClick={() => void refresh()} disabled={syncing} aria-label="Vérifier les mises à jour des données">
            {syncing ? "Vérification…" : "↻ Mettre à jour"}
          </button>
          {/* téléphone : bouton « Menu » avec son libellé (une icône seule est souvent ignorée) */}
          <button type="button" aria-expanded={open === "menu"} aria-controls="menu-mobile" onClick={() => setOpen(open === "menu" ? null : "menu")} className="btn !px-3 !py-1.5 text-sm lg:hidden">
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Menu
          </button>
        </div>
      </div>

      {open === "menu" && (
        <nav id="menu-mobile" aria-label="Navigation principale" className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-white/10 bg-[#0d0719] px-3 pb-4 pt-2 lg:hidden">
          {NAV.map((g) => (
            <div key={g.id} className="py-2">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#ffc756]">{g.label}</p>
              {g.items.map((i) => itemLink(i))}
            </div>
          ))}
          <p className="px-3 pt-1 text-xs text-white/60 sm:hidden">Patch {ds?.version ?? "…"} · {info?.ok ? "données à jour" : "données en cours de vérification"}</p>
        </nav>
      )}
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
