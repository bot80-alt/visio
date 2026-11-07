// End-to-end smoke test against a running server. Embeds each message exactly
// like the browser does, drives the agent, then exercises the Trust Gate.
//   npx tsx scripts/smoke-chat.ts "the silver headphones the android wears" "in black" "buy #1"
import { AutoTokenizer, CLIPTextModelWithProjection, pipeline } from "@huggingface/transformers";
import { focusPhrase } from "../lib/focus";
import { CLIP_MODEL_ID, MODEL_DTYPE, TEXT_MODEL_ID, TEXT_QUERY_PREFIX } from "../lib/model";
import type { ChatMessage, ChatResponse, QueryEmbeddings, QueryVectors, SearchState } from "../lib/types";
import { normalize, packVector } from "../lib/vector-codec";

const BASE = process.env.VISIO_URL ?? "http://127.0.0.1:4317";

async function main() {
  const bge = await pipeline("feature-extraction", TEXT_MODEL_ID, { dtype: MODEL_DTYPE });
  const tok = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID);
  const clip = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: MODEL_DTYPE });
  const embedText = async (x: string) =>
    normalize((await bge(TEXT_QUERY_PREFIX + x, { pooling: "cls", normalize: true })).data as Float32Array);
  const encode = async (text: string): Promise<QueryVectors> => {
    const focus = focusPhrase(text) || text;
    const full = await embedText(text);
    const f = focus === text ? full : await embedText(focus);
    const { text_embeds } = await clip(tok([focus], { padding: "max_length", truncation: true }));
    return {
      t: packVector(normalize(full.map((x, i) => x + f[i]))),
      v: packVector(normalize(text_embeds.data as Float32Array)),
    };
  };

  let state: SearchState = {};
  const messages: ChatMessage[] = [];
  let last: ChatResponse | null = null;
  for (const text of process.argv.slice(2)) {
    messages.push({ role: "user", content: text });
    const query: QueryEmbeddings = { message: await encode(text) };
    if (state.anchor) query.combined = await encode(`${state.anchor}, ${text}`);
    console.log(">", text);
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, query, state }),
    });
    if (!r.ok) {
      console.log("ERR", r.status, await r.text());
      return;
    }
    last = (await r.json()) as ChatResponse;
    state = last.state;
    messages.push({ role: "assistant", content: last.reply });
    console.log(`[${last.engine}] ${last.reply}`);
    for (const c of last.cards) {
      if (c.type === "products") {
        console.log(`  understood: ${JSON.stringify(c.understanding)}`);
        for (const p of c.items) console.log(`  ${(p.signals.match * 100).toFixed(0)}%  ${p.title}  $${p.priceCents / 100}`);
      }
      if (c.type === "checkout") console.log("  checkout:", c.product.title, c.totalCents, `${c.proposal.slice(0, 24)}…`);
    }
  }

  const checkout = last?.cards.find((c) => c.type === "checkout");
  if (!checkout || checkout.type !== "checkout") return;
  const order = (proposal: string) =>
    fetch(`${BASE}/api/checkout/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposal, mode: "demo" }),
    });
  const first = await order(checkout.proposal);
  const created = (await first.json()) as { orderId?: string };
  console.log("order:", first.status, created);
  console.log("replay:", (await order(checkout.proposal)).status);
  console.log("tampered:", (await order(checkout.proposal.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).status);
  if (created.orderId) console.log("status:", await (await fetch(`${BASE}/api/orders/${created.orderId}`)).json());
}

main();
