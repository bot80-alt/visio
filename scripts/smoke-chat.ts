/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON handling in a dev-only smoke script */
// End-to-end smoke test against a running server: embeds a sample scene the
// same way the browser does, then drives the agent and the Trust Gate.
//   npx tsx scripts/smoke-chat.ts scene-neon-apartment "find the silver headphones" "buy the first one"
import sharp from "sharp";
import { AutoProcessor, RawImage, SiglipVisionModel } from "@huggingface/transformers";
import { cropGrid } from "../lib/crops";
import { normalize, packVector } from "../lib/vector-codec";
import { SIGLIP_MODEL_ID, SIGLIP_DTYPE } from "../lib/model";

const BASE = process.env.VISIO_URL ?? "http://127.0.0.1:4317";

async function main() {
  const processor = await AutoProcessor.from_pretrained(SIGLIP_MODEL_ID);
  const vision = await SiglipVisionModel.from_pretrained(SIGLIP_MODEL_ID, { dtype: SIGLIP_DTYPE });
  const path = `public/scenes/${process.argv[2]}.jpg`;
  const meta = await sharp(path).metadata();
  const W = meta.width!, H = meta.height!;
  const crops = [];
  for (const b of cropGrid(W, H)) {
    const buf = await sharp(path).extract({ left: b.x, top: b.y, width: Math.min(b.w, W - b.x), height: Math.min(b.h, H - b.y) }).resize(224, 224, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const { pooler_output } = await vision(await processor(new RawImage(new Uint8ClampedArray(buf), 224, 224, 3)));
    crops.push({ box: b, v: packVector(normalize(pooler_output.data as Float32Array)) });
  }
  const scene = { width: W, height: H, crops, selection: null };
  let state: any = {};
  const post = async (body: any) => {
    const r = await fetch(BASE + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, state }) });
    const j = await r.json();
    if (!r.ok) { console.log("ERR", r.status, j); return j; }
    state = j.state;
    console.log(`[${j.engine}] ${j.reply}`);
    for (const c of j.cards) {
      if (c.type === "detections") console.log("  detections:", c.items.map((d: any) => d.object).join(", "));
      if (c.type === "products") console.log("  products:", JSON.stringify(c.box), c.items.map((p: any) => `${p.title} $${p.priceCents / 100}`).join(" | "));
      if (c.type === "checkout") console.log("  checkout:", c.product.title, c.totalCents, c.proposal.slice(0, 30) + "...");
    }
    return j;
  };
  await post({ intent: "scan", scene });
  const msgs: any[] = [];
  let last: any;
  for (const t of process.argv.slice(3)) {
    msgs.push({ role: "user", content: t });
    console.log(">", t);
    last = await post({ intent: "message", messages: msgs, scene });
    if (last?.reply) msgs.push({ role: "assistant", content: last.reply });
  }
  const checkout = last?.cards?.find((c: any) => c.type === "checkout");
  if (checkout) {
    const r = await fetch(BASE + "/api/checkout/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposal: checkout.proposal, mode: "demo" }) });
    const j = await r.json(); console.log("order:", r.status, j);
    const r2 = await fetch(BASE + "/api/checkout/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposal: checkout.proposal, mode: "demo" }) });
    console.log("replay:", r2.status, await r2.json());
    const tampered = checkout.proposal.replace(/^./, (c: string) => (c === "e" ? "f" : "e"));
    const r3 = await fetch(BASE + "/api/checkout/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposal: tampered, mode: "demo" }) });
    console.log("tampered:", r3.status, await r3.json());
    const r4 = await fetch(`${BASE}/api/orders/${j.orderId}`); console.log("status:", await r4.json());
  }
}
main();
