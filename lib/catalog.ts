import "server-only";
import catalogJson from "@/data/catalog.json";
import embeddingsJson from "@/data/embeddings.json";
import { conceptKey } from "./concepts";
import type { Product, ProductHit } from "./types";
import { unpackVector, type PackedVector } from "./vector-codec";

type EmbeddingFile = {
  model: string;
  objects: string[];
  products: Record<string, { img: PackedVector; txt: PackedVector }>;
  concepts: Record<string, PackedVector>;
};

const embeddings = embeddingsJson as EmbeddingFile;

export const products: Product[] = catalogJson as Product[];
export const objects: string[] = embeddings.objects;

const byId = new Map(products.map((p) => [p.id, p]));
const productImageVecs = new Map(
  products.map((p) => [p.id, unpackVector(embeddings.products[p.id].img)]),
);
const productTextVecs = new Map(
  products.map((p) => [p.id, unpackVector(embeddings.products[p.id].txt)]),
);
const conceptVecs = new Map<string, Float32Array>();

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

export function productImageVec(id: string): Float32Array {
  return productImageVecs.get(id)!;
}

export function productTextVec(id: string): Float32Array {
  return productTextVecs.get(id)!;
}

export function conceptVec(object: string, color?: string | null): Float32Array | undefined {
  const key = conceptKey(object, color);
  const packed = embeddings.concepts[key];
  if (!packed) return undefined;
  let v = conceptVecs.get(key);
  if (!v) {
    v = unpackVector(packed);
    conceptVecs.set(key, v);
  }
  return v;
}

export function toHit(p: Product, score: number): ProductHit {
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    object: p.object,
    priceCents: p.priceCents,
    currency: p.currency,
    image: p.image,
    rating: p.rating,
    score: Math.round(score * 1000) / 1000,
  };
}
