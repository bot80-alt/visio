"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUpIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel, type UiMessage } from "@/components/chat-panel";
import { FrameCanvas } from "@/components/frame-canvas";
import { embedBoxes, loadPerception, sceneBoxes } from "@/lib/perception";
import { SAMPLE_SCENES } from "@/lib/scenes";
import type { Box, ChatResponse, Detection, ProductHit, SceneCrop, SearchState } from "@/lib/types";

type Frame = { src: string; width: number; height: number; hint?: string };
type Phase =
  | { kind: "idle" }
  | { kind: "model"; pct: number }
  | { kind: "embedding"; done: number; total: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const MAX_SIDE = 1280;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = src;
  });
}

async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error("Could not process that image");
    return URL.createObjectURL(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export function VisioApp() {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [crops, setCrops] = useState<SceneCrop[]>([]);
  const [selection, setSelection] = useState<SceneCrop | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [highlight, setHighlight] = useState<{ box: Box; label: string | null } | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const searchState = useRef<SearchState>({});
  const frameToken = useRef(0);
  const frameImg = useRef<HTMLImageElement | null>(null);
  const displayImg = useRef<HTMLImageElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const scene = useCallback(
    (sel: SceneCrop | null) =>
      frame && crops.length ? { width: frame.width, height: frame.height, crops, selection: sel } : null,
    [frame, crops],
  );

  function applyResponse(res: ChatResponse) {
    searchState.current = res.state;
    for (const c of res.cards) {
      if (c.type === "detections") setDetections(c.items);
      if (c.type === "products" && c.box) setHighlight({ box: c.box, label: c.object });
    }
    setMessages((m) => [
      ...m,
      { id: nextId(), role: "assistant", text: res.reply, cards: res.cards.filter((c) => c.type !== "detections"), engine: res.engine },
    ]);
  }

  async function callChat(body: Record<string, unknown>, token: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, state: searchState.current }),
      });
      const data = await res.json();
      if (token !== frameToken.current) return;
      if (!res.ok) throw new Error(data.error ?? "Visio couldn't answer that");
      applyResponse(data as ChatResponse);
    } catch (e) {
      if (token === frameToken.current) toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (token === frameToken.current) setBusy(false);
    }
  }

  async function openFrame(src: string, hint?: string) {
    const token = ++frameToken.current;
    setBusy(false);
    setCrops([]);
    setSelection(null);
    setDetections([]);
    setHighlight(null);
    setMessages([]);
    searchState.current = {};
    try {
      const img = await loadImage(src);
      if (token !== frameToken.current) return;
      frameImg.current = img;
      setFrame({ src, width: img.naturalWidth, height: img.naturalHeight, hint });
      setPhase({ kind: "model", pct: 0 });
      await loadPerception(({ loadedBytes, totalBytes }) => {
        if (token === frameToken.current && totalBytes > 0) {
          setPhase({ kind: "model", pct: Math.round((loadedBytes / totalBytes) * 100) });
        }
      });
      if (token !== frameToken.current) return;
      const boxes = sceneBoxes(img);
      setPhase({ kind: "embedding", done: 0, total: boxes.length });
      const embedded = await embedBoxes(img, boxes, (done, total) => {
        if (token === frameToken.current) setPhase({ kind: "embedding", done, total });
      });
      if (token !== frameToken.current) return;
      setCrops(embedded);
      setPhase({ kind: "ready" });
      await callChat(
        { intent: "scan", scene: { width: img.naturalWidth, height: img.naturalHeight, crops: embedded, selection: null } },
        token,
      );
    } catch (e) {
      if (token !== frameToken.current) return;
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Perception failed to start" });
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("That file isn't an image.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("Images up to 15 MB, please.");
    try {
      await openFrame(await downscale(file));
    } catch {
      toast.error("Could not read that image.");
    }
  }

  async function onSelect(box: Box) {
    if (!frameImg.current || phase.kind !== "ready" || busy) return;
    const token = frameToken.current;
    setBusy(true);
    try {
      const [sel] = await embedBoxes(frameImg.current, [box]);
      if (token !== frameToken.current) return;
      setSelection(sel);
      setMessages((m) => [...m, { id: nextId(), role: "user", text: "What's this I've boxed?" }]);
      await callChat({ intent: "scan", scene: scene(sel) }, token);
    } finally {
      if (token === frameToken.current) setBusy(false);
    }
  }

  function send(text: string, sel: SceneCrop | null = selection) {
    const history = [...messages, { id: nextId(), role: "user" as const, text }];
    setMessages(history);
    callChat(
      {
        intent: "message",
        messages: history.slice(-10).map((m) => ({ role: m.role, content: m.text.slice(0, 1000) })),
        scene: scene(sel),
      },
      frameToken.current,
    );
  }

  function pickDetection(d: Detection) {
    setSelection(null);
    send(`Show me the ${d.object}`, null);
  }

  function onBuy(index: number, item: ProductHit, shown: ProductHit[]) {
    searchState.current = { ...searchState.current, resultIds: shown.map((s) => s.id) };
    send(`Buy #${index + 1} (${item.title})`);
  }

  const perceiving = phase.kind === "model" || phase.kind === "embedding";
  const suggestions = frame
    ? [frame.hint ? `Find ${frame.hint}` : "What else is in this frame?", "Something cheaper", "Show it in black", "Buy #1"]
    : ["Black sunglasses under $50", "A luxury wristwatch", "Silver over-ear headphones"];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-3 pb-6 sm:px-6 lg:flex-row lg:items-start">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        {frame ? (
          <div className="flex flex-col gap-2">
            <FrameCanvas
              src={frame.src}
              width={frame.width}
              height={frame.height}
              highlight={highlight?.box ?? null}
              highlightLabel={highlight?.label}
              selection={selection?.box ?? null}
              detections={detections}
              disabled={phase.kind !== "ready" || busy}
              onSelect={onSelect}
              onPickDetection={pickDetection}
              imgRef={displayImg}
            />
            <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {phase.kind === "model" && (
                <span className="flex items-center gap-2">
                  <Loader2Icon className="size-3.5 animate-spin" /> Loading SigLIP 2 into your browser
                  {phase.pct > 0 ? ` · ${phase.pct}%` : ""} (first time only, ~95 MB)
                </span>
              )}
              {phase.kind === "embedding" && (
                <span className="flex items-center gap-2">
                  <Loader2Icon className="size-3.5 animate-spin" /> Scanning the frame · {phase.done}/{phase.total} regions
                </span>
              )}
              {phase.kind === "ready" && (
                <span>Drag a box around anything to shop that exact region. Your image never leaves this device; only embeddings do.</span>
              )}
              {phase.kind === "error" && (
                <span className="text-red-300">
                  {phase.message}. You can still search by description in the chat.
                </span>
              )}
              {selection && (
                <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setSelection(null)}>
                  <XIcon /> Clear selection
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
            <p className="text-lg font-medium">Shop any frame of cinema</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Pick a scene below or upload a screenshot from a film, an AI short or a Pinterest pin. Visio finds the objects and matches
              them to real products.
            </p>
            <Button onClick={() => fileInput.current?.click()}>
              <ImageUpIcon /> Upload a screenshot
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sample scenes</h2>
          {frame && (
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={perceiving}>
              <ImageUpIcon /> Upload your own
            </Button>
          )}
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onUpload} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SAMPLE_SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={perceiving}
              onClick={() => openFrame(s.src, s.hint)}
              className={`group relative aspect-video overflow-hidden rounded-lg ring-1 transition disabled:opacity-60 ${
                frame?.src === s.src ? "ring-2 ring-sky-400" : "ring-white/10 hover:ring-white/30"
              }`}
            >
              <Image src={s.src} alt={s.title} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-5 text-left text-xs font-medium">
                {s.title}
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="flex h-[70vh] min-h-[480px] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-card/60 lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)] lg:w-[420px] lg:shrink-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <p className="text-sm font-medium">Visio agent</p>
          <p className="text-[11px] text-muted-foreground">Proposes, never pays</p>
        </div>
        <ChatPanel messages={messages} busy={busy} disabled={perceiving} suggestions={suggestions} onSend={(t) => send(t)} onBuy={onBuy} />
      </aside>
    </div>
  );
}
