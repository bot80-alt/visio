"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, MicIcon } from "lucide-react";

export type FlowState =
  | { kind: "idle" }
  | { kind: "listening"; startedAt: number; level: () => number }
  | { kind: "transcribing"; downloadPct: number | null };

const BARS = 28;

function Waveform({ level }: { level: () => number }) {
  const [heights, setHeights] = useState<number[]>(() => Array(BARS).fill(0.08));
  const raf = useRef(0);
  useEffect(() => {
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 45) {
        last = t;
        const l = level();
        setHeights((h) => [...h.slice(1), Math.max(0.08, l * (0.6 + Math.random() * 0.4))]);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [level]);
  return (
    <div className="flex h-6 items-center gap-[3px]">
      {heights.map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-white" style={{ height: `${Math.round(h * 100)}%`, opacity: 0.35 + h * 0.65 }} />
      ))}
    </div>
  );
}

function Timer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}

export function FlowBar({ state }: { state: FlowState }) {
  if (state.kind === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-full border border-white/15 bg-zinc-950/90 px-4 py-2.5 text-xs text-white shadow-2xl shadow-violet-500/20 backdrop-blur">
        {state.kind === "listening" ? (
          <>
            <span className="relative flex size-7 items-center justify-center rounded-full bg-violet-500">
              <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/50" />
              <MicIcon className="relative size-3.5" />
            </span>
            <Waveform level={state.level} />
            <Timer startedAt={state.startedAt} />
            <span className="hidden text-white/60 sm:inline">Release to send · Esc to cancel</span>
          </>
        ) : (
          <>
            <Loader2Icon className="size-4 animate-spin text-violet-300" />
            <span>
              {state.downloadPct != null && state.downloadPct < 100
                ? `Downloading Whisper to your device · ${state.downloadPct}%`
                : "Whisper is transcribing on your device…"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
