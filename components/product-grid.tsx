"use client";

import Image from "next/image";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { ProductHit } from "@/lib/types";

export function ProductGrid({
  items,
  disabled,
  onBuy,
}: {
  items: ProductHit[];
  disabled?: boolean;
  onBuy: (index: number, item: ProductHit) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No catalog matches for that.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div
          key={item.id}
          className="group flex flex-col overflow-hidden rounded-lg border border-white/10 bg-card transition hover:border-sky-400/50"
        >
          <div className="relative aspect-square bg-white">
            <Image src={item.image} alt={item.title} fill sizes="(max-width: 768px) 45vw, 180px" className="object-contain p-2" />
            <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              #{i + 1}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1 p-2">
            <p className="line-clamp-2 text-xs font-medium leading-snug">{item.title}</p>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {item.brand && <span className="truncate">{item.brand}</span>}
              <span className="ml-auto flex items-center gap-0.5">
                <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                {item.rating.toFixed(1)}
              </span>
            </div>
            <div className="mt-auto flex items-center justify-between gap-1 pt-1">
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
