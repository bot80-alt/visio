import "server-only";
import {
  conceptVec,
  getProduct,
  objects,
  productImageVec,
  productTextVec,
  products,
  toHit,
} from "./catalog";
import type { Box, Detection, ProductHit, SceneContext } from "./types";
import { dot, unpackVector } from "./vector-codec";

export type DecodedScene = {
  width: number;
  height: number;
  boxes: Box[];
  vecs: Float32Array[];
  selection: { box: Box; vec: Float32Array } | null;
};

export function decodeScene(scene: SceneContext | null | undefined): DecodedScene | null {
  if (!scene || scene.crops.length === 0) return null;
  return {
    width: scene.width,
    height: scene.height,
    boxes: scene.crops.map((c) => c.box),
    vecs: scene.crops.map((c) => unpackVector(c.v)),
    selection: scene.selection
      ? { box: scene.selection.box, vec: unpackVector(scene.selection.v) }
      : null,
  };
}

// Crop 0 is the full frame; it describes the whole scene rather than one object.
const FIRST_OBJECT_CROP = 1;

export function detectObjects(scene: DecodedScene, limit = 6): Detection[] {
  const scored = objects.map((object) => {
    const c = conceptVec(object)!;
    let best = -Infinity;
    let bestIdx = FIRST_OBJECT_CROP;
    let sum = 0;
    for (let j = FIRST_OBJECT_CROP; j < scene.vecs.length; j++) {
      const s = dot(scene.vecs[j], c);
      sum += s;
      if (s > best) {
        best = s;
        bestIdx = j;
      }
    }
    const mean = sum / Math.max(1, scene.vecs.length - FIRST_OBJECT_CROP);
    return { object, score: best - mean, box: scene.boxes[bestIdx] };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((d) => ({ ...d, score: Math.round(d.score * 1000) / 1000 }));
}

export function locateObject(
  scene: DecodedScene,
  object: string,
  color?: string | null,
): { box: Box; vec: Float32Array; score: number } | null {
  const c = conceptVec(object, color) ?? conceptVec(object);
  if (!c) return null;
  let best = -Infinity;
  let bestIdx = -1;
  for (let j = FIRST_OBJECT_CROP; j < scene.vecs.length; j++) {
    const s = dot(scene.vecs[j], c);
    if (s > best) {
      best = s;
      bestIdx = j;
    }
  }
  if (bestIdx < 0) return null;
  return { box: scene.boxes[bestIdx], vec: scene.vecs[bestIdx], score: best };
}

function zscores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}

export type RankInput = {
  objectVec?: Float32Array | null;
  object?: string | null;
  color?: string | null;
  maxPriceCents?: number | null;
  excludeIds?: string[];
  limit?: number;
  alpha?: number;
};

const SAME_OBJECT_BONUS = 3;

// s(p) = alpha * z(cos(v_obj, e_img)) + (1 - alpha) * z(cos(q, e_img) + cos(v_obj, e_txt)) + category bonus.
// Z-scoring each signal over the catalog puts image-image and image-text cosines
// (which live on very different scales in SigLIP) on comparable footing.
export function rankProducts(input: RankInput): ProductHit[] {
  const { objectVec, object, color, maxPriceCents, excludeIds = [], limit = 4 } = input;
  const q = object ? (conceptVec(object, color) ?? conceptVec(object)) : undefined;
  const alpha = objectVec ? (input.alpha ?? 0.6) : 0;

  const imgSim = zscores(products.map((p) => (objectVec ? dot(objectVec, productImageVec(p.id)) : 0)));
  const textSim = zscores(
    products.map(
      (p) =>
        (q ? dot(q, productImageVec(p.id)) : 0) +
        (objectVec ? dot(objectVec, productTextVec(p.id)) : 0),
    ),
  );

  const ranked = products
    .map((p, i) => {
      const fused =
        alpha * imgSim[i] + (1 - alpha) * textSim[i] + (object && p.object === object ? SAME_OBJECT_BONUS : 0);
      return { p, fused };
    })
    .filter(({ p }) => !excludeIds.includes(p.id))
    .filter(({ p }) => maxPriceCents == null || p.priceCents <= maxPriceCents)
    .sort((a, b) => b.fused - a.fused);

  // Same-object products first; only pad with look-alikes when the catalog has
  // fewer than two of that object, and never when the user set a budget.
  let picked = ranked;
  if (object) {
    const same = ranked.filter(({ p }) => p.object === object);
    picked = same.length >= 2 || maxPriceCents != null ? same : [...same, ...ranked.filter(({ p }) => p.object !== object).slice(0, 3 - same.length)];
  }
  return picked.slice(0, limit).map(({ p, fused }) => toHit(p, fused));
}

export function hitFor(id: string): ProductHit | null {
  const p = getProduct(id);
  return p ? toHit(p, 0) : null;
}
