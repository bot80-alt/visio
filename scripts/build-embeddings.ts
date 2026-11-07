// Precomputes SigLIP 2 embeddings for the catalog (product images + titles) and
// for the concept vocabulary used to ground free-form object descriptions.
// Uses the same ONNX checkpoint and quantization the browser loads.
import { readFile, writeFile } from "node:fs/promises";
import {
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel,
} from "@huggingface/transformers";
import { COLORS, conceptKey, conceptPrompt, productPrompt } from "../lib/concepts";
import { normalize, packVector, type PackedVector } from "../lib/vector-codec";
import { SIGLIP_DTYPE, SIGLIP_MODEL_ID } from "../lib/model";

type Product = { id: string; title: string; object: string; image: string };

async function main() {
  const catalog: Product[] = JSON.parse(await readFile("data/catalog.json", "utf8"));

  const processor = await AutoProcessor.from_pretrained(SIGLIP_MODEL_ID);
  const tokenizer = await AutoTokenizer.from_pretrained(SIGLIP_MODEL_ID);
  const vision = await SiglipVisionModel.from_pretrained(SIGLIP_MODEL_ID, { dtype: SIGLIP_DTYPE });
  const text = await SiglipTextModel.from_pretrained(SIGLIP_MODEL_ID, { dtype: SIGLIP_DTYPE });

  async function embedTexts(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const batch = texts.slice(i, i + 32).map((t) => t.toLowerCase());
      const inputs = tokenizer(batch, { padding: "max_length", truncation: true, max_length: 64 });
      const { pooler_output } = await text(inputs);
      const dim = pooler_output.dims[1];
      const data = pooler_output.data as Float32Array;
      for (let j = 0; j < batch.length; j++) out.push(normalize(data.subarray(j * dim, (j + 1) * dim)));
    }
    return out;
  }

  async function embedImage(path: string): Promise<Float32Array> {
    const image = await RawImage.read(path);
    const inputs = await processor(image.rgb());
    const { pooler_output } = await vision(inputs);
    return normalize(pooler_output.data as Float32Array);
  }

  const products: Record<string, { img: PackedVector; txt: PackedVector }> = {};
  const productTexts = await embedTexts(catalog.map(productPrompt));
  for (const [i, p] of catalog.entries()) {
    const img = await embedImage(`public${p.image}`);
    products[p.id] = { img: packVector(img), txt: packVector(productTexts[i]) };
    process.stdout.write(`\rproducts ${i + 1}/${catalog.length}`);
  }
  console.log();

  const objects = [...new Set(catalog.map((p) => p.object))].sort();
  const conceptKeys: string[] = [];
  const prompts: string[] = [];
  for (const object of objects) {
    conceptKeys.push(conceptKey(object));
    prompts.push(conceptPrompt(object));
    for (const color of COLORS) {
      conceptKeys.push(conceptKey(object, color));
      prompts.push(conceptPrompt(object, color));
    }
  }
  const conceptVecs = await embedTexts(prompts);
  const concepts: Record<string, PackedVector> = {};
  conceptKeys.forEach((k, i) => (concepts[k] = packVector(conceptVecs[i])));

  await writeFile(
    "data/embeddings.json",
    JSON.stringify({ model: SIGLIP_MODEL_ID, dtype: SIGLIP_DTYPE, objects, products, concepts }),
  );
  console.log(`embeddings: ${catalog.length} products, ${conceptKeys.length} concepts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
