/* IA « experte » : recherche Monte-Carlo à chaque décision (comme un moteur d'échecs, adapté au hasard).
 *
 * À chaque décision (ordre des capacités, cible, achat/relance en boutique, option d'un « Choix »), chaque option
 * est jouée puis la partie est terminée de nombreuses fois avec des tirages aléatoires différents (mêmes tirages
 * pour toutes les options : comparaison à hasard égal). L'option qui gagne le plus souvent est jouée.
 *
 * Pour repartir exactement de la position courante sans copier l'état du moteur, la partie est rejouée depuis le
 * début avec les mêmes tirages (bande enregistrée) et les mêmes décisions, puis l'option testée est imposée et la
 * suite est tirée au hasard. Le reste de la partie est joué par l'IA heuristique (rapide).
 */
import type { Compiled } from "./compile";
import { mulberry32, playMatch, type AiParams, type Chooser, type DeckSpec, type DecisionKind, type MatchOpts, type MatchResult, type Rng } from "./engine";

/** Générateur aléatoire « bande » : rejoue un préfixe enregistré puis continue avec une graine neuve. */
export interface Tape { rng: Rng; vals: number[]; pos: () => number }
export function makeTape(seed: number, prefix: number[] | null = null, prefixLen = 0, record = true): Tape {
  const src = mulberry32(seed);
  const vals: number[] = record ? [] : (null as unknown as number[]);
  let pos = 0;
  const rng: Rng = () => {
    if (pos < prefixLen) return prefix![pos++];
    const v = src();
    if (record) vals.push(v);
    pos++;
    return v;
  };
  return { rng, vals, pos: () => pos };
}

/** Rejoue les décisions imposées, puis laisse l'IA heuristique décider. */
export function replayChooser(forced: number[]): Chooser {
  let k = 0;
  return (d) => {
    const i = k++;
    return i < forced.length ? forced[i] : d.def;
  };
}

export interface DecisionRec {
  kind: DecisionKind; side: 0 | 1; turn: number; labels: string[]; def: number; chosen: number;
  /** Taux de victoire estimé de chaque option (NaN si non évaluée) et nombre de parties jouées par option. */
  wr: number[]; n: number[];
  /** Position dans le journal de la partie (si journal demandé). */
  at?: number;
  /** Caractéristiques des options (ciblage), pour l'apprentissage du modèle de l'IA rapide. */
  feat?: number[][];
}
export interface SearchOpts {
  /** Parties jouées par option (première passe). Les deux meilleures options reçoivent autant de parties en plus. */
  rollouts: number;
  /** Joueurs pilotés par la recherche. */
  sides: [boolean, boolean];
  /** Types de décisions recherchées (toutes par défaut). */
  kinds?: DecisionKind[];
  ai?: [AiParams | undefined, AiParams | undefined];
  /** Appelé à chaque décision évaluée (pour l'analyse de partie). */
  onDecision?: (r: DecisionRec) => void;
}
export interface SearchResult { result: MatchResult; decisions: DecisionRec[]; rollouts: number }

const hash = (a: number, b: number, c: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
};

/**
 * Joue une partie où les joueurs indiqués décident par recherche Monte-Carlo.
 * mo.first / mo.terrain fixent l'ordre de jeu et le terrain (sinon tirés au hasard).
 */
export function searchMatch(comp: Compiled, decks: [DeckSpec, DeckSpec], seed: number, so: SearchOpts, mo: Pick<MatchOpts, "first" | "terrain" | "log" | "trace"> = {}): SearchResult {
  const root = makeTape(seed);
  const history: number[] = [];
  const decisions: DecisionRec[] = [];
  let total = 0;
  const base: MatchOpts = { first: mo.first, terrain: mo.terrain, ai: so.ai };
  const R = Math.max(2, so.rollouts);

  const chooser: Chooser = (d) => {
    const k = history.length;
    if (!so.sides[d.side] || (so.kinds && !so.kinds.includes(d.kind))) { history.push(d.def); return d.def; }
    const P = root.pos();
    const n = d.n;
    const wins = new Array<number>(n).fill(0);
    const cnt = new Array<number>(n).fill(0);
    const play = (opt: number, r: number) => {
      const tape = makeTape(hash(seed, k, r), root.vals, P, false);
      const res = playMatch(comp, decks, tape.rng, { ...base, choose: replayChooser(history.concat(opt)) });
      total++;
      cnt[opt]++;
      wins[opt] += res.winner === d.side ? 1 : res.winner === -1 ? 0.5 : 0;
    };
    // passe 1 : toutes les options, mêmes tirages
    const r1 = Math.ceil(R / 2);
    for (let o = 0; o < n; o++) for (let r = 0; r < r1; r++) play(o, r);
    // passe 2 : les deux meilleures (et le choix heuristique s'il est proche) sont départagées
    const mean = (o: number) => wins[o] / Math.max(1, cnt[o]);
    const order = [...Array(n).keys()].sort((a, b) => mean(b) - mean(a) || (a === d.def ? -1 : b === d.def ? 1 : 0));
    const top = order.slice(0, 2);
    if (!top.includes(d.def) && mean(d.def) >= mean(order[0]) - 0.1) top.push(d.def);
    const decided = mean(order[0]) <= 0.02 || mean(order[n - 1]) >= 0.98;
    if (!decided) for (const o of top) for (let r = r1; r < r1 + R; r++) play(o, r);
    // choix : meilleure moyenne ; à égalité (ou écart insignifiant) on garde le choix heuristique
    let best = d.def;
    for (const o of order) if (mean(o) > mean(best) + 1e-9 && cnt[o] >= cnt[best]) best = o;
    const rec: DecisionRec = {
      kind: d.kind, side: d.side, turn: d.turn, labels: Array.from({ length: n }, (_, i) => d.label(i)), def: d.def, chosen: best,
      wr: wins.map((w, i) => (cnt[i] ? w / cnt[i] : NaN)), n: cnt.slice(), at: mo.log?.length, feat: d.feat,
    };
    decisions.push(rec);
    so.onDecision?.(rec);
    history.push(best);
    return best;
  };
  const result = playMatch(comp, decks, root.rng, { ...base, choose: chooser, log: mo.log, trace: mo.trace });
  return { result, decisions, rollouts: total };
}
