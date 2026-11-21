"use client";
import type { Snapshot } from "@/lib/types";

function age(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "il y a moins d'une heure";
  if (h < 48) return `il y a ${Math.round(h)} h`;
  return `il y a ${Math.round(h / 24)} jours`;
}

/** État des données : fraîcheur, version, couverture de la traduction officielle. */
export function UpdateStatus({ snap, detailed = false }: { snap: Snapshot; detailed?: boolean }) {
  const h = (Date.now() - new Date(snap.fetchedAt).getTime()) / 3600000;
  const tone = h < 26 ? "emerald" : h < 72 ? "amber" : "red";
  const cls = { emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", amber: "border-amber-500/40 bg-amber-500/10 text-amber-300", red: "border-red-500/40 bg-red-500/10 text-red-300" }[tone];
  const fr = snap.frCoverage;
  return (
    <div className="text-sm">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${cls}`}>
        ● Données vérifiées {age(snap.fetchedAt)} · patch {snap.gameVersion}
      </span>
      {detailed && (
        <div className="mt-2 space-y-0.5 text-zinc-400">
          <div>Dernière vérification : <b className="text-white">{new Date(snap.fetchedAt).toLocaleString("fr-FR")}</b></div>
          <div>Source : {snap.dataSource} · données client extraites le {snap.dataExtracted || "?"}</div>
          <div>
            Textes officiels en français :{" "}
            {fr ? (
              <b className="text-white">
                {fr.cards}/{fr.cardsTotal} cartes · {fr.tox} Tox · {fr.talents} talents
              </b>
            ) : (
              <b className="text-amber-300">en attente de la prochaine synchronisation (textes anglais affichés)</b>
            )}
          </div>
          <div className="text-zinc-500">
            Vérification automatique plusieurs fois par jour : nouvelles cartes, valeurs et notes de patch Steam. Un snapshot n&apos;est publié que s&apos;il passe les contrôles d&apos;intégrité ; sinon le précédent reste en ligne.
          </div>
          {h >= 72 && <div className="text-red-300">⚠ Les données ont plus de 3 jours : la synchronisation automatique a peut-être échoué.</div>}
        </div>
      )}
    </div>
  );
}
