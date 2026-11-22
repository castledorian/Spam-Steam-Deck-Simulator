"use client";

import Link from "next/link";
import { CardView } from "@/components/CardView";
import { DeckCards, pct, toxLabel } from "@/components/DeckRow";
import { usePatches } from "@/components/PatchesView";
import { useSpam } from "@/components/SpamProvider";

const GROUPS = [
  {
    title: "Jouer et regarder",
    items: [
      { href: "/plateau", t: "Plateau", d: "Deux bots s'affrontent en direct, ou jouez vous-même le deck A : capacités, boutique de Tox (acheter, relancer, passer, bannir) et fin de tour comme dans le jeu.", tag: "Nouveau" },
      { href: "/analyse", t: "Analyse de partie", d: "Une IA experte teste chaque coup sur des dizaines de fins de partie, comme un moteur d'échecs, et montre le pourcentage de victoire de chaque choix.", tag: "Nouveau" },
    ],
  },
  {
    title: "Comprendre ce qui gagne",
    items: [
      { href: "/meta", t: "Méta & tier list", d: "Les meilleurs decks s'affrontent entre eux : classement avec intervalle de confiance, et classement rejoué par l'IA experte.", tag: "" },
      { href: "/impact", t: "Impact sur la victoire", d: "Ce que rapporte vraiment chaque Tox, carte, talent, capacité et point d'élément, mesuré par des millions de parties.", tag: "Nouveau" },
    ],
  },
  {
    title: "Préparer son deck",
    items: [
      { href: "/collection", t: "Ma collection", d: "Indiquez vos cartes et vos talents débloqués : le simulateur ne propose que ce que vous possédez.", tag: "" },
      { href: "/simulateur", t: "Simulateur de decks", d: "Évalue toutes les combinaisons de 4 cartes, puis simule des milliers de duels avec boutique, Chance et talents.", tag: "" },
    ],
  },
  {
    title: "Références",
    items: [
      { href: "/cartes", t: "Base de données", d: "Toutes les cartes avec illustrations officielles, capacités, résistances, passifs, talents et histoire, et l'impact mesuré de chacune.", tag: "" },
      { href: "/tox", t: "Tox & talents", d: "Catalogue des passifs, prix, probabilités de la boutique selon la Chance, glossaire.", tag: "" },
      { href: "/patchs", t: "Patchs automatiques", d: "Synchronisation avec le SpamDex officiel, différences entre versions, laboratoire relancé à chaque patch.", tag: "" },
    ],
  },
];

const nf = (n: number) => n.toLocaleString("fr-FR");

