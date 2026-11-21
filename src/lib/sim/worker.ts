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
export type OutMsg =
  | { type: "ready" }
  | { type: "done"; id: number; results: EvalResult[] }
  | { type: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const message = e.data;
  if (message.type === "init") {
    try {
      initEngine(message.snapshot);
      ctx.postMessage({ type: "ready" } satisfies OutMsg);
    } catch (error) {
      ctx.postMessage({ type: "error", id: -1, message: error instanceof Error ? error.message : String(error) } satisfies OutMsg);
    }
    return;
  }
  try {
    const results = message.jobs.map((job) => evalDeck(job.a, job.o || message.opps, job.games, job.seed, !!job.stats));
    ctx.postMessage({ type: "done", id: message.id, results } satisfies OutMsg);
  } catch (error) {
    ctx.postMessage({ type: "error", id: message.id, message: error instanceof Error ? error.message : String(error) } satisfies OutMsg);
  }
};
