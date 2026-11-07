"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon, Loader2Icon, MicIcon, SparklesIcon } from "lucide-react";
import { CheckoutCard } from "@/components/checkout-card";
import { FlowBar, type FlowState } from "@/components/flow-bar";
import { ProductGrid } from "@/components/product-grid";
import { UnderTheHood, type ClientTrace } from "@/components/under-the-hood";
import { Button } from "@/components/ui/button";
import { loadWhisper, startRecording, type Recording } from "@/lib/asr";
import { encodeQuery, loadTextTower, loadVisualTower, type TowerStatus } from "@/lib/encoders";
import type { Card, ChatMessage, ChatResponse, ProductHit, QueryEmbeddings, SearchState } from "@/lib/types";

type UiMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  voice?: boolean;
  cards?: Card[];
  engine?: ChatResponse["engine"];
  trace?: ClientTrace;
  error?: boolean;
};

const EXAMPLES = [
  "The matte silver over-ear headphones the android wears while staring out the rainy window",
  "Those red and black high-top sneakers he laces up before the final game",
  "A long black evening gown with a slit, the one she wears down the staircase at the gala",
  "Dark aviator-style sunglasses the getaway driver never takes off",
  "The carbon-steel wok the chef tosses noodles in over a huge flame",
  "Green crystal drop earrings catching the candlelight at dinner",
];

const MAX_HISTORY = 12;
const HOLD_DELAY_MS = 180;

function useTowers() {
  const [text, setText] = useState<TowerStatus>({ state: "loading", pct: 0 });
  const [visual, setVisual] = useState<TowerStatus>({ state: "idle", pct: 0 });
  useEffect(() => {
    let alive = true;
    loadTextTower((pct) => alive && setText({ state: "loading", pct }))
      .then(() => {
        if (!alive) return;
        setText({ state: "ready", pct: 100 });
        setVisual({ state: "loading", pct: 0 });
        return loadVisualTower((pct) => alive && setVisual({ state: "loading", pct }))
          .then(() => alive && setVisual({ state: "ready", pct: 100 }))
          .catch(() => alive && setVisual({ state: "error", pct: 0 }));
      })
      .catch(() => alive && setText({ state: "error", pct: 0 }));
    return () => {
      alive = false;
    };
  }, []);
  return { text, visual };
}

function TowerChip({ label, status }: { label: string; status: TowerStatus }) {
  const dot =
    status.state === "ready"
      ? "bg-emerald-400"
      : status.state === "error"
        ? "bg-red-400"
        : status.state === "loading"
          ? "bg-amber-300 animate-pulse"
          : "bg-white/30";
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
      {status.state === "loading" && <span className="tabular-nums">{status.pct}%</span>}
      {status.state === "error" && <span>failed</span>}
    </span>
  );
}

