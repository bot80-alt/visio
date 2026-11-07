"use client";

import { useState } from "react";
import { ChevronDownIcon, CpuIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { CLIP_MODEL_ID, TEXT_MODEL_ID } from "@/lib/model";
import { WEIGHTS } from "@/lib/retrieval";
import type { Understanding } from "@/lib/types";

export type ClientTrace = {
  focus: string;
  textMs: number;
  visualMs: number | null;
  asrMs?: number | null;
  roundTripMs: number;
};

function modelName(id: string) {
  return id.split("/")[1];
}

export function UnderTheHood({ understanding, trace }: { understanding: Understanding; trace?: ClientTrace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <CpuIcon className="size-3.5" />
        <span>How Visio matched this</span>
        <span className="ml-auto tabular-nums">
          {understanding.catalogSize} products · {understanding.retrievalMs} ms retrieval
        </span>
        <ChevronDownIcon className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-white/10 px-3 py-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-foreground">Query understanding</p>
            {trace && trace.focus !== understanding.description && (
              <p className="text-muted-foreground">
                Focus phrase: <span className="text-foreground">&ldquo;{trace.focus}&rdquo;</span>
              </p>
            )}
            {understanding.refinement && (
              <p className="text-muted-foreground">
                Refining: <span className="text-foreground">&ldquo;{understanding.description}&rdquo;</span>
              </p>
            )}
            <p className="text-muted-foreground">
              Filters: {understanding.color ? `color ${understanding.color}` : "no color"},{" "}
              {understanding.maxPriceCents != null ? `under ${formatMoney(understanding.maxPriceCents)}` : "no budget"}
            </p>
            <p className="mt-1 font-medium text-foreground">Category posterior P(c | q)</p>
            {understanding.categories.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="w-32 truncate text-muted-foreground">{c.name.replace(/-/g, " ")}</span>
                <div className="h-1 flex-1 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(2, c.prob * 100)}%` }} />
                </div>
                <span className="w-9 text-right tabular-nums text-muted-foreground">{Math.round(c.prob * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-foreground">Pipeline</p>
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {trace?.asrMs != null && (
                <li className="flex justify-between">
                  <span>whisper-tiny.en transcription</span>
                  <span className="tabular-nums">{trace.asrMs} ms</span>
                </li>
              )}
              <li className="flex justify-between">
                <span>{modelName(TEXT_MODEL_ID)} text embedding</span>
                <span className="tabular-nums">{trace ? `${trace.textMs} ms` : "—"}</span>
              </li>
              <li className="flex justify-between">
                <span>{modelName(CLIP_MODEL_ID)} text→image embedding</span>
                <span className="tabular-nums">
                  {understanding.signals.includes("visual") && trace?.visualMs != null ? `${trace.visualMs} ms` : "loading"}
                </span>
              </li>
              <li className="flex justify-between">
                <span>Fused retrieval + Trust Gate server</span>
                <span className="tabular-nums">{trace ? `${trace.roundTripMs} ms` : "—"}</span>
              </li>
            </ul>
            <p className="mt-1 font-medium text-foreground">Score</p>
            <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              {understanding.signals.includes("visual")
                ? `${WEIGHTS.semantic}·z(sem) + ${WEIGHTS.visual}·z(vis) + ${WEIGHTS.category}·P(cat) + ${WEIGHTS.color}·[color]`
                : `z(sem) + ${WEIGHTS.category}·P(cat) + ${WEIGHTS.color}·[color]`}
            </p>
            <p className="text-[10px] text-muted-foreground">Models run in your browser; only embeddings reach the server.</p>
          </div>
        </div>
      )}
    </div>
  );
}
