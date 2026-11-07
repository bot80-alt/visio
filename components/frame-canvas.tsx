"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Box, Detection } from "@/lib/types";

type Props = {
  src: string;
  width: number;
  height: number;
  highlight: Box | null;
  highlightLabel?: string | null;
  selection: Box | null;
  detections: Detection[];
  disabled?: boolean;
  onSelect: (box: Box) => void;
  onPickDetection: (d: Detection) => void;
  imgRef: React.RefObject<HTMLImageElement | null>;
};

function pct(box: Box, width: number, height: number): React.CSSProperties {
  return {
    left: `${(box.x / width) * 100}%`,
    top: `${(box.y / height) * 100}%`,
    width: `${(Math.min(box.w, width - box.x) / width) * 100}%`,
    height: `${(Math.min(box.h, height - box.y) / height) * 100}%`,
  };
}

export function FrameCanvas({
  src,
  width,
  height,
  highlight,
  highlightLabel,
  selection,
  detections,
  disabled,
  onSelect,
  onPickDetection,
  imgRef,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  function toNatural(clientX: number, clientY: number) {
    const r = wrap.current!.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    const y = Math.min(Math.max(clientY - r.top, 0), r.height);
    return { x: (x / r.width) * width, y: (y / r.height) * height };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toNatural(e.clientX, e.clientY);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = toNatural(e.clientX, e.clientY);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  }

  function onPointerUp() {
    if (!drag) return;
    const box = {
      x: Math.round(Math.min(drag.x0, drag.x1)),
      y: Math.round(Math.min(drag.y0, drag.y1)),
      w: Math.round(Math.abs(drag.x1 - drag.x0)),
      h: Math.round(Math.abs(drag.y1 - drag.y0)),
    };
    setDrag(null);
    if (box.w >= 24 && box.h >= 24) onSelect(box);
  }

  const dragBox = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      <div
        ref={wrap}
        className={cn("relative touch-none select-none", disabled ? "cursor-progress" : "cursor-crosshair")}
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- frames are user uploads or blob URLs */}
        <img
          ref={imgRef}
          src={src}
          alt="Frame you are shopping from"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
        {highlight && !selection && (
          <div
            className="pointer-events-none absolute rounded-md border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45),0_0_24px_rgba(56,189,248,0.6)] transition-all duration-500"
            style={pct(highlight, width, height)}
          >
            {highlightLabel && (
              <span className="absolute -top-6 left-0 rounded bg-sky-400 px-1.5 py-0.5 text-[11px] font-semibold text-black capitalize">
                {highlightLabel}
              </span>
            )}
          </div>
        )}
        {selection && (
          <div
            className="pointer-events-none absolute rounded-md border-2 border-amber-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={pct(selection, width, height)}
          >
            <span className="absolute -top-6 left-0 rounded bg-amber-300 px-1.5 py-0.5 text-[11px] font-semibold text-black">
              Your selection
            </span>
          </div>
        )}
        {dragBox && (
          <div
            className="pointer-events-none absolute rounded-md border-2 border-dashed border-amber-300 bg-amber-300/10"
            style={pct(dragBox, width, height)}
          />
        )}
      </div>
      {detections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-white/10 bg-black/60 p-2">
          <span className="self-center px-1 text-xs text-muted-foreground">Seen in frame:</span>
          {detections.map((d) => (
            <button
              key={d.object}
              type="button"
              disabled={disabled}
              onClick={() => onPickDetection(d)}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs capitalize text-foreground transition hover:border-sky-400 hover:bg-sky-400/10 disabled:opacity-50"
            >
              {d.object}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
