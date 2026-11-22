/* Plateau : parties rejouables décision par décision (bot contre bot, ou un joueur humain contre le bot).
 *
 * Le moteur est déterministe : une partie est entièrement décrite par (decks, graine, premier joueur, terrain, réponses du joueur).
 * Pour connaître l'état après une nouvelle réponse, on rejoue la partie depuis le début avec les réponses déjà données ;
 * à la première décision du joueur sans réponse, le moteur est interrompu et l'état du terrain est renvoyé. Annuler = retirer la dernière réponse. */
import type { Compiled } from "./compile";
import { mulberry32, playMatch, type Board, type DeckSpec, type Decision, type DecisionKind, type Frame, type MatchResult } from "./engine";

export interface PlayState {
  decks: [DeckSpec, DeckSpec];
  seed: number;
  first: 0 | 1;
  terrain: number;
  /** Joueur humain (0 = deck A), ou null : deux bots. */
  human: 0 | 1 | null;
  /** Choix déjà faits par le joueur humain, dans l'ordre des décisions. */
  answers: number[];
}

export interface Pending { kind: DecisionKind; side: 0 | 1; turn: number; labels: string[]; def: number; board: Board }
export interface PlayView {
  frames: Frame[];
  /** Décision en attente du joueur humain (null : partie terminée ou bots seuls). */
  pending: Pending | null;
  result: MatchResult | null;
  /** Nombre de lignes de journal produites avant la dernière réponse du joueur (pour montrer ce qui vient de se passer). */
  mark: number;
}

class Interrupt extends Error {
  constructor(public pending: Pending) { super("décision du joueur"); }
}

export function runPlay(comp: Compiled, st: PlayState): PlayView {
  const frames: Frame[] = [];
  let idx = 0;
  let mark = 0;
  const choose = (d: Decision): number => {
    if (st.human === null || d.side !== st.human) return d.def;
    if (idx < st.answers.length) { idx++; if (idx === st.answers.length) mark = frames.length; return st.answers[idx - 1]; }
    throw new Interrupt({ kind: d.kind, side: d.side, turn: d.turn, labels: Array.from({ length: d.n }, (_, i) => d.label(i)), def: d.def, board: d.board!() });
  };
  try {
    const result = playMatch(comp, st.decks, mulberry32(st.seed), { frames, choose, first: st.first, terrain: st.terrain });
    return { frames, pending: null, result, mark: st.answers.length ? mark : 0 };
  } catch (e) {
    if (e instanceof Interrupt) return { frames, pending: e.pending, result: null, mark: st.answers.length ? mark : 0 };
    throw e;
  }
}

/** Partie entre deux bots : toutes les lignes du journal avec l'état du terrain après chacune. */
export function runBots(comp: Compiled, decks: [DeckSpec, DeckSpec], seed: number, first: 0 | 1, terrain: number): PlayView {
  return runPlay(comp, { decks, seed, first, terrain, human: null, answers: [] });
}
