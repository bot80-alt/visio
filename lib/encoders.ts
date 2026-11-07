"use client";

import { focusPhrase } from "./focus";
import { CLIP_MODEL_ID, MODEL_DTYPE, TEXT_MODEL_ID, TEXT_QUERY_PREFIX } from "./model";
import type { QueryVectors } from "./types";
import { normalize, packVector } from "./vector-codec";

type Transformers = typeof import("@huggingface/transformers");
export type Tower = "text" | "visual";
export type TowerStatus = { state: "idle" | "loading" | "ready" | "error"; pct: number };
type ProgressEvent = { status: string; file?: string; loaded?: number; total?: number };

let tf: Promise<Transformers> | null = null;
export function transformers(): Promise<Transformers> {
  tf ??= import("@huggingface/transformers").then((m) => {
    m.env.allowLocalModels = false;
    return m;
  });
  return tf;
}

export function progressTracker(onPct: (pct: number) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (e: ProgressEvent) => {
    if (e.status !== "progress" || !e.file) return;
    files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    if (total > 0) onPct(Math.round((loaded / total) * 100));
  };
}

type TextEncoder = (text: string) => Promise<Float32Array>;

let textTower: Promise<TextEncoder> | null = null;
let visualTower: Promise<TextEncoder> | null = null;

export function loadTextTower(onPct?: (pct: number) => void): Promise<TextEncoder> {
  textTower ??= (async () => {
    const { pipeline } = await transformers();
    const extractor = await pipeline("feature-extraction", TEXT_MODEL_ID, {
      dtype: MODEL_DTYPE,
      device: "wasm",
      progress_callback: progressTracker((p) => onPct?.(p)),
    });
    return async (text: string) => {
      const out = await extractor(TEXT_QUERY_PREFIX + text, { pooling: "cls", normalize: true });
      return normalize(out.data as Float32Array);
    };
  })().catch((e) => {
    textTower = null;
    throw e;
  });
  return textTower;
}

export function loadVisualTower(onPct?: (pct: number) => void): Promise<TextEncoder> {
  visualTower ??= (async () => {
    const { AutoTokenizer, CLIPTextModelWithProjection } = await transformers();
    const progress_callback = progressTracker((p) => onPct?.(p));
    const tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID, { progress_callback });
    const model = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      dtype: MODEL_DTYPE,
      device: "wasm",
      progress_callback,
    });
    return async (text: string) => {
      const inputs = tokenizer([text], { padding: "max_length", truncation: true });
      const { text_embeds } = await model(inputs);
      return normalize(text_embeds.data as Float32Array);
    };
  })().catch((e) => {
    visualTower = null;
    throw e;
  });
  return visualTower;
}

export type EncodeTimings = { textMs: number; visualMs: number | null };

/**
 * The text tower sees the full sentence and its focus phrase (averaged), the
 * vision-language tower sees only the focus phrase, which is closer to how
 * product photos are captioned.
 */
export async function encodeQuery(
  text: string,
  visualReady: boolean,
): Promise<{ vectors: QueryVectors; focus: string; timings: EncodeTimings }> {
  const focus = focusPhrase(text) || text;
  const embedText = await loadTextTower();
  const t0 = performance.now();
  const full = await embedText(text);
  let t = full;
  if (focus !== text) {
    const f = await embedText(focus);
    t = normalize(full.map((x, i) => x + f[i]));
  }
  const textMs = performance.now() - t0;

  let v: Float32Array | null = null;
  let visualMs: number | null = null;
  if (visualReady) {
    const embedVisual = await loadVisualTower();
    const t1 = performance.now();
    v = await embedVisual(focus);
    visualMs = performance.now() - t1;
  }
  return {
    vectors: { t: packVector(t), v: v ? packVector(v) : null },
    focus,
    timings: { textMs: Math.round(textMs), visualMs: visualMs != null ? Math.round(visualMs) : null },
  };
}
