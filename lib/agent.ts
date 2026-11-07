import "server-only";
import { centroids, getProduct, index } from "./catalog";
import { COLORS, isRefinement, parseIntent } from "./intent";
import { retrieve, toHit } from "./retrieval";
import { trustGateSecret } from "./secrets";
import { MAX_QUANTITY, signProposal } from "./trust-gate";
import type {
  Card,
  ChatMessage,
  ChatResponse,
  ProductHit,
  QueryEmbeddings,
  QueryVectors,
  SearchState,
  Understanding,
} from "./types";
import { unpackVector } from "./vector-codec";

export type DecodedQuery = {
  text: string;
  message: { t: Float32Array; v: Float32Array | null };
  combined: { t: Float32Array; v: Float32Array | null } | null;
};

type ToolContext = { query: DecodedQuery | null; state: SearchState; cards: Card[] };

export function decodeQuery(text: string, q: QueryEmbeddings | null | undefined): DecodedQuery | null {
  if (!q) return null;
  const dec = (x: QueryVectors) => ({
    t: unpackVector(x.t),
    v: x.v ? unpackVector(x.v) : null,
  });
  return { text, message: dec(q.message), combined: q.combined ? dec(q.combined) : null };
}

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function searchCatalog(
  ctx: ToolContext,
  args: { refine: boolean; color?: string | null; maxPriceCents?: number | null },
): ProductHit[] {
  if (!ctx.query) return [];
  const refine = args.refine && !!ctx.state.anchor && !!ctx.query.combined;
  const vecs = refine ? ctx.query.combined! : ctx.query.message;
  const color = args.color && (COLORS as readonly string[]).includes(args.color) ? args.color : null;
  const started = performance.now();
  const { hits, categories } = retrieve(index, centroids, {
    t: vecs.t,
    v: vecs.v,
    color,
    maxPriceCents: args.maxPriceCents ?? null,
  });
  const description = refine ? `${ctx.state.anchor}, ${ctx.query.text}` : ctx.query.text;
  const understanding: Understanding = {
    description,
    refinement: refine,
    categories,
    color,
    maxPriceCents: args.maxPriceCents ?? null,
    signals: vecs.v ? ["semantic", "visual"] : ["semantic"],
    catalogSize: index.length,
    retrievalMs: Math.round((performance.now() - started) * 10) / 10,
  };
  if (hits.length === 0) return hits;
  ctx.state = {
    anchor: description.slice(0, 600),
    category: categories[0]?.name ?? null,
    color,
    maxPriceCents: args.maxPriceCents ?? null,
    resultIds: hits.map((h) => h.id),
  };
  ctx.cards.push({ type: "products", items: hits, understanding });
  return hits;
}

async function proposeCheckout(ctx: ToolContext, productId: string, quantity: number) {
  const product = getProduct(productId);
  if (!product) return { error: "unknown product" };
  if (!ctx.state.resultIds?.includes(productId)) {
    return { error: "only products already shown to the user can be proposed" };
  }
  const qty = Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity || 1)));
  const { token, payload } = signProposal({ productId, quantity: qty }, await trustGateSecret());
  ctx.cards.push({
    type: "checkout",
    proposal: token,
    expiresAt: payload.exp,
    quantity: qty,
    product: toHit(product, { semantic: 0, visual: null, categoryProb: 0, attributeBoost: 0, fused: 0, match: 0 }),
    totalCents: product.priceCents * qty,
  });
  return { proposed: true, product: product.title, quantity: qty, total: usd(product.priceCents * qty) };
}

function explainTop(hits: ProductHit[]): string {
  const top = hits[0];
  const s = top.signals;
  const why =
    s.visual != null && s.visual >= 0.1
      ? "your wording matches both its description and its photo"
      : s.categoryProb > 0.6
        ? "it's the strongest semantic match in the category you described"
        : "it's the closest semantic match to your description";
  return `Best match: ${top.title} at ${usd(top.priceCents)} (${pct(s.match)} match), because ${why}.`;
}

