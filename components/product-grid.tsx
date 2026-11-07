"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { ProductHit } from "@/lib/types";

// Display ranges follow where each tower's raw cosines actually fall on this catalog.
function Bar({
  label,
  value,
  min = 0,
  max = 1,
  tone,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  tone: string;
}) {
  const width = value == null ? 0 : Math.max(2, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="w-12 shrink-0">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums">{value == null ? "…" : value.toFixed(2)}</span>
    </div>
  );
}

export function ProductGrid({
  items,
  disabled,
  onBuy,
}: {
  items: ProductHit[];
  disabled?: boolean;
  onBuy: (index: number, item: ProductHit) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`flex gap-3 rounded-xl border bg-card/80 p-2.5 transition hover:border-violet-400/50 ${
            i === 0 ? "border-violet-400/40" : "border-white/10"
          }`}
        >
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-white">
            <Image src={item.image} alt={item.title} fill sizes="80px" className="object-contain p-1.5" />
            <span className="absolute left-1 top-1 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">#{i + 1}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-xs font-medium leading-snug">{item.title}</p>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  i === 0 ? "bg-violet-400/20 text-violet-200" : "bg-white/10 text-muted-foreground"
                }`}
              >
                {Math.round(item.signals.match * 100)}%
              </span>
            </div>
            <Bar label="Semantic" value={item.signals.semantic} min={0.4} max={0.85} tone="bg-violet-400" />
            <Bar label="Visual" value={item.signals.visual} min={0} max={0.18} tone="bg-sky-400" />
            <Bar label="Category" value={item.signals.categoryProb} tone="bg-emerald-400" />
            <div className="mt-auto flex items-center justify-between pt-0.5">
              <span className="text-sm font-semibold">{formatMoney(item.priceCents, item.currency)}</span>
              <Button size="xs" disabled={disabled} onClick={() => onBuy(i, item)}>
                Buy
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
