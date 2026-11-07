"use client";

import { cropGrid, type Box } from "./crops";
import { SIGLIP_DTYPE, SIGLIP_MODEL_ID } from "./model";
import type { SceneCrop } from "./types";
import { normalize, packVector } from "./vector-codec";

type Transformers = typeof import("@huggingface/transformers");
type Loaded = {
  tf: Transformers;
  processor: Awaited<ReturnType<Transformers["AutoProcessor"]["from_pretrained"]>>;
  vision: Awaited<ReturnType<Transformers["SiglipVisionModel"]["from_pretrained"]>>;
};

export type LoadProgress = { loadedBytes: number; totalBytes: number };

let loading: Promise<Loaded> | null = null;

export function loadPerception(onProgress?: (p: LoadProgress) => void): Promise<Loaded> {
  loading ??= (async () => {
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = false;
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== "progress" || !e.file) return;
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
      let loadedBytes = 0;
      let totalBytes = 0;
      for (const f of files.values()) {
        loadedBytes += f.loaded;
        totalBytes += f.total;
      }
      onProgress?.({ loadedBytes, totalBytes });
    };
    const processor = await tf.AutoProcessor.from_pretrained(SIGLIP_MODEL_ID, { progress_callback });
    const vision = await tf.SiglipVisionModel.from_pretrained(SIGLIP_MODEL_ID, {
      dtype: SIGLIP_DTYPE,
      device: "wasm",
      progress_callback,
    });
    return { tf, processor, vision };
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

const SIDE = 224;

function cropToRaw(tf: Transformers, img: HTMLImageElement, box: Box) {
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, SIDE, SIDE);
  const rgba = ctx.getImageData(0, 0, SIDE, SIDE).data;
  const rgb = new Uint8ClampedArray(SIDE * SIDE * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return new tf.RawImage(rgb, SIDE, SIDE, 3);
}

export async function embedBoxes(
  img: HTMLImageElement,
  boxes: Box[],
  onProgress?: (done: number, total: number) => void,
): Promise<SceneCrop[]> {
  const { tf, processor, vision } = await loadPerception();
  const out: SceneCrop[] = [];
  const BATCH = 4;
  for (let i = 0; i < boxes.length; i += BATCH) {
    const batch = boxes.slice(i, i + BATCH);
    const inputs = await processor(batch.map((b) => cropToRaw(tf, img, b)));
    const { pooler_output } = await vision(inputs);
    const dim = pooler_output.dims[1];
    const data = pooler_output.data as Float32Array;
    batch.forEach((box, j) => {
      out.push({ box, v: packVector(normalize(data.subarray(j * dim, (j + 1) * dim))) });
    });
    onProgress?.(Math.min(boxes.length, i + BATCH), boxes.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export function sceneBoxes(img: HTMLImageElement): Box[] {
  return cropGrid(img.naturalWidth, img.naturalHeight);
}