export default function Home() {
  const { ds, cards, collection, info, loading, lab, byNum } = useSpam();
  const patches = usePatches();
  const showcase = ["aleera_mange_cauchemars", "zafren", "souverain_des_flammes"]
    .map((s) => cards.find((c) => c.slug.startsWith(s.split("_")[0]))).filter(Boolean);
  const hero = (showcase.length ? showcase : cards.slice(0, 3)).slice(0, 3);
  const last = patches?.[0];
  const topMeta = lab?.meta.decks.slice(0, 3) ?? [];
  const topExpert = lab?.expert.decks[0];
  const nameOf = (n: number) => byNum.get(n)?.name ?? `#${n}`;
  const topTox = lab ? [...lab.impact.tox].filter((x) => x.turn === 2).sort((a, b) => b.d - a.d).slice(0, 4) : [];
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <p className="inline-block rounded-full border border-[#ffc756]/40 bg-[#ffc756]/10 px-3 py-1 text-xs text-[#ffc756]">Projet de fan non officiel · données du SpamDex de Ticroco</p>
          <h1 className="font-display text-5xl leading-tight text-white sm:text-6xl">
            Trouvez le <span className="text-[#ffc756]">meilleur deck SPAM</span> avec les cartes que vous possédez.
          </h1>
          <p className="max-w-xl text-lg text-white/70">
            Toutes les données du jeu Steam, mises à jour à chaque patch, un simulateur qui rejoue des millions de duels — boutique de Tox, passifs, talents et résistances inclus — et un plateau pour regarder ou jouer un match vous-même.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/plateau" className="btn btn-primary !px-6 !py-3 text-base">Jouer sur le plateau</Link>
            <Link href="/collection" className="btn !px-6 !py-3 text-base">Ma collection</Link>
            <Link href="/meta" className="btn !px-6 !py-3 text-base">Voir la méta</Link>
          </div>
          <div className="grid max-w-xl grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
            {[
              [loading ? "…" : String(cards.length), "cartes"],
              [ds ? ds.version : "…", "patch actuel"],
              [lab ? `${(lab.games / 1e6).toFixed(1).replace(".", ",")} M` : "…", "parties simulées"],
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

      {lab && topMeta.length > 0 && (
        <section className="panel space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl text-white">La méta du patch {lab.version}</h2>
              <p className="text-sm text-white/60">Calculée sur {nf(lab.games)} parties sur les serveurs de GitHub, mise à jour automatiquement à chaque patch.</p>
            </div>
            <Link href="/meta" className="text-sm text-[#ffc756] underline">Tier list complète →</Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {topMeta.map((d, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-black/25 p-3">
                <div className="flex items-center justify-between text-sm"><span className="font-display text-lg text-[#ffc756]">n° {i + 1}</span><span className="text-white/70">{pct(d.wr)} <span className="text-[11px] text-white/40">({pct(d.lo)} – {pct(d.hi)})</span></span></div>
                <DeckCards cards={d.cards} size={64} />
                <p className="text-xs text-white/55">{d.cards.map(nameOf).join(" · ")}</p>
              </div>
            ))}
          </div>
          {topExpert && <p className="text-xs text-white/55">Rejoué par l&apos;IA experte ({lab.expert.rollouts} fins de partie testées par décision), le deck n° 1 est {topExpert.cards.map(nameOf).join(" · ")} avec {pct(topExpert.wr)} de victoires.</p>}
        </section>
      )}

      {topTox.length > 0 && (
        <section className="panel space-y-3 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl text-white">Les Tox qui font gagner</h2>
              <p className="text-sm text-white/60">Gain de victoire quand le Tox est obtenu gratuitement dès le tour 2, mesuré sur des millions de parties.</p>
            </div>
            <Link href="/impact" className="text-sm text-[#ffc756] underline">Tout l&apos;impact →</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {topTox.map((x, i) => {
              const l = toxLabel(x.el >= 0 ? `${x.fam}:${x.el}:${x.r}` : `${x.fam}:${x.r}`);
              return <div key={i} className="rounded-xl bg-black/25 p-3"><div className="text-sm text-white">{l.name}{l.el ? ` ${l.el}` : ""} <b className="text-[#ffc756]">{l.r}</b></div><div className="font-display text-2xl text-emerald-300">+{(x.d * 100).toFixed(1).replace(".", ",")} pts</div></div>;
            })}
          </div>
        </section>
      )}

      <section className="space-y-6">
        {GROUPS.map((g) => (
          <div key={g.title} className="space-y-3">
            <h2 className="font-display text-xl text-white/80">{g.title}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {g.items.map((f) => (
                <Link key={f.href} href={f.href} className="panel group relative p-5 transition hover:-translate-y-1 hover:border-[#ffc756]/50 hover:bg-white/8">
                  {f.tag && <span className="absolute right-3 top-3 rounded-full bg-[#ffc756] px-2 py-0.5 text-[10px] font-bold text-black">{f.tag}</span>}
                  <h3 className="font-display text-2xl text-white group-hover:text-[#ffc756]">{f.t}</h3>
                  <p className="mt-1 text-sm text-white/65">{f.d}</p>
                </Link>
              ))}
            </div>
          </div>
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
            <li>Le moteur rejoue un duel complet avec les règles du jeu : recharges, éléments, critiques, résistances, Spamtons, boutique de Tox (Chance, rareté, relances), passifs et talents.</li>
            <li>Deux IA jouent : une IA rapide, apprise sur les décisions d&apos;une IA experte qui teste chaque choix comme un moteur d&apos;échecs, pour les millions de parties de la méta.</li>
            <li>Après chaque patch, un laboratoire calcule la méta et l&apos;impact de chaque Tox, carte, talent et capacité ; les résultats sont publiés sur le site sans rien à lancer.</li>
            <li>Chaque taux de victoire est donné avec son intervalle de confiance à 95 %.</li>
          </ol>
          <p className="text-xs text-white/45">Limites : le simulateur n&apos;est pas calibré sur des parties réelles (aucune donnée publique), quelques effets au texte ambigu sont des interprétations (Immunité, Gel), et l&apos;effet Fumée n&apos;est pas simulé.</p>
        </div>
      </section>
    </div>
  );
}