export function VisioApp() {
  const towers = useTowers();
  const [whisper, setWhisper] = useState<TowerStatus>({ state: "idle", pct: 0 });
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<FlowState>({ kind: "idle" });
  const [micError, setMicError] = useState<string | null>(null);

  const state = useRef<SearchState>({});
  const nextId = useRef(1);
  const recording = useRef<Recording | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const textReady = towers.text.state === "ready";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string, opts: { voice?: boolean; asrMs?: number } = {}) => {
      const content = text.trim().slice(0, 1000);
      if (!content || busy) return;
      setBusy(true);
      const userMsg: UiMessage = { id: nextId.current++, role: "user", text: content, voice: opts.voice };
      setMessages((m) => [...m, userMsg]);

      try {
        let query: QueryEmbeddings | null = null;
        let trace: ClientTrace | undefined;
        if (textReady) {
          const visualReady = towers.visual.state === "ready";
          const encoded = await encodeQuery(content, visualReady);
          query = { message: encoded.vectors };
          const anchor = state.current.anchor;
          if (anchor && content.split(/\s+/).length <= 12) {
            query.combined = (await encodeQuery(`${anchor}, ${content}`, visualReady)).vectors;
          }
          trace = { focus: encoded.focus, ...encoded.timings, asrMs: opts.asrMs ?? null, roundTripMs: 0 };
        }

        const history: ChatMessage[] = [...messages, userMsg]
          .filter((m) => !m.error)
          .slice(-MAX_HISTORY)
          .map((m) => ({ role: m.role, content: m.text.slice(0, 1000) }));
        const t0 = performance.now();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history, query, state: state.current }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(res.status === 429 ? "You're going a bit fast. Try again in a moment." : body.error ?? "Something went wrong.");
        }
        const data = (await res.json()) as ChatResponse;
        if (trace) trace.roundTripMs = Math.round(performance.now() - t0);
        state.current = data.state;
        setMessages((m) => [
          ...m,
          { id: nextId.current++, role: "assistant", text: data.reply, cards: data.cards, engine: data.engine, trace },
        ]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          { id: nextId.current++, role: "assistant", text: e instanceof Error ? e.message : "Something went wrong.", error: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, textReady, towers.visual.state],
  );

  const buy = useCallback(
    (index: number, item: ProductHit, items: ProductHit[]) => {
      state.current = { ...state.current, resultIds: items.map((p) => p.id) };
      send(`Buy #${index + 1}, the ${item.title}`);
    },
    [send],
  );

  const beginTalk = useCallback(async () => {
    if (recording.current || busy) return;
    setMicError(null);
    if (whisper.state === "idle" || whisper.state === "error") {
      setWhisper({ state: "loading", pct: 0 });
      loadWhisper((pct) => setWhisper({ state: "loading", pct }))
        .then(() => setWhisper({ state: "ready", pct: 100 }))
        .catch(() => setWhisper({ state: "error", pct: 0 }));
    }
    try {
      const rec = await startRecording();
      recording.current = rec;
      setFlow({ kind: "listening", startedAt: Date.now(), level: rec.level });
    } catch {
      setMicError("Microphone access was blocked. Allow it in your browser, or type instead.");
    }
  }, [busy, whisper.state]);

  const endTalk = useCallback(
    async (cancel = false) => {
      const rec = recording.current;
      if (!rec) return;
      recording.current = null;
      if (cancel) {
        rec.cancel();
        setFlow({ kind: "idle" });
        return;
      }
      setFlow({ kind: "transcribing", downloadPct: null });
      try {
        const audio = await rec.stop();
        if (audio.length < 16000 * 0.3) {
          setFlow({ kind: "idle" });
          setMicError("That was too short. Hold the mic while you speak.");
          return;
        }
        const transcribe = await loadWhisper((pct) => setFlow({ kind: "transcribing", downloadPct: pct }));
        setFlow({ kind: "transcribing", downloadPct: 100 });
        const t0 = performance.now();
        const text = await transcribe(audio);
        const asrMs = Math.round(performance.now() - t0);
        setFlow({ kind: "idle" });
        if (!text) {
          setMicError("Whisper didn't catch any words. Try again a little closer to the mic.");
          return;
        }
        send(text, { voice: true, asrMs });
      } catch {
        setFlow({ kind: "idle" });
        setMicError("Transcription failed on this device. You can type your description instead.");
      }
    },
    [send],
  );

  useEffect(() => {
    const isTypingElsewhere = (el: Element | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable || ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el !== inputRef.current));

    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape" && recording.current) {
        endTalk(true);
        return;
      }
      if (e.code !== "Space" || e.repeat || isTypingElsewhere(document.activeElement)) return;
      if (document.activeElement === inputRef.current && draft.length > 0) return;
      if (document.activeElement instanceof HTMLButtonElement) return;
      e.preventDefault();
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        beginTalk();
      }, HOLD_DELAY_MS);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
        return;
      }
      if (recording.current) endTalk();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [beginTalk, endTalk, draft]);

  const submit = () => {
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  const latestProductsId = [...messages].reverse().find((m) => m.cards?.some((c) => c.type === "products"))?.id;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-sky-500">
            <SparklesIcon className="size-4 text-white" />
          </span>
          <span className="font-semibold tracking-tight">Visio</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">Describe it. We&apos;ll find it.</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <TowerChip label="Text model" status={towers.text} />
          <TowerChip label="Vision-language" status={towers.visual} />
          <TowerChip label="Whisper" status={whisper} />
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-6 pt-6 text-center sm:pt-14">
              <div className="flex flex-col gap-3">
                <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Saw something in a film? Just describe it.
                </h1>
                <p className="mx-auto max-w-xl text-balance text-sm text-muted-foreground">
                  Say or type what you remember, in your own words, as loosely or as precisely as you like. Models running in
                  your browser match the description against every product&apos;s text and photo, then you can check out with
                  PayPal Fastlane.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground">
                <MicIcon className="size-3.5 text-violet-300" />
                Hold <kbd className="rounded border border-white/20 px-1 font-mono text-[10px]">Space</kbd> or the mic to talk,
                release to send
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={!textReady || busy}
                    onClick={() => send(ex)}
                    className="rounded-xl border border-white/10 bg-card/60 px-3.5 py-3 text-left text-sm text-muted-foreground transition hover:border-violet-400/50 hover:text-foreground disabled:opacity-50"
                  >
                    &ldquo;{ex}&rdquo;
                  </button>
                ))}
              </div>
              {!textReady && towers.text.state !== "error" && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Downloading the text model to your device ({towers.text.pct}%). This happens once.
                </p>
              )}
              {towers.text.state === "error" && (
                <p className="text-xs text-red-300">
                  The text model couldn&apos;t load in this browser. Reload, or try a recent Chrome, Edge, Firefox or Safari.
                </p>
              )}
            </div>
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-500/90 px-3.5 py-2 text-sm text-white">
                    {m.voice && <MicIcon className="mr-1.5 inline size-3.5 -translate-y-px opacity-80" />}
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col gap-2">
                  <p className={`text-sm leading-relaxed ${m.error ? "text-red-300" : ""}`}>{m.text}</p>
                  {m.cards?.map((c, i) =>
                    c.type === "products" ? (
                      <div key={i}>
                        <ProductGrid
                          items={c.items}
                          disabled={busy || m.id !== latestProductsId}
                          onBuy={(idx, item) => buy(idx, item, c.items)}
                        />
                        <UnderTheHood understanding={c.understanding} trace={m.trace} />
                      </div>
                    ) : (
                      <CheckoutCard key={c.proposal} card={c} />
                    ),
                  )}
                  {m.engine && (
                    <span className="text-[10px] text-muted-foreground/70">
                      {m.engine === "groq" ? "Agent: Llama 3.3 70B on Groq" : "Agent: on-server rule engine"}
                    </span>
                  )}
                </div>
              ),
            )
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Matching your description…
            </div>
          )}
        </div>
      </div>

      <FlowBar state={flow} />

      <div className="border-t border-white/5 bg-background/80 px-4 pb-4 pt-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
          {micError && <p className="text-xs text-amber-300">{micError}</p>}
          <form
            className="flex items-end gap-2 rounded-2xl border border-white/10 bg-card/80 p-2 focus-within:border-violet-400/50"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder={
                messages.length ? 'Refine ("in black", "under $50") or describe something new' : "Describe the product you saw…"
              }
              aria-label="Describe a product"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground field-sizing-content"
            />
            <Button
              type="button"
              size="icon"
              variant={flow.kind === "listening" ? "default" : "secondary"}
              aria-label="Hold to talk"
              title="Hold to talk"
              disabled={busy || flow.kind === "transcribing"}
              className="size-10 touch-none rounded-xl select-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                beginTalk();
              }}
              onPointerUp={() => endTalk()}
              onPointerCancel={() => endTalk(true)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <MicIcon className="size-4" />
            </Button>
            <Button type="submit" size="icon" disabled={!draft.trim() || busy} aria-label="Send" className="size-10 rounded-xl">
              <ArrowUpIcon className="size-4" />
            </Button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground">
            Sandbox checkout only. Models run in your browser; your voice never leaves the device.
          </p>
        </div>
      </div>
    </div>
  );
}
