"use client";

import { useEffect, useState } from "react";
import { SITE_BASE, useSpam } from "./SpamProvider";
import { PageHeader } from "./PageHeader";

interface Change { card: number; name: string; slug: string; kind: string; label: string; from?: string; to?: string }
export interface PatchRow { version: string; previous: string | null; generatedAt: string; cardCount: number; changes: Change[]; summary: Record<string, number> }

const KIND: Record<string, string> = { ajout: "Nouvelles cartes", retrait: "Cartes retirées", pv: "PV", spamton: "Spamtons", resistance: "Résistances", capacite: "Capacités", talent: "Talents", passif: "Passifs", rarete: "Raretés", element: "Éléments" };
const KCOL: Record<string, string> = { ajout: "#7bf08a", retrait: "#ff7a7a", pv: "#ffc756", spamton: "#ffc756", resistance: "#7ac8ff", capacite: "#c06aff", talent: "#ff9ad5", passif: "#9bf07a", rarete: "#fff", element: "#fff" };

export function usePatches() {
  const [patches, setPatches] = useState<PatchRow[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`${SITE_BASE}/data/patches.json`, { cache: "no-cache" })
      .then((r) => r.json())
      .then((j: PatchRow[]) => !off && setPatches(j))
      .catch(() => !off && setPatches([]));
    return () => { off = true; };
  }, []);
  return patches;
}

export function PatchesView() {
  const patches = usePatches();
  const { ds, info } = useSpam();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  return (
    <div className="space-y-6">
      <PageHeader group="references" title="Patchs & évolutions des cartes" lead="Les changements de chaque version du jeu, détectés automatiquement."
        more={<p>Le site vérifie le SpamDex officiel toutes les heures : dès qu&apos;une nouvelle version est publiée, les cartes, statistiques, passifs et talents sont mis à jour et le site est republié. Les différences entre versions sont calculées automatiquement.</p>}>
        <p className="text-sm text-white/65">Version actuelle : <b className="text-white">{ds?.version ?? "…"}</b>{info && <> · publiée par les développeurs le {new Date(info.generatedAt).toLocaleString("fr-FR")}{info.source === "direct" ? " (lue en direct)" : ""}</>}</p>
      </PageHeader>
      <input className="input max-w-xs" placeholder="Filtrer par carte…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {patches === null && <p className="text-white/60">Chargement de l&apos;historique…</p>}
      {patches && patches.length === 0 && <p className="panel p-6 text-white/60">L&apos;historique sera calculé lors de la prochaine synchronisation automatique (au plus une heure).</p>}
      {patches?.map((p) => {
        const ch = p.changes.filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
        if (filter && ch.length === 0) return null;
        const byCard = new Map<number, Change[]>();
        ch.forEach((c) => byCard.set(c.card, [...(byCard.get(c.card) ?? []), c]));
        const isOpen = open === p.version || !!filter;
        return (
          <article key={p.version} className="panel p-4">
            <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => setOpen(isOpen && !filter ? null : p.version)}>
              <div>
                <h2 className="font-display text-2xl text-white">Patch {p.version}</h2>
                <p className="text-xs text-white/55">{new Date(p.generatedAt).toLocaleString("fr-FR")} · {p.cardCount} cartes · {p.changes.length} modification(s){p.previous ? ` depuis ${p.previous}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(p.summary).map(([k, v]) => <span key={k} className="rounded-full bg-black/40 px-2 py-0.5 text-xs" style={{ color: KCOL[k] }}>{v} {KIND[k] ?? k}</span>)}
              </div>
            </button>
            {isOpen && (
              <div className="mt-4 space-y-3">
                {[...byCard.entries()].map(([n, list]) => (
                  <div key={n} className="rounded-xl bg-black/30 p-3 text-sm">
                    <b className="text-white">{list[0].name}</b> <span className="text-xs text-white/55">n°{n}</span>
                    <ul className="mt-1 space-y-1">
                      {list.map((c, i) => (
                        <li key={i} className="text-white/75"><span style={{ color: KCOL[c.kind] }}>{c.label}</span>{c.from !== undefined && <> : <s className="text-white/55">{c.from}</s></>}{c.to !== undefined && <> → <span className="text-white">{c.to}</span></>}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {ch.length === 0 && <p className="text-sm text-white/55">Aucune différence détectée dans les données de cartes (patch d&apos;interface ou de correctifs).</p>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
