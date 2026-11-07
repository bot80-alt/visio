// Labeled retrieval eval: runs the same encoders and fusion as the browser
// against the committed catalog index and reports top-1 / top-3 accuracy.
// Usage: npx tsx scripts/eval-queries.ts [--verbose]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AutoTokenizer, CLIPTextModelWithProjection, pipeline } from "@huggingface/transformers";
import { focusPhrase } from "../lib/focus";
import { CLIP_MODEL_ID, MODEL_DTYPE, TEXT_MODEL_ID, TEXT_QUERY_PREFIX } from "../lib/model";
import { retrieve, type CategoryCentroid, type IndexedProduct } from "../lib/retrieval";
import type { Product } from "../lib/types";
import { normalize, unpackVector, type PackedVector } from "../lib/vector-codec";

type Embeddings = {
  products: Record<string, { t: PackedVector; v: PackedVector }>;
  categories: Record<string, PackedVector>;
};

// Each case lists every product that is a correct answer.
const CASES: { q: string; ok: string[] }[] = [
  { q: "the matte silver over-ear headphones the android wears while staring out the rainy window", ok: ["p101"] },
  { q: "chunky red and black high-top basketball sneakers the courier wears in the chase scene", ok: ["p88"] },
  { q: "a vintage gold watch on the detective's wrist", ok: ["p106", "p193", "p97", "p192"] },
  { q: "a long black evening gown like the one in the ballroom scene", ok: ["p177"] },
  { q: "a sleek space grey laptop the hacker is typing on", ok: ["p78"] },
  { q: "a bottle of fancy french perfume on her vanity", ok: ["p6", "p7", "p8", "p9", "p10"] },
  { q: "big leather sofa in the villain's penthouse", ok: ["p12"] },
  { q: "a carbon steel wok the chef tosses noodles in", ok: ["p52"] },
  { q: "dark sunglasses the getaway driver never takes off", ok: ["p154", "p155", "p158"] },
  { q: "her tiny green crystal earrings in the close-up shot", ok: ["p182"] },
  { q: "the scooter he rides through the neon alley", ok: ["p116"] },
  { q: "the warm glowing table lamp on the nightstand", ok: ["p47"] },
  { q: "a diver's watch with a black bezel like the spy wears", ok: ["p98"] },
  { q: "Those red and black high-top sneakers he laces up before the final game", ok: ["p88"] },
  { q: "Dark aviator-style sunglasses the getaway driver never takes off", ok: ["p154", "p155", "p158"] },
  { q: "Green crystal drop earrings catching the candlelight at dinner", ok: ["p182"] },
  { q: "The carbon-steel wok the chef tosses noodles in over a huge flame", ok: ["p52"] },
  { q: "A long black evening gown with a slit, the one she wears down the staircase at the gala", ok: ["p177"] },
  { q: "a white wireless earbuds case on the desk", ok: ["p100"] },
  { q: "a red lipstick she reapplies in the mirror", ok: ["p4"] },
];

async function main() {
  const verbose = process.argv.includes("--verbose");
  const root = join(__dirname, "..");
  const catalog = JSON.parse(readFileSync(join(root, "data/catalog.json"), "utf8")) as Product[];
  const emb = JSON.parse(readFileSync(join(root, "data/embeddings.json"), "utf8")) as Embeddings;
  const index: IndexedProduct[] = catalog.map((p) => ({
    product: p,
    t: unpackVector(emb.products[p.id].t),
    v: unpackVector(emb.products[p.id].v),
  }));
  const centroids: CategoryCentroid[] = Object.entries(emb.categories).map(([name, v]) => ({ name, t: unpackVector(v) }));

  const bge = await pipeline("feature-extraction", TEXT_MODEL_ID, { dtype: MODEL_DTYPE });
  const tok = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID);
  const clip = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: MODEL_DTYPE });
  const embedText = async (x: string) =>
    normalize((await bge(TEXT_QUERY_PREFIX + x, { pooling: "cls", normalize: true })).data as Float32Array);

  let top1 = 0;
  let top3 = 0;
  let textOnlyTop1 = 0;
  for (const { q, ok } of CASES) {
    const focus = focusPhrase(q) || q;
    const full = await embedText(q);
    const f = focus === q ? full : await embedText(focus);
    const t = normalize(full.map((x, i) => x + f[i]));
    const { text_embeds } = await clip(tok([focus], { padding: "max_length", truncation: true }));
    const v = normalize(text_embeds.data as Float32Array);

    const { hits, categories } = retrieve(index, centroids, { t, v, limit: 3 });
    const textOnly = retrieve(index, centroids, { t, limit: 1 }).hits;
    const rank = hits.findIndex((h) => ok.includes(h.id));
    if (rank === 0) top1++;
    if (rank >= 0) top3++;
    if (ok.includes(textOnly[0].id)) textOnlyTop1++;

    console.log(`${rank === 0 ? "✓" : rank > 0 ? "~" : "✗"} ${q}`);
    if (verbose || rank !== 0) {
      console.log(`    focus: "${focus}"  P(cat): ${categories.map((c) => `${c.name} ${c.prob}`).join(", ")}`);
      for (const h of hits) {
        const s = h.signals;
        console.log(`    ${h.title.padEnd(36)} sem ${s.semantic}  vis ${s.visual}  cat ${s.categoryProb}  match ${s.match}`);
      }
    }
  }
  const n = CASES.length;
  console.log(`\nfused top-1 ${top1}/${n}  top-3 ${top3}/${n}  |  text-only top-1 ${textOnlyTop1}/${n}`);
}

main();
