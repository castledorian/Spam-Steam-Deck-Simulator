"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelPool } from "@/lib/sim/session";

export function useJob() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const last = useRef({ phase: "", pct: -1 });
  const t0 = useRef(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((Date.now() - t0.current) / 1000), 500);
    return () => clearInterval(t);
  }, [running]);

  const onP = useCallback((p: { phase: string; pct: number }) => {
    if (p.phase !== last.current.phase || p.pct - last.current.pct >= 0.01 || p.pct === 1) {
      last.current = p;
      setPhase(p.phase);
      setPct(p.pct);
    }
  }, []);

  const run = useCallback(async <T,>(fn: (onP: (p: { phase: string; pct: number }) => void) => Promise<T>): Promise<T | null> => {
    setRunning(true);
    setError(null);
    setPct(0);
    t0.current = Date.now();
    setElapsed(0);
    try {
      return await fn(onP);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m !== "cancelled") setError(m);
      return null;
    } finally {
      setRunning(false);
    }
  }, [onP]);

  const cancel = useCallback(() => cancelPool(), []);
  return { running, phase, pct, error, elapsed, run, cancel };
}
