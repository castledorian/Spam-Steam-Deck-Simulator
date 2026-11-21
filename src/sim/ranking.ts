/* Évaluation statique EXHAUSTIVE de toutes les combinaisons de 4 cartes d'un pool (pré-sélection avant simulation). */
import type { Compiled } from "./compile";

export interface Ranked { cards: number[]; score: number }

export function countCombos(n: number): number {
  if (n < 4) return 0;
  return (n * (n - 1) * (n - 2) * (n - 3)) / 24;
}

export function rankDecks(comp: Compiled, pool: number[], topK: number, onProgress?: (p: number) => void, maxShare = 2): Ranked[] {
  const n = pool.length;
  if (n < 4) return [];
  const cs = pool.map((num) => comp.byNum.get(num)!);
  const dm = new Float64Array(n * 7), en = new Float64Array(n * 7), hp = new Float64Array(n), sv = new Float64Array(n);
  const cn = new Float64Array(n * 7), cd = new Float64Array(n * 7);
  for (let k = 0; k < n; k++) {
    const c = cs[k];
    for (let e = 0; e < 7; e++) { dm[k * 7 + e] = c.dmgRate[e]; en[k * 7 + e] = c.engRate[e]; cn[k * 7 + e] = c.costNeed[e]; cd[k * 7 + e] = c.costDmg[e]; }
    hp[k] = c.hpEff + c.healRate * 5 + c.spamton * 4;
    sv[k] = c.spamton;
  }
  const H = 5;
  const buf: { s: number; a: number; b: number; c: number; d: number }[] = [];
  let thr = -1;
  const cap = Math.max(4000, topK * 12);
  const prune = () => {
    buf.sort((x, y) => y.s - x.s);
    buf.length = Math.min(buf.length, cap / 2);
    thr = buf[buf.length - 1].s;
  };
  const dsum = new Float64Array(7), esum = new Float64Array(7), nsum = new Float64Array(7), csum = new Float64Array(7);
  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        const hp3 = hp[a] + hp[b] + hp[c];
        for (let e = 0; e < 7; e++) {
          dsum[e] = dm[a * 7 + e] + dm[b * 7 + e] + dm[c * 7 + e];
          esum[e] = en[a * 7 + e] + en[b * 7 + e] + en[c * 7 + e];
          nsum[e] = cn[a * 7 + e] + cn[b * 7 + e] + cn[c * 7 + e];
          csum[e] = cd[a * 7 + e] + cd[b * 7 + e] + cd[c * 7 + e];
        }
        for (let d = c + 1; d < n; d++) {
          let D = 0;
          for (let e = 0; e < 7; e++) {
            const need = nsum[e] + cn[d * 7 + e];
            const supply = 0.25 + esum[e] + en[d * 7 + e];
            let dd = dsum[e] + dm[d * 7 + e];
            let pts = 0.8 + H * supply;
            if (need > 0) {
              const r = supply >= need ? 1 : supply / need;
              dd -= (1 - r) * (csum[e] + cd[d * 7 + e]);
              pts = Math.max(0, 0.8 + H * (supply - need));
            }
            D += dd * (1 + 0.1 * pts);
          }
          const s = D * (hp3 + hp[d]);
          if (s > thr) {
            buf.push({ s, a, b, c, d });
            if (buf.length >= cap) prune();
          }
        }
      }
    }
    if (onProgress && a % 3 === 0) onProgress(a / (n - 3));
  }
  buf.sort((x, y) => y.s - x.s);
  const triples = new Map<string, number>();
  const out: Ranked[] = [];
  for (const r of buf) {
    const ids = [pool[r.a], pool[r.b], pool[r.c], pool[r.d]];
    const keys = [`${ids[0]}.${ids[1]}.${ids[2]}`, `${ids[0]}.${ids[1]}.${ids[3]}`, `${ids[0]}.${ids[2]}.${ids[3]}`, `${ids[1]}.${ids[2]}.${ids[3]}`];
    if (keys.some((k) => (triples.get(k) ?? 0) >= maxShare)) continue;
    for (const k of keys) triples.set(k, (triples.get(k) ?? 0) + 1);
    out.push({ cards: ids, score: r.s });
    if (out.length >= topK) break;
  }
  onProgress?.(1);
  return out;
}
