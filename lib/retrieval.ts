import type { MatchSignals, Product, ProductHit } from "./types";
import { dot } from "./vector-codec";

export type IndexedProduct = { product: Product; t: Float32Array; v: Float32Array };
export type CategoryCentroid = { name: string; t: Float32Array };

export type RetrievalQuery = {
  t: Float32Array;
  v?: Float32Array | null;
  color?: string | null;
  maxPriceCents?: number | null;
  excludeIds?: string[];
  limit?: number;
};

// Tuned on scripts/eval-queries.ts; the vision-language tower is a tie-breaker
// for visual attributes, not the primary signal.
export const WEIGHTS = { semantic: 0.8, visual: 0.2, category: 0.6, color: 0.35 };
const CATEGORY_TEMPERATURE = 30;
const RELATIVE_FLOOR = 1.8;

function zscores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}

function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Nearest-centroid posterior over catalog categories from the BGE query vector. */
export function categoryPosterior(t: Float32Array, centroids: CategoryCentroid[]) {
  const probs = softmax(centroids.map((c) => CATEGORY_TEMPERATURE * dot(t, c.t)));
  return centroids
    .map((c, i) => ({ name: c.name, prob: probs[i] }))
    .sort((a, b) => b.prob - a.prob);
}

function mentionsColor(p: Product, color: string): boolean {
  const hay = `${p.title} ${p.tags.join(" ")} ${p.description}`.toLowerCase();
  return new RegExp(`\\b${color}\\b`).test(hay) || (color === "grey" && /\bgray\b/.test(hay));
}

/**
 * fused(p) = w_s * z(cos(q_bge, d_bge)) + w_v * z(cos(q_clip, img_clip)) + w_c * P(cat(p) | q) + w_col * [color match]
 * Each cosine is z-scored over the catalog so the text and vision towers, whose
 * raw similarities live on different scales, contribute comparably.
 */
export function retrieve(
  index: IndexedProduct[],
  centroids: CategoryCentroid[],
  q: RetrievalQuery,
): { hits: ProductHit[]; categories: { name: string; prob: number }[] } {
  const categories = categoryPosterior(q.t, centroids);
  const catProb = new Map(categories.map((c) => [c.name, c.prob]));

  const sem = index.map((ip) => dot(q.t, ip.t));
  const vis = q.v ? index.map((ip) => dot(q.v!, ip.v)) : null;
  const zSem = zscores(sem);
  const zVis = vis ? zscores(vis) : null;
  const wSem = zVis ? WEIGHTS.semantic : 1;
  const wVis = zVis ? WEIGHTS.visual : 0;

  const scored = index.map((ip, i) => {
    const pCat = catProb.get(ip.product.category) ?? 0;
    const colorBoost = q.color && mentionsColor(ip.product, q.color) ? WEIGHTS.color : 0;
    const fused = wSem * zSem[i] + wVis * (zVis ? zVis[i] : 0) + WEIGHTS.category * pCat + colorBoost;
    const signals: MatchSignals = {
      semantic: round(sem[i]),
      visual: vis ? round(vis[i]) : null,
      categoryProb: round(pCat),
      attributeBoost: colorBoost,
      fused: round(fused),
      match: round(1 / (1 + Math.exp(-(fused - 1.2) * 1.6))),
    };
    return { p: ip.product, signals };
  });

  const ranked = scored
    .filter(({ p }) => !(q.excludeIds ?? []).includes(p.id))
    .filter(({ p }) => q.maxPriceCents == null || p.priceCents <= q.maxPriceCents)
    .sort((a, b) => b.signals.fused - a.signals.fused);
  // Results must stay comparable to the best match in the whole catalog, so a
  // budget filter returns nothing rather than unrelated products.
  const best = Math.max(...scored.map((s) => s.signals.fused));
  const hits = ranked
    .filter(({ signals: s }) => s.fused >= best - RELATIVE_FLOOR && (s.match >= 0.4 || s.fused === best))
    .slice(0, q.limit ?? 4)
    .map(({ p, signals }) => toHit(p, signals));
  return { hits, categories: categories.slice(0, 3).map((c) => ({ name: c.name, prob: round(c.prob) })) };
}

function round(x: number) {
  return Math.round(x * 1000) / 1000;
}

export function toHit(p: Product, signals: MatchSignals): ProductHit {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    category: p.category,
    priceCents: p.priceCents,
    currency: p.currency,
    image: p.image,
    rating: p.rating,
    signals,
  };
}
