"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, BotIcon, Loader2Icon, ScanSearchIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckoutCard } from "@/components/checkout-card";
import { ProductGrid } from "@/components/product-grid";
import type { Card, ProductHit } from "@/lib/types";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: Card[];
  engine?: "groq" | "rules";
};

type Props = {
  messages: UiMessage[];
  busy: boolean;
  disabled?: boolean;
  suggestions: string[];
  onSend: (text: string) => void;
  onBuy: (index: number, item: ProductHit, shown: ProductHit[]) => void;
};

export function ChatPanel({ messages, busy, disabled, suggestions, onSend, onBuy }: Props) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-sky-400/10 text-sky-300">
              <ScanSearchIcon className="size-5" />
            </div>
            <p className="text-sm font-medium">Pick a frame to start shopping</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Choose a sample scene or upload a screenshot. You can also just describe a product, like
              &ldquo;black sunglasses under $50&rdquo;.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
                {m.role === "assistant" && (
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sky-300">
                    <BotIcon className="size-4" />
                  </div>
                )}
                <div className={m.role === "user" ? "max-w-[85%]" : "min-w-0 flex-1"}>
                  <div
                    className={
                      m.role === "user"
                        ? "rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "text-sm leading-relaxed"
                    }
                  >
                    {m.text}
                  </div>
                  {m.cards?.map((c, i) =>
                    c.type === "products" ? (
                      <div key={i} className="mt-2">
                        <ProductGrid items={c.items} disabled={busy} onBuy={(i, item) => onBuy(i, item, c.items)} />
                      </div>
                    ) : c.type === "checkout" ? (
                      <div key={i} className="mt-2">
                        <CheckoutCard card={c} />
                      </div>
                    ) : null,
                  )}
                  {m.role === "assistant" && m.engine && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      <SparklesIcon className="size-3" />
                      {m.engine === "groq" ? "Groq LPU agent" : "Visio rule engine"}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" /> Visio is thinking…
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t border-white/10 p-3">
        {suggestions.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || disabled}
                onClick={() => onSend(s)}
                className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-sky-400 hover:text-foreground disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={500}
            rows={1}
            placeholder="Describe the object, ask for cheaper, or say “buy #1”"
            className="max-h-32 min-h-10 resize-none"
            disabled={disabled}
          />
          <Button type="submit" size="icon-lg" disabled={busy || disabled || !draft.trim()} aria-label="Send">
            <ArrowUpIcon />
          </Button>
        </form>
      </div>
    </div>
  );
}
