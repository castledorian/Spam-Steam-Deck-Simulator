"use client";

import Link from "next/link";
import { CardView } from "@/components/CardView";
import { DeckCards, pct, toxLabel } from "@/components/DeckRow";
import { usePatches } from "@/components/PatchesView";
import { useSpam } from "@/components/SpamProvider";
import { NAV } from "@/components/nav";

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
          <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
            Le <span className="text-[#ffc756]">meilleur deck SPAM</span> avec les cartes que vous possédez.
          </h1>
          <p className="max-w-[56ch] text-lg leading-relaxed text-white/75">
            Entrez votre deck : le simulateur le rejoue des milliers de fois contre la méta et vous dit quoi changer, avec la marge d&apos;erreur de chaque gain.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/conseiller" className="btn btn-primary !px-6 !py-3 text-base">Optimiser mon deck</Link>
            <Link href="/plateau" className="btn !px-6 !py-3 text-base">Jouer un match</Link>
          </div>
          <dl className="grid max-w-md grid-cols-3 gap-3 pt-2">
            {[
              [loading ? "…" : String(cards.length), "cartes"],
              [ds ? ds.version : "…", "patch"],
              [lab ? `${(lab.games / 1e6).toFixed(1).replace(".", ",")} M` : "…", "parties simulées"],
            ].map(([v, l]) => (
              <div key={l} className="panel p-3 text-center"><dd className="font-display text-2xl text-white">{v}</dd><dt className="text-xs text-white/65">{l}</dt></div>
            ))}
          </dl>
          <p className="text-xs text-white/60">Projet de fan non officiel · données du SpamDex de Ticroco</p>
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

      <section aria-labelledby="plan" className="space-y-4">
        <h2 id="plan" className="font-display text-2xl text-white">Que voulez-vous faire ?</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {NAV.map((g) => (
            <div key={g.id} className="panel space-y-1 p-4">
              <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#ffc756]">{g.label}</h3>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className="block rounded-lg px-2 py-2 transition hover:bg-white/8">
                  <span className="block font-semibold text-white">{i.label}</span>
                  <span className="block text-sm leading-snug text-white/65">{i.desc}</span>
                </Link>
              ))}
            </div>
          ))}
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
                <div className="flex items-center justify-between text-sm"><span className="font-display text-lg text-[#ffc756]">n° {i + 1}</span><span className="text-white/70">{pct(d.wr)} <span className="text-xs text-white/60">({pct(d.lo)} – {pct(d.hi)})</span></span></div>
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
        <details className="panel space-y-3 p-5 text-sm text-white/70">
          <summary className="cursor-pointer font-display text-2xl text-white">Comment fonctionne la simulation ?</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>Le moteur rejoue un duel complet : recharges, éléments, critiques, résistances, Spamtons, boutique de Tox, passifs et talents.</li>
            <li>Une IA rapide, apprise sur les décisions d&apos;une IA experte, joue les millions de parties de la méta.</li>
            <li>Après chaque patch, un laboratoire recalcule la méta et l&apos;impact de chaque élément ; rien à lancer.</li>
            <li>Chaque taux de victoire est donné avec son intervalle de confiance à 95 %.</li>
          </ol>
          <p className="text-xs text-white/60">Limites : le simulateur n&apos;est pas calibré sur des parties réelles (aucune donnée publique), quelques effets au texte ambigu sont des interprétations.</p>
        </details>
      </section>
    </div>
  );
}
