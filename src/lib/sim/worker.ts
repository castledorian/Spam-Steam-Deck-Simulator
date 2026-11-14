/// <reference lib="webworker" />
import { evalDeck, initEngine, type DeckSpec, type EvalResult } from "./engine";
import type { Snapshot } from "../types";

export interface Job {
  a: DeckSpec;
  o?: DeckSpec[];
  games: number;
  seed: number;
  stats?: boolean;
}
export type InMsg =
  | { type: "init"; snapshot: Snapshot }
  | { type: "eval"; id: number; jobs: Job[]; opps: DeckSpec[] };
export type OutMsg = { type: "ready" } | { type: "done"; id: number; results: EvalResult[] };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const m = e.data;
  if (m.type === "init") {
    initEngine(m.snapshot);
    ctx.postMessage({ type: "ready" } satisfies OutMsg);
  } else if (m.type === "eval") {
    const results = m.jobs.map((j) => evalDeck(j.a, j.o || m.opps, j.games, j.seed, !!j.stats));
    ctx.postMessage({ type: "done", id: m.id, results } satisfies OutMsg);
  }
};
