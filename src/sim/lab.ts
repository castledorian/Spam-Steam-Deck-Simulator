/* Résultats du laboratoire hors ligne (public/data/lab.json, calculé par scripts/lab/run.mts sur GitHub Actions). */
import type { AiParams } from "./engine";
import type { MetaPayload } from "./pool";

export interface LabExpertDeck { cards: number[]; tal?: number[]; wr: number; lo: number; hi: number; n: number; heur: number; vs: (number | null)[] }
export interface LabToxImpact { fam: string; el: number; r: number; turn: number; d: number; lo: number; hi: number }
export interface LabCardImpact { num: number; wr: number; best: number; n: number; tal: { slot: number; wr: number }[] }
export interface LabPayload {
  lab: number; version: string; at: string; quick: boolean; games: number; seconds: number; cores: number;
  ai: AiParams;
  meta: MetaPayload;
  expert: { decks: LabExpertDeck[]; rollouts: number; gamesPerPair: number };
  impact: {
    tox: LabToxImpact[]; pts: { el: number; d: number }[]; cards: LabCardImpact[];
    abilities: { num: number; ab: number; d: number }[]; ctx: number; opps: number;
  };
}
