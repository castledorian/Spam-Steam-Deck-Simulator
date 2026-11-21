/// <reference lib="webworker" />
import { compile, Compiled, RawDataset } from "./compile";
import { DeckSpec, mulberry32, playMatch, Snapshot } from "./engine";
import { rankDecks } from "./ranking";

let comp: Compiled | null = null;
const ctx = self as unknown as DedicatedWorkerGlobalScope;

export interface PlayJob { a: DeckSpec; b: DeckSpec; n: number; seed: number }
export interface PlayOut { aw: number; bw: number; d: number; turns: number; toxA: Record<string, number> }

ctx.onmessage = (e: MessageEvent) => {
  const { id, type, payload } = e.data as { id: number; type: string; payload: Record<string, unknown> };
  try {
    if (type === "init") {
      comp = compile(payload.dataset as RawDataset);
      ctx.postMessage({ id, result: { coverage: comp.coverage } });
      return;
    }
    if (!comp) throw new Error("worker non initialisé");
    if (type === "rank") {
      const res = rankDecks(comp, payload.pool as number[], payload.topK as number, (p) => ctx.postMessage({ id, progress: p }), (payload.maxShare as number) ?? 2);
      ctx.postMessage({ id, result: res });
      return;
    }
    if (type === "play") {
      const jobs = payload.jobs as PlayJob[];
      const collect = !!payload.collect;
      const out: PlayOut[] = jobs.map((j) => {
        const rng = mulberry32(j.seed);
        let aw = 0, bw = 0, d = 0, turns = 0;
        const toxA: Record<string, number> = {};
        for (let i = 0; i < j.n; i++) {
          const r = playMatch(comp!, [j.a, j.b], rng, { first: (i & 1) as 0 | 1 });
          if (r.winner === 0) aw++; else if (r.winner === 1) bw++; else d++;
          turns += r.turns;
          if (collect) for (const k of new Set(r.bought[0])) toxA[k] = (toxA[k] ?? 0) + 1;
        }
        return { aw, bw, d, turns, toxA };
      });
      ctx.postMessage({ id, result: out });
      return;
    }
    if (type === "duel") {
      const log: string[] = [];
      const trace: Snapshot[] = [];
      const rng = mulberry32(payload.seed as number);
      const r = playMatch(comp, payload.decks as [DeckSpec, DeckSpec], rng, { log, trace });
      ctx.postMessage({ id, result: { log, trace, result: r } });
      return;
    }
    throw new Error("type inconnu " + type);
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
