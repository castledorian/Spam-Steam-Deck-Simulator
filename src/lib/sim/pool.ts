import type { Snapshot } from "../types";
import type { DeckSpec, EvalResult } from "./engine";
import type { InMsg, Job, OutMsg } from "./worker";

export class SimPool {
  private workers: Worker[] = [];
  private ready: Promise<void>[] = [];
  private seq = 1;
  readonly size: number;
  cancelled = false;

  constructor(snapshot: Snapshot, size?: number) {
    const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(size ?? hc - 1, 6));
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.ready.push(
        new Promise<void>((res) => {
          const h = (e: MessageEvent<OutMsg>) => {
            if (e.data.type === "ready") {
              w.removeEventListener("message", h);
              res();
            }
          };
          w.addEventListener("message", h);
        }),
      );
      w.postMessage({ type: "init", snapshot } satisfies InMsg);
      this.workers.push(w);
    }
  }

  private call(w: Worker, jobs: Job[], opps: DeckSpec[]): Promise<EvalResult[]> {
    const id = this.seq++;
    return new Promise((res) => {
      const h = (e: MessageEvent<OutMsg>) => {
        if (e.data.type === "done" && e.data.id === id) {
          w.removeEventListener("message", h);
          res(e.data.results);
        }
      };
      w.addEventListener("message", h);
      w.postMessage({ type: "eval", id, jobs, opps } satisfies InMsg);
    });
  }

  /** Runs jobs across workers, in dynamic chunks, preserving order. */
  async run(jobs: Job[], opps: DeckSpec[], onGames?: (n: number) => void): Promise<EvalResult[]> {
    await Promise.all(this.ready);
    const out: EvalResult[] = new Array(jobs.length);
    const totalGames = jobs.reduce((s, j) => s + j.games, 0);
    const chunkGames = Math.max(400, Math.ceil(totalGames / (this.size * 6)));
    const chunks: { from: number; to: number }[] = [];
    let from = 0;
    let acc = 0;
    for (let i = 0; i < jobs.length; i++) {
      acc += jobs[i].games;
      if (acc >= chunkGames || i === jobs.length - 1) {
        chunks.push({ from, to: i + 1 });
        from = i + 1;
        acc = 0;
      }
    }
    let next = 0;
    await Promise.all(
      this.workers.map(async (w) => {
        while (next < chunks.length && !this.cancelled) {
          const c = chunks[next++];
          const res = await this.call(w, jobs.slice(c.from, c.to), opps);
          for (let k = 0; k < res.length; k++) out[c.from + k] = res[k];
          onGames?.(jobs.slice(c.from, c.to).reduce((s, j) => s + j.games, 0));
        }
      }),
    );
    if (this.cancelled) throw new Error("cancelled");
    return out;
  }

  terminate() {
    this.cancelled = true;
    for (const w of this.workers) w.terminate();
  }
}
