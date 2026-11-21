"use client";
import Link from "next/link";
import { useData } from "@/components/DataProvider";
import { CardFace, Loading, Section } from "@/components/ui";
import { UpdateStatus } from "@/components/UpdateStatus";
import { cardName, patchLabelFr } from "@/lib/fr";

export default function Home() {
  const { snap, loading, bySlug } = useData();
  const enToSlug = new Map(snap?.cards.map((c) => [c.name.toLowerCase(), c.slug]) ?? []);
  if (loading || !snap) return <Loading />;
  const latest = snap.patches[0];
  const showcase = ["aeltheria-primordial-mother", "ephial", "ignea", "zayd", "sovereign-of-flames", "leviathan-of-the-skies"]
    .map((s) => snap.cards.find((c) => c.slug === s))
    .filter(Boolean);
  const counts = (r: string) => snap.cards.filter((c) => c.rarity === r).length;
  return (
    <div>
      <div className="card-panel relative mb-8 overflow-hidden p-6 sm:p-10">
        <div className="relative z-10 max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-amber-400">Le compagnon de SPAM sur Steam</p>
          <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl">Toutes les données. Des decks simulés. Des chiffres, pas des impressions.</h1>
          <p className="mt-4 text-zinc-300">
            {snap.cards.length} cartes aux illustrations officielles, {snap.tox.length} familles de Tox, {snap.talents.length} talents, patchs en direct depuis Steam, et un simulateur Monte-Carlo qui joue
            des centaines de milliers de duels — boutique Tox, passifs et talents compris — à partir des cartes que <em>vous</em> possédez.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/collection" className="btn btn-primary">Renseigner ma collection</Link>
            <Link href="/simulator" className="btn btn-ghost">Trouver mon meilleur deck</Link>
            <Link href="/meta" className="btn btn-ghost">Méta &amp; Arène</Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-6 top-4 hidden w-[46%] justify-end gap-3 lg:flex" aria-hidden>
          {showcase.slice(0, 3).map((c, i) => (
            <div key={c!.slug} className="w-36 shrink-0" style={{ transform: `translateY(${i % 2 ? 24 : -4}px) rotate(${(i - 1) * 4}deg)` }}>
              <CardFace card={c!} />
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Cartes", snap.cards.length],
          ["Familles de Tox", snap.tox.length],
          ["Talents", snap.talents.length],
          ["Patch actuel", snap.gameVersion],
        ].map(([k, v]) => (
          <div key={k as string} className="card-panel p-4">
            <div className="text-2xl font-extrabold text-white">{v}</div>
            <div className="text-sm text-zinc-400">{k}</div>
          </div>
        ))}
      </div>

      <Section title="Mise à jour constante" sub="Les patchs sont lus depuis l'API Steam, les stats et textes français officiels depuis les données extraites du client du jeu, puis les ajustements d'équilibrage plus récents sont appliqués automatiquement.">
        <div className="card-panel p-4">
          <UpdateStatus snap={snap} detailed />
        </div>
      </Section>

      {latest && (
        <Section title={`Dernier patch : ${latest.title}`} sub={`${latest.date} · ${latest.balance.length} cartes ajustées`} right={<Link className="text-sm text-amber-300 hover:underline" href="/patches">Tous les patchs →</Link>}>
          <div className="card-panel p-4">
            <p className="mb-3 text-zinc-300">{latest.summary}</p>
            <div className="flex flex-wrap gap-2">
              {latest.balance.slice(0, 14).map((b) => (
                <span key={b.name} className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-zinc-200">
                  {cardName(bySlug.get(enToSlug.get(b.name.toLowerCase()) ?? ""), b.name)} <span className={b.label.includes("Buff") ? "text-emerald-400" : b.label.includes("Nerf") ? "text-red-400" : "text-zinc-400"}>{patchLabelFr(b.label)}</span>
                </span>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section title="Répartition des raretés">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {["Common", "Rare", "Epic", "Legendary", "Divine"].map((r) => (
            <div key={r} className="card-panel p-3 text-center">
              <div className="text-xl font-bold text-white">{counts(r)}</div>
              <div className="text-xs text-zinc-400">{{ Common: "Communes", Rare: "Rares", Epic: "Épiques", Legendary: "Légendaires", Divine: "Divine" }[r]}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Comment fonctionne la fiabilité des statistiques ?">
        <div className="card-panel space-y-2 p-4 text-sm text-zinc-300">
          <p>
            Il existe plus de <b className="text-white">21 millions</b> de combinaisons de 4 cartes parmi {snap.cards.length} — sans compter l&apos;ordre sur le plateau, les talents et les achats Tox possibles à chaque boutique. Aucun
            outil au monde ne peut jouer 100 % de ces cas ; prétendre le contraire serait faux.
          </p>
          <p>
            Le simulateur fait donc mieux que deviner : il <b className="text-white">énumère toutes les combinaisons de votre collection</b> (jusqu&apos;à 40 000), ou explore par algorithme génétique au-delà, puis affine par élimination successive avec des
            milliers de parties par finaliste. Chaque taux de victoire est affiché avec son <b className="text-white">intervalle de confiance à 95 %</b> (Wilson) et le nombre exact de parties jouées. Avec 5 000 parties, l&apos;incertitude est de ±1,4 point.
          </p>
          <p>
            Le moteur applique les règles documentées du jeu : cooldowns, points d&apos;éléments (+10 %), critiques, résistances, Berserk, Bouclier, Spamtons, boutique toutes les 2 tours (3 offres, rareté selon la Chance), +50 Spamtons à chaque carte détruite, prolongations dès le tour 20.
          </p>
        </div>
      </Section>
    </div>
  );
}