async function runRules(messages: ChatMessage[], ctx: ToolContext): Promise<ChatResponse> {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const intent = parseIntent(last);
  const finish = (reply: string): ChatResponse => ({ reply, cards: ctx.cards, state: ctx.state, engine: "rules" });

  if (intent.kind === "help") {
    return finish(
      "Describe what you saw in as much detail as you like, e.g. \"the matte silver over-ear headphones the android wears by the rainy window\". Hold the mic to say it instead. Then refine (\"in black\", \"under $100\") or say \"buy #1\".",
    );
  }
  if (intent.kind === "buy") {
    const ids = ctx.state.resultIds ?? [];
    if (ids.length === 0) return finish("Describe the product first and I'll find it.");
    const idx = intent.index == null ? 0 : intent.index < 0 ? ids.length - 1 : Math.min(intent.index, ids.length - 1);
    const p = getProduct(ids[idx])!;
    await proposeCheckout(ctx, p.id, intent.quantity);
    return finish(
      `Here's a checkout for ${intent.quantity > 1 ? `${intent.quantity} × ` : ""}${p.title}. The price comes from the catalog, not from me, and nothing is charged until you confirm with Fastlane.`,
    );
  }
  if (!ctx.query) return finish("The on-device models are still loading. Give it a second and try again.");

  if (intent.kind === "cheaper") {
    const shown = (ctx.state.resultIds ?? []).map((id) => getProduct(id)).filter(Boolean);
    const floor = shown.length ? Math.min(...shown.map((p) => p!.priceCents)) : null;
    const hits = searchCatalog(ctx, {
      refine: true,
      color: ctx.state.color,
      maxPriceCents: floor != null ? floor - 1 : null,
    });
    return finish(hits.length ? `Cheaper take on that: ${explainTop(hits)}` : "That was already the most affordable match.");
  }

  const refine = !!ctx.state.anchor && isRefinement(last);
  const hits = searchCatalog(ctx, {
    refine,
    color: intent.color ?? (refine ? ctx.state.color : null),
    maxPriceCents: intent.maxPriceCents ?? (refine ? ctx.state.maxPriceCents : null),
  });
  return finish(hits.length ? explainTop(hits) : "Nothing in the catalog fits that budget. Try raising it.");
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description:
        "Match the user's latest message against the catalog with on-device embeddings. Set refine=true when the message modifies the previous description (\"in black\", \"cheaper\", \"with a strap\") instead of describing a new product.",
      parameters: {
        type: "object",
        properties: {
          refine: { type: "boolean" },
          color: { type: "string", enum: [...COLORS] },
          max_price_usd: { type: "number" },
        },
        required: ["refine"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_checkout",
      description:
        "Propose a checkout for a product the user explicitly asked to buy. Only products already shown are allowed. This never charges anything: the user must confirm with PayPal Fastlane.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: MAX_QUANTITY },
        },
        required: ["product_id"],
      },
    },
  },
];

type GroqToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type GroqMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function systemPrompt(ctx: ToolContext): string {
  return [
    "You are Visio, a shopping agent. Users describe products they saw (often in films) in detailed natural language, and you find them.",
    "Call search_catalog for any description or refinement and propose_checkout only when the user clearly asks to buy. Never invent products, prices or order status.",
    "You cannot charge anyone: checkout always needs the user's Fastlane confirmation and a verified PayPal webhook.",
    "Reply in one or two short sentences; the UI already shows product cards and match scores. Refer to results as #1, #2, ...",
    ctx.state.anchor ? `Active description: "${ctx.state.anchor}".` : "",
    ctx.state.resultIds?.length
      ? `Results on screen: ${ctx.state.resultIds.map((id, i) => `#${i + 1} ${id} ${getProduct(id)?.title} ${usd(getProduct(id)?.priceCents ?? 0)}`).join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runGroq(messages: ChatMessage[], ctx: ToolContext, apiKey: string): Promise<ChatResponse> {
  const convo: GroqMessage[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  for (let round = 0; round < 3; round++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: convo, tools: TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 400 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`groq ${res.status}`);
    const body = await res.json();
    const msg = body.choices?.[0]?.message as { content: string | null; tool_calls?: GroqToolCall[] };
    if (!msg?.tool_calls?.length) {
      return { reply: msg?.content?.trim() || "Here's what I found.", cards: ctx.cards, state: ctx.state, engine: "groq" };
    }
    convo.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls.slice(0, 3)) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      let result: unknown;
      if (call.function.name === "search_catalog") {
        const maxUsd = typeof args.max_price_usd === "number" ? args.max_price_usd : null;
        const hits = searchCatalog(ctx, {
          refine: args.refine === true,
          color: typeof args.color === "string" ? args.color : null,
          maxPriceCents: maxUsd != null ? Math.round(maxUsd * 100) : null,
        });
        result = hits.map((h, i) => ({ rank: i + 1, id: h.id, title: h.title, price: usd(h.priceCents), match: pct(h.signals.match) }));
      } else if (call.function.name === "propose_checkout") {
        result = await proposeCheckout(ctx, String(args.product_id ?? ""), typeof args.quantity === "number" ? args.quantity : 1);
      } else {
        result = { error: "unknown tool" };
      }
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "Here's what I found.", cards: ctx.cards, state: ctx.state, engine: "groq" };
}

// Caps LLM spend per server instance per hour; beyond it the rule engine answers.
const GROQ_CALLS_PER_HOUR = 600;
let groqWindow = { start: Date.now(), calls: 0 };

function takeGroqBudget(): boolean {
  if (Date.now() - groqWindow.start > 3_600_000) groqWindow = { start: Date.now(), calls: 0 };
  if (groqWindow.calls >= GROQ_CALLS_PER_HOUR) return false;
  groqWindow.calls++;
  return true;
}

export async function runAgent(
  messages: ChatMessage[],
  query: DecodedQuery | null,
  state: SearchState,
): Promise<ChatResponse> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (apiKey && takeGroqBudget()) {
    try {
      return await runGroq(messages, { query, state: { ...state }, cards: [] }, apiKey);
    } catch (error) {
      console.warn("groq unavailable, using rule engine:", error instanceof Error ? error.message : "unknown");
    }
  }
  return runRules(messages, { query, state: { ...state }, cards: [] });
}
