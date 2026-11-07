import "server-only";
import catalogJson from "@/data/catalog.json";
import embeddingsJson from "@/data/embeddings.json";
import type { CategoryCentroid, IndexedProduct } from "./retrieval";
import type { Product } from "./types";
import { unpackVector, type PackedVector } from "./vector-codec";

type EmbeddingFile = {
  products: Record<string, { t: PackedVector; v: PackedVector }>;
  categories: Record<string, PackedVector>;
};

const embeddings = embeddingsJson as EmbeddingFile;

export const products: Product[] = catalogJson as Product[];

export const index: IndexedProduct[] = products.map((product) => ({
  product,
  t: unpackVector(embeddings.products[product.id].t),
  v: unpackVector(embeddings.products[product.id].v),
}));

export const centroids: CategoryCentroid[] = Object.entries(embeddings.categories).map(([name, v]) => ({
  name,
  t: unpackVector(v),
}));

const byId = new Map(products.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}
