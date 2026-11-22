/* Worker Node (worker_threads) : joue des séries de parties pour les calculs hors ligne. */
import { parentPort } from "node:worker_threads";
import { compile, type Compiled, type RawDataset } from "../../src/sim/compile";
import { mulberry32, playMatch, type DeckSpec, type MatchOpts } from "../../src/sim/engine";
import { rankDecks } from "../../src/sim/ranking";
import { searchMatch, type SearchOpts } from "../../src/sim/search";

export interface Task { a: DeckSpec; b: DeckSpec; n: number; seed: number; opts?: Omit<MatchOpts, "choose" | "log" | "trace">; collect?: boolean; alt?: boolean }
export interface TaskOut { aw: number; bw: number; d: number; turns: number; toxA: Record<string, number> }
export interface SearchTask { a: DeckSpec; b: DeckSpec; seed: number; first: 0 | 1; so: Omit<SearchOpts, "onDecision"> }

let comp: Compiled | null = null;
parentPort!.on("message", (m: { id: number; type: string; payload: Record<string, unknown> }) => {
  const { id, type, payload } = m;
  try {
    if (type === "init") { comp = compile(payload.dataset as RawDataset); parentPort!.postMessage({ id, result: { coverage: comp.coverage } }); return; }
    if (!comp) throw new Error("worker non initialisé");
    if (type === "rank") {
      const res = rankDecks(comp, payload.pool as number[], payload.topK as number, undefined, (payload.maxShare as number) ?? 2);
      parentPort!.postMessage({ id, result: res });
      return;
    }
    if (type === "play") {
      const out: TaskOut[] = (payload.jobs as Task[]).map((j) => {
        const rng = mulberry32(j.seed);
        let aw = 0, bw = 0, d = 0, turns = 0;
        const toxA: Record<string, number> = {};
        for (let i = 0; i < j.n; i++) {
          const r = playMatch(comp!, [j.a, j.b], rng, { ...j.opts, first: (i & 1) as 0 | 1 });
          if (r.winner === 0) aw++; else if (r.winner === 1) bw++; else d++;
          turns += r.turns;
          if (payload.collect || j.collect) for (const k of new Set(r.bought[0])) toxA[k] = (toxA[k] ?? 0) + 1;
        }
        return { aw, bw, d, turns, toxA };
      });
      parentPort!.postMessage({ id, result: out });
      return;
    }
    if (type === "search") {
      const t = payload as unknown as SearchTask;
      const r = searchMatch(comp, [t.a, t.b], t.seed, t.so, { first: t.first });
      parentPort!.postMessage({ id, result: { winner: r.result.winner, rollouts: r.rollouts, decisions: r.decisions.length, changed: r.decisions.filter((x) => x.chosen !== x.def).length } });
      return;
    }
    throw new Error("type inconnu " + type);
  } catch (err) {
    parentPort!.postMessage({ id, error: err instanceof Error ? err.stack : String(err) });
  }
});
