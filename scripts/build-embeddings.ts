// Precomputes catalog embeddings with the exact checkpoints and quantization the
// browser loads: BGE-small over product copy, MobileCLIP-S0 over product photos,
// and per-category centroids used as a nearest-centroid category prior.
import { readFile, writeFile } from "node:fs/promises";
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  pipeline,
  RawImage,
} from "@huggingface/transformers";
import { CLIP_MODEL_ID, MODEL_DTYPE, productDocument, TEXT_MODEL_ID } from "../lib/model";
import type { Product } from "../lib/types";
import { normalize, packVector, type PackedVector } from "../lib/vector-codec";

async function main() {
  const catalog: Product[] = JSON.parse(await readFile("data/catalog.json", "utf8"));

  const embedText = await pipeline("feature-extraction", TEXT_MODEL_ID, { dtype: MODEL_DTYPE });
  const processor = await AutoProcessor.from_pretrained(CLIP_MODEL_ID);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: MODEL_DTYPE });

  const products: Record<string, { t: PackedVector; v: PackedVector }> = {};
  const byCategory = new Map<string, Float32Array[]>();

  for (const [i, p] of catalog.entries()) {
    const out = await embedText(productDocument(p), { pooling: "cls", normalize: true });
    const t = normalize(out.data as Float32Array);

    const image = await RawImage.read(`public${p.image}`);
    const { image_embeds } = await vision(await processor(image.rgb()));
    const v = normalize(image_embeds.data as Float32Array);

    products[p.id] = { t: packVector(t), v: packVector(v) };
    byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), t]);
    process.stdout.write(`\rproducts ${i + 1}/${catalog.length}`);
  }
  console.log();

  const categories: Record<string, PackedVector> = {};
  for (const [name, vecs] of byCategory) {
    const mean = new Float32Array(vecs[0].length);
    for (const v of vecs) for (let i = 0; i < v.length; i++) mean[i] += v[i] / vecs.length;
    categories[name] = packVector(normalize(mean));
  }

  await writeFile(
    "data/embeddings.json",
    JSON.stringify({ textModel: TEXT_MODEL_ID, clipModel: CLIP_MODEL_ID, dtype: MODEL_DTYPE, products, categories }),
  );
  console.log(`embeddings: ${catalog.length} products, ${byCategory.size} category centroids`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
