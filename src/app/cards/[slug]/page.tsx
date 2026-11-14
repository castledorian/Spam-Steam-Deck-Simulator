"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useData, useOwned } from "@/components/DataProvider";
import { Bar, CardFace, EL_COLOR, EL_FR, ElIcon, Loading, Pill, RAR_COLOR, RAR_FR, Section, SpamtonIcon } from "@/components/ui";
import { EL6 } from "@/lib/types";

export default function CardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { snap, bySlug, loading } = useData();
  const { owned, set } = useOwned();
  if (loading || !snap) return <Loading />;
  const c = bySlug.get(slug);
  if (!c) return <div className="py-20 text-center text-zinc-400">Carte introuvable. <Link href="/cards" className="text-amber-300">Retour</Link></div>;
  const toxById = new Map(snap.tox.map((t) => [t.id, t]));
  const lvl = owned[c.slug];
  return (
    <div>
      <Link href="/cards" className="mb-4 inline-block text-sm text-zinc-400 hover:text-white">← Toutes les cartes</Link>
      <div className="grid gap-8 md:grid-cols-[320px_1fr]">
        <div>
          <CardFace card={c} className="mx-auto w-full max-w-[320px]" />
          <div className="card-panel mt-4 p-3 text-sm">
            <div className="mb-2 font-semibold text-white">Ma collection</div>
            <div className="flex flex-wrap items-center gap-2">
              <button className={`btn ${lvl !== undefined ? "btn-primary" : "btn-ghost"} !py-1`} onClick={() => set(c.slug, lvl !== undefined ? null : 0)}>
                {lvl !== undefined ? "✓ Possédée" : "Je la possède"}
              </button>
              {lvl !== undefined && (
                <select className="input !py-1" value={lvl} onChange={(e) => set(c.slug, +e.target.value)}>
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n} talent(s) débloqué(s)</option>
                  ))}
                </select>
              )}
            </div>
            {c.artist && <p className="mt-3 text-xs text-zinc-500">Illustration : {c.artist}</p>}
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-white">{c.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill color={RAR_COLOR[c.rarity]}>{RAR_FR[c.rarity]}</Pill>
            <Pill color={EL_COLOR[c.element]}><ElIcon el={c.element} size={14} /> {EL_FR[c.element]}</Pill>
            <Pill color="#f87171">♥ {c.hp} PV</Pill>
            <Pill color="#FFB547"><SpamtonIcon /> {c.spamton} Spamtons/tour</Pill>
          </div>

          <Section title="Capacités" sub="Valeurs de base avant bonus d'éléments.">
            <div className="space-y-3">
              {c.abilities.length === 0 && <div className="card-panel p-4 text-sm text-zinc-400">Cette carte n&apos;a aucune capacité active : elle repose sur ses passifs.</div>}
              {c.abilities.map((a) => (
                <div key={a.name} className="card-panel p-4" style={{ borderColor: EL_COLOR[a.elements[0] ?? c.element] + "55" }}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">{a.name}</span>
                    {a.elements.map((e) => (
                      <ElIcon key={e} el={e} size={16} />
                    ))}
                  </div>
                  <div className="space-y-0.5 text-sm text-zinc-300">{a.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
                    <span>Recharge <b className="text-white">{a.cooldown}</b></span>
                    <span>Précision <b className="text-white">{Math.round(a.accuracy * 100)} %</b></span>
                    <span>Critique <b className="text-white">{Math.round(a.critChance * 100)} % ×{a.critPower}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {c.startTox.length > 0 && (
            <Section title="Passifs de départ (Tox)">
              <div className="grid gap-2 sm:grid-cols-2">
                {c.startTox.map((t) => {
                  const fam = toxById.get(t.id);
                  return (
                    <div key={t.id + t.name} className="card-panel flex gap-3 p-3">
                      {fam?.icon && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/tox/${fam.icon}`} alt="" width={36} height={36} className="h-9 w-9" />}
                      <div>
                        <div className="font-semibold text-white">{t.name} {t.rarity && <span className="text-xs text-zinc-400">({t.rarity})</span>}</div>
                        <div className="text-sm text-zinc-300">{t.text || fam?.text}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Talents" sub="Débloqués en obtenant des doublons. Un seul est actif par match. « Modélisé » = pris en compte par le simulateur.">
            <div className="space-y-2">
              {c.talents.map((t) => (
                <div key={t.slot} className="card-panel flex items-start gap-3 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{t.slot}</span>
                  <div>
                    <div className="font-semibold text-white">{t.name} {t.modeled && <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">modélisé</span>}</div>
                    <div className="text-sm text-zinc-300">{t.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Résistances">
            <div className="card-panel grid gap-2 p-4 sm:grid-cols-2">
              {EL6.map((e) => (
                <div key={e} className="flex items-center gap-2">
                  <ElIcon el={e} size={18} />
                  <span className="w-16 text-sm text-zinc-300">{EL_FR[e]}</span>
                  <div className="flex-1"><Bar pct={50 + c.res[e]} color={EL_COLOR[e]} /></div>
                  <span className="w-12 text-right text-sm font-semibold text-white">{c.res[e] > 0 ? "+" : ""}{c.res[e]}%</span>
                </div>
              ))}
            </div>
          </Section>

          {(c.patched.length > 0 || c.pending.length > 0) && (
            <Section title="Ajustements de patch" sub="Appliqués automatiquement par-dessus les données du client quand la valeur d'origine correspond.">
              <div className="card-panel p-4 text-sm">
                {c.patched.map((p) => (
                  <div key={p} className="text-emerald-300">✓ {p}</div>
                ))}
                {c.pending.map((p) => (
                  <div key={p} className="text-amber-300" title="Non pris en compte par le simulateur">⚠ {p}</div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
