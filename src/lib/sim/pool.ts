import type { Snapshot } from "../types";
import type { DeckSpec, EvalResult } from "./engine";
import type { InMsg, Job, OutMsg } from "./worker";

type Pending = { resolve: (value: EvalResult[]) => void; reject: (reason: Error) => void; cleanup: () => void };

export class SimPool {
  private workers: Worker[] = [];
  private ready: Promise<void>[] = [];
  private readyRejectors: Array<(error: Error) => void> = [];
  private pending = new Map<number, Pending>();
  private seq = 1;
  readonly size: number;
  cancelled = false;
  private failure: Error | null = null;
  get unusable() { return this.cancelled || this.failure !== null; }

  constructor(snapshot: Snapshot, size?: number) {
    const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(size ?? Math.max(1, hc - 1), 6));
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.workers.push(w);
      this.ready.push(new Promise<void>((resolve, reject) => {
        this.readyRejectors[i] = reject;
        const onMessage = (e: MessageEvent<OutMsg>) => {
          if (e.data.type === "ready") {
            cleanup();
            this.readyRejectors[i] = () => undefined;
            resolve();
          } else if (e.data.type === "error" && e.data.id === -1) {
            cleanup();
            const error = new Error(e.data.message);
            this.readyRejectors[i] = () => undefined;
            reject(error);
            this.failAll(error);
          }
        };
        const onError = (e: ErrorEvent) => {
          cleanup();
          const error = new Error(e.message || "Simulation worker initialization failed");
          this.readyRejectors[i] = () => undefined;
          reject(error);
          this.failAll(error);
        };
        const cleanup = () => {
          w.removeEventListener("message", onMessage);
          w.removeEventListener("error", onError);
        };
        w.addEventListener("message", onMessage);
        w.addEventListener("error", onError);
      }));
      w.addEventListener("error", (e: ErrorEvent) => this.failWorker(w, new Error(e.message || "Simulation worker crashed")));
      w.addEventListener("message", (e: MessageEvent<OutMsg>) => {
        if (e.data.type === "done") {
          const pending = this.pending.get(e.data.id);
          if (!pending) return;
          this.pending.delete(e.data.id);
          pending.cleanup();
          pending.resolve(e.data.results);
        } else if (e.data.type === "error") {
          const pending = this.pending.get(e.data.id);
          if (!pending) return;
          this.pending.delete(e.data.id);
          pending.cleanup();
          const error = new Error(e.data.message);
          pending.reject(error);
          this.failAll(error);
        }
      });
      w.postMessage({ type: "init", snapshot } satisfies InMsg);
    }
  }

  private failAll(error: Error) {
    if (this.failure) return;
    this.failure = error;
    for (const reject of this.readyRejectors) reject(error);
    this.readyRejectors = [];
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      pending.cleanup();
      pending.reject(error);
    }
    for (const worker of this.workers) worker.terminate();
  }

  private failWorker(_worker: Worker, error: Error) {
    this.failAll(error);
  }

  private call(w: Worker, jobs: Job[], opps: DeckSpec[]): Promise<EvalResult[]> {
    if (this.cancelled) return Promise.reject(new Error("Simulation cancelled"));
    if (this.failure) return Promise.reject(this.failure);
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      const onError = (e: ErrorEvent) => {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        p.cleanup();
        const error = new Error(e.message || "Simulation worker failed");
        p.reject(error);
        this.failAll(error);
      };
      const cleanup = () => w.removeEventListener("error", onError);
      this.pending.set(id, { resolve, reject, cleanup });
      w.addEventListener("error", onError);
      try {
        w.postMessage({ type: "eval", id, jobs, opps } satisfies InMsg);
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Runs jobs across workers, in dynamic chunks, preserving result order. */
  async run(jobs: Job[], opps: DeckSpec[], onGames?: (n: number) => void): Promise<EvalResult[]> {
    if (this.cancelled) throw new Error("Simulation cancelled");
    await Promise.all(this.ready);
    if (this.failure) throw this.failure;
    const out: EvalResult[] = new Array(jobs.length);
    const totalGames = jobs.reduce((sum, job) => sum + job.games, 0);
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
    await Promise.all(this.workers.map(async (w) => {
      while (!this.cancelled && !this.failure && next < chunks.length) {
        const chunk = chunks[next++];
        const batch = jobs.slice(chunk.from, chunk.to);
        const results = await this.call(w, batch, opps);
        for (let k = 0; k < results.length; k++) out[chunk.from + k] = results[k];
        onGames?.(batch.reduce((sum, job) => sum + job.games, 0));
      }
    }));
    if (this.cancelled) throw new Error("Simulation cancelled");
    if (this.failure) throw this.failure;
    if (out.some((result) => result === undefined)) throw new Error("Simulation ended with missing worker results");
    return out;
  }

  terminate() {
    if (this.cancelled) return;
    this.cancelled = true;
    const error = new Error("Simulation cancelled");
    for (const reject of this.readyRejectors) reject?.(error);
    this.readyRejectors = [];
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.cleanup();
      p.reject(error);
    }
    for (const w of this.workers) w.terminate();
  }
}
