"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Loading, PageTitle } from "@/components/ui";
import { cardName, patchFieldFr, patchLabelFr } from "@/lib/fr";
import { UpdateStatus } from "@/components/UpdateStatus";

export default function PatchesPage() {
  const { snap, loading, bySlug } = useData();
  const [open, setOpen] = useState<string | null>(null);
  if (loading || !snap) return <Loading />;
  const byName = new Map([...bySlug.values()].map((c) => [c.name.toLowerCase(), c.slug]));
  return (
    <div>
      <PageTitle title="Patchs & équilibrage" sub="Notes de patch officielles lues en direct depuis Steam. Les changements de PV, Spamtons, résistances, dégâts, passifs et talents sont appliqués automatiquement aux données des cartes." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <UpdateStatus snap={snap} />
        <span className="text-xs text-zinc-500">Les notes sont publiées en anglais sur Steam ; les noms de cartes et les statistiques sont affichés en français.</span>
      </div>
      <div className="space-y-3">
        {snap.patches.map((p, idx) => {
          const isOpen = open === p.id || (open === null && idx === 0);
          return (
            <div key={p.id} className="card-panel p-4">
              <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(isOpen ? "" : p.id)}>
                <div>
                  <div className="text-lg font-bold text-white">{p.title} {idx === 0 && <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">actuel</span>}</div>
                  <div className="text-sm text-zinc-400">{p.date} · {p.additions.length} ajouts · {p.balance.length} cartes équilibrées · {p.fixes.length} corrections</div>
                </div>
                <span className="text-zinc-400">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="mt-3 space-y-4 text-sm">
                  {p.summary && <p className="text-zinc-300">{p.summary}</p>}
                  {p.additions.length > 0 && (
                    <div>
                      <div className="mb-1 font-semibold text-emerald-300">Ajouts</div>
                      <ul className="list-disc space-y-0.5 pl-5 text-zinc-300">{p.additions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                  {p.balance.length > 0 && (
                    <div>
                      <div className="mb-2 font-semibold text-amber-300">Équilibrage</div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {p.balance.map((b) => {
                          const slug = byName.get(b.name.toLowerCase());
                          return (
                            <div key={b.name} className="rounded-lg bg-white/5 p-2.5">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                {slug ? <a href={`/cards/${slug}`} className="font-semibold text-white hover:text-amber-300">{cardName(bySlug.get(slug), b.name)}</a> : <span className="font-semibold text-white">{b.name}</span>}
                                <span className={`text-xs ${b.label.includes("Buff") ? "text-emerald-400" : b.label.includes("Nerf") ? "text-red-400" : "text-zinc-400"}`}>{patchLabelFr(b.label)}</span>
                              </div>
                              {b.changes.map((c, i) => (
                                <div key={i} className="text-xs text-zinc-300">
                                  {c.from || c.to ? (
                                    <>
                                      {patchFieldFr(c.field)} : <s className="text-zinc-500">{c.from}</s> → <b className={c.dir === "up" ? "text-emerald-400" : c.dir === "down" ? "text-red-400" : "text-white"}>{c.to}</b>
                                    </>
                                  ) : (
                                    c.field
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {p.fixes.length > 0 && (
                    <div>
                      <div className="mb-1 font-semibold text-sky-300">Corrections</div>
                      <ul className="list-disc space-y-0.5 pl-5 text-zinc-300">{p.fixes.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                  <a href={p.url} target="_blank" rel="noreferrer" className="inline-block text-xs text-amber-300 hover:underline">Notes officielles sur Steam ↗</a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
