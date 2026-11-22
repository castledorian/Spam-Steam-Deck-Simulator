/* Équivalent Node de SimPool (src/sim/pool.ts) : mêmes méthodes, exécutées sur des worker_threads. */
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { compile, type Compiled, type RawDataset } from "../../src/sim/compile";
import type { Ranked } from "../../src/sim/ranking";
import type { Task, TaskOut } from "./worker";

type H = { resolve: (v: unknown) => void; reject: (e: Error) => void };
export class NodePool {
  private workers: Worker[] = [];
  private handlers = new Map<number, H>();
  private seq = 1;
  size: number;
  comp: Compiled | null = null;
  coverage = 1;
  constructor(n?: number) {
    this.size = Math.max(1, n ?? cpus().length);
    for (let i = 0; i < this.size; i++) {
      // les workers doivent charger tsx eux-mêmes (les crochets de chargement ne sont pas hérités partout)
      const local = existsSync(resolve(process.cwd(), "node_modules/tsx"));
      const w = new Worker(resolve(process.cwd(), "scripts/lab/worker.ts"), local ? { execArgv: ["--import", "tsx"] } : undefined);
      w.on("message", (m: { id: number; result?: unknown; error?: string }) => {
        const h = this.handlers.get(m.id);
        if (!h) return;
        this.handlers.delete(m.id);
        if (m.error) h.reject(new Error(m.error)); else h.resolve(m.result);
      });
      w.on("error", (e) => { for (const h of this.handlers.values()) h.reject(e); });
      this.workers.push(w);
    }
  }
  call<T>(wi: number, type: string, payload: unknown): Promise<T> {
    const id = this.seq++;
    return new Promise<T>((resolve, reject) => {
      this.handlers.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.workers[wi].postMessage({ id, type, payload });
    });
  }
  async init(dataset: RawDataset) {
    this.comp = compile(dataset);
    await Promise.all(this.workers.map((_, i) => this.call(i, "init", { dataset })));
    this.coverage = this.comp.coverage;
  }
  rank(pool: number[], topK: number, _cb?: (p: number) => void, maxShare = 2): Promise<Ranked[]> {
    return this.call<Ranked[]>(0, "rank", { pool, topK, maxShare });
  }
  /** Répartit des tâches (découpées en paquets) sur tous les workers ; résultats fusionnés par tâche. */
  async play(jobs: Task[], collect = false, onProgress?: (p: number) => void): Promise<TaskOut[]> {
    const pieces: { ji: number; job: Task }[] = [];
    jobs.forEach((j, ji) => {
      let left = j.n, k = 0;
      while (left > 0) {
        const n = Math.min(left, 100);
        pieces.push({ ji, job: { ...j, n, seed: (j.seed + k * 7919) >>> 0 } });
        left -= n; k++;
      }
    });
    const batches: { ji: number; job: Task }[][] = [];
    let cur: { ji: number; job: Task }[] = [], curN = 0;
    for (const p of pieces) { cur.push(p); curN += p.job.n; if (curN >= 200) { batches.push(cur); cur = []; curN = 0; } }
    if (cur.length) batches.push(cur);
    const merged: TaskOut[] = jobs.map(() => ({ aw: 0, bw: 0, d: 0, turns: 0, toxA: {} }));
    let next = 0, done = 0;
    const run = async (wi: number) => {
      while (next < batches.length) {
        const b = batches[next++];
        const out = await this.call<TaskOut[]>(wi, "play", { jobs: b.map((p) => p.job), collect });
        out.forEach((o, i) => {
          const m = merged[b[i].ji];
          m.aw += o.aw; m.bw += o.bw; m.d += o.d; m.turns += o.turns;
          for (const [k, v] of Object.entries(o.toxA)) m.toxA[k] = (m.toxA[k] ?? 0) + v;
        });
        onProgress?.(++done / batches.length);
      }
    };
    await Promise.all(this.workers.map((_, i) => run(i)));
    return merged;
  }
  /** Exécute une liste d'appels (un par tâche) en parallèle sur les workers. */
  async map<T, R>(type: string, items: T[], onProgress?: (p: number) => void): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0, done = 0;
    const run = async (wi: number) => {
      while (next < items.length) { const k = next++; out[k] = await this.call<R>(wi, type, items[k]); onProgress?.(++done / items.length); }
    };
    await Promise.all(this.workers.map((_, i) => run(i)));
    return out;
  }
  terminate() { this.workers.forEach((w) => void w.terminate()); this.workers = []; }
}
