import { describe, expect, it } from "vitest";
import { categoryPosterior, retrieve, type IndexedProduct } from "@/lib/retrieval";
import type { Product } from "@/lib/types";
import { normalize, packVector, unpackVector } from "@/lib/vector-codec";

function vec(...xs: number[]) {
  return normalize(xs);
}

function product(id: string, category: string, priceCents: number, title = id): Product {
  return { id, title, brand: null, category, tags: [], description: "", priceCents, currency: "USD", rating: 4, stock: 10, image: "" };
}

const centroids = [
  { name: "watches", t: vec(1, 0, 0) },
  { name: "shoes", t: vec(0, 1, 0) },
];

const index: IndexedProduct[] = [
  { product: product("w1", "watches", 50000, "Gold Watch"), t: vec(1, 0.1, 0), v: vec(1, 0) },
  { product: product("w2", "watches", 9000, "Steel Watch"), t: vec(0.9, 0.2, 0.1), v: vec(0, 1) },
  { product: product("s1", "shoes", 12000, "Red Sneaker"), t: vec(0.1, 1, 0), v: vec(0.5, 0.5) },
];

describe("categoryPosterior", () => {
  it("is a distribution that prefers the nearest centroid", () => {
    const post = categoryPosterior(vec(1, 0.05, 0), centroids);
    expect(post[0].name).toBe("watches");
    expect(post.reduce((a, c) => a + c.prob, 0)).toBeCloseTo(1, 6);
  });
});

describe("retrieve", () => {
  it("ranks by semantic similarity when only the text tower is available", () => {
    const { hits } = retrieve(index, centroids, { t: vec(1, 0, 0) });
    expect(hits[0].id).toBe("w1");
    expect(hits[0].signals.visual).toBeNull();
    expect(hits.map((h) => h.id)).not.toContain("s1");
  });

  it("returns nothing when the budget only leaves unrelated products", () => {
    const { hits } = retrieve(index, centroids, { t: vec(1, 0, 0), excludeIds: ["w2"], maxPriceCents: 20000 });
    expect(hits).toEqual([]);
  });

  it("lets the visual tower break ties between similar descriptions", () => {
    const { hits } = retrieve(index, centroids, { t: vec(0.95, 0.15, 0.05), v: vec(0, 1) });
    expect(hits[0].id).toBe("w2");
  });

  it("applies budgets and exclusions as hard filters", () => {
    const { hits } = retrieve(index, centroids, { t: vec(1, 0, 0), maxPriceCents: 10000, excludeIds: ["s1"] });
    expect(hits.map((h) => h.id)).toEqual(["w2"]);
  });

  it("boosts products that mention the requested color", () => {
    const q = { t: vec(0.1, 1, 0) };
    const plain = retrieve(index, centroids, q).hits[0];
    const red = retrieve(index, centroids, { ...q, color: "red" }).hits[0];
    expect(red.id).toBe("s1");
    expect(red.signals.attributeBoost).toBeGreaterThan(0);
    expect(red.signals.fused).toBeCloseTo(plain.signals.fused + red.signals.attributeBoost, 2);
  });
});

describe("vector codec", () => {
  it("round-trips through int8 with negligible cosine error", () => {
    const v = normalize(Array.from({ length: 384 }, (_, i) => Math.sin(i * 1.7)));
    const back = unpackVector(packVector(v));
    let cos = 0;
    for (let i = 0; i < v.length; i++) cos += v[i] * back[i];
    expect(cos).toBeGreaterThan(0.999);
    expect(packVector(v).q).toHaveLength(512);
  });
});
