import type { ReactNode } from "react";
import { NAV } from "./nav";

/**
 * En-tête commun à toutes les pages : rubrique (repère de navigation), titre, une phrase d'objectif,
 * puis le détail dans un bloc repliable (divulgation progressive : on ne lit le mode d'emploi que si besoin).
 */
export function PageHeader({ group, title, lead, more, children }: { group: string; title: string; lead: ReactNode; more?: ReactNode; children?: ReactNode }) {
  const g = NAV.find((x) => x.id === group);
  return (
    <header className="space-y-2">
      {g && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ffc756]">{g.label}</p>}
      <h1 className="font-display text-3xl leading-tight text-white sm:text-4xl">{title}</h1>
      <p className="max-w-[68ch] text-base leading-relaxed text-white/75">{lead}</p>
      {more && (
        <details className="group max-w-[68ch] text-sm text-white/70">
          <summary className="cursor-pointer select-none text-[#ffc756] hover:underline">Comment ça marche ?</summary>
          <div className="mt-2 space-y-2 leading-relaxed">{more}</div>
        </details>
      )}
      {children}
    </header>
  );
}
