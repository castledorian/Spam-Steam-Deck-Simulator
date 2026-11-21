"use client";

import Link from "next/link";
import { CardView } from "@/components/CardView";
import { usePatches } from "@/components/PatchesView";
import { useSpam } from "@/components/SpamProvider";

const FEATURES = [
  { href: "/cartes", t: "Base de données complète", d: "Toutes les cartes avec les illustrations officielles, capacités, résistances, passifs, talents et histoire." },
  { href: "/collection", t: "Ma collection", d: "Indiquez vos cartes et vos talents débloqués : le simulateur ne propose que ce que vous possédez." },
  { href: "/simulateur", t: "Simulateur de decks", d: "Évalue toutes les combinaisons de 4 cartes, puis simule des milliers de duels avec boutique de Tox, Chance et talents." },
  { href: "/meta", t: "Méta & tier list", d: "Les meilleurs decks du jeu s'affrontent entre eux : classement avec intervalle de confiance." },
  { href: "/tox", t: "Tox & talents", d: "Catalogue des passifs, prix, probabilités de la boutique selon la Chance, glossaire." },
  { href: "/patchs", t: "Patchs automatiques", d: "Synchronisation avec le SpamDex officiel et différences calculées entre chaque version." },
];

export default function Home() {
  const { ds, cards, collection, info, loading } = useSpam();
  const patches = usePatches();
  const showcase = ["aleera_mange_cauchemars", "zafren", "souverain_des_flammes"]
    .map((s) => cards.find((c) => c.slug.startsWith(s.split("_")[0]))).filter(Boolean);
  const hero = (showcase.length ? showcase : cards.slice(0, 3)).slice(0, 3);
  const last = patches?.[0];
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <p className="inline-block rounded-full border border-[#ffc756]/40 bg-[#ffc756]/10 px-3 py-1 text-xs text-[#ffc756]">Projet de fan non officiel · données du SpamDex de Ticroco</p>
          <h1 className="font-display text-5xl leading-tight text-white sm:text-6xl">
            Trouvez le <span className="text-[#ffc756]">meilleur deck SPAM</span> avec les cartes que vous possédez.
          </h1>
          <p className="max-w-xl text-lg text-white/70">
            Toutes les données du jeu Steam, mises à jour à chaque patch, et un simulateur qui rejoue des milliers de duels — boutique de Tox, passifs, talents et résistances inclus — pour vous donner des taux de victoire chiffrés.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/collection" className="btn btn-primary !px-6 !py-3 text-base">Renseigner ma collection</Link>
            <Link href="/simulateur" className="btn !px-6 !py-3 text-base">Lancer le simulateur</Link>
          </div>
          <div className="grid max-w-xl grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
            {[
              [loading ? "…" : String(cards.length), "cartes"],
              [ds ? ds.version : "…", "patch actuel"],
              ["7", "éléments"],
              [String(Object.keys(collection).length), "cartes possédées"],
            ].map(([v, l]) => (
              <div key={l} className="panel p-3 text-center"><div className="font-display text-2xl text-white">{v}</div><div className="text-[11px] text-white/50">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="relative mx-auto flex w-full max-w-md justify-center">
          {hero.map((c, i) => c && (
            <div key={c.number} className="absolute w-[46%] transition-transform duration-300 hover:z-10 hover:scale-105" style={{ left: `${i * 27}%`, top: `${i === 1 ? 0 : 6}%`, transform: `rotate(${(i - 1) * 7}deg)`, zIndex: i === 1 ? 3 : 1 }}>
              <CardView card={c} big eager />
            </div>
          ))}
          <div className="aspect-[4/3.6] w-full" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="panel group p-5 transition hover:-translate-y-1 hover:border-[#ffc756]/50 hover:bg-white/8">
            <h2 className="font-display text-2xl text-white group-hover:text-[#ffc756]">{f.t}</h2>
            <p className="mt-1 text-sm text-white/65">{f.d}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel space-y-3 p-5">
          <h2 className="font-display text-2xl text-white">Dernier patch</h2>
          {last ? (
            <>
              <p className="text-sm text-white/60">Patch {last.version} · {new Date(last.generatedAt).toLocaleDateString("fr-FR")} · {last.changes.length} modification(s)</p>
              <ul className="space-y-1 text-sm text-white/75">
                {last.changes.slice(0, 6).map((c, i) => <li key={i}><b className="text-white">{c.name}</b> — {c.label}{c.from !== undefined && <> : {c.from}</>}{c.to !== undefined && <> → {c.to}</>}</li>)}
              </ul>
              <Link href="/patchs" className="text-sm text-[#ffc756] underline">Tout l&apos;historique →</Link>
            </>
          ) : <p className="text-sm text-white/60">Version {ds?.version ?? "…"}{info?.source === "direct" ? " (lue en direct sur le SpamDex)" : ""}. L&apos;historique se met à jour automatiquement.</p>}
        </div>
        <div className="panel space-y-3 p-5">
          <h2 className="font-display text-2xl text-white">Comment fonctionne la simulation ?</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-white/70">
            <li>Chaque combinaison possible de 4 cartes de votre collection est évaluée par un modèle statique (dégâts, éléments, PV, soins, Spamtons).</li>
            <li>Les meilleurs candidats passent des tournois à élimination successive contre les meilleurs decks de la méta, avec des milliers de duels simulés.</li>
            <li>Les duels appliquent les règles : recharges, coûts, éléments, critiques, résistances, boutique de Tox (Chance, rareté, relances), passifs et talents.</li>
            <li>Chaque taux de victoire est donné avec son intervalle de confiance à 95 % : plus vous augmentez la précision, plus il se resserre.</li>
          </ol>
        </div>
      </section>
    </div>
  );
}
