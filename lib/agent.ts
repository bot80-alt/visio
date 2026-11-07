import "server-only";
import { conceptVec, getProduct, objects, toHit } from "./catalog";
import { COLORS } from "./concepts";
import { parseIntent } from "./intent";
import { detectObjects, locateObject, rankProducts, type DecodedScene } from "./search";
import { trustGateSecret } from "./secrets";
import { MAX_QUANTITY, signProposal } from "./trust-gate";
import type { Card, ChatMessage, ChatResponse, SearchState } from "./types";
import { dot } from "./vector-codec";

type ToolContext = {
  scene: DecodedScene | null;
  state: SearchState;
  cards: Card[];
};

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function classifySelection(scene: DecodedScene): string | null {
  if (!scene.selection) return null;
  let best = -Infinity;
  let bestObject: string | null = null;
  for (const o of objects) {
    const s = dot(scene.selection.vec, conceptVec(o)!);
    if (s > best) {
      best = s;
      bestObject = o;
    }
  }
  return bestObject;
}

function findProducts(
  ctx: ToolContext,
  args: { object?: string | null; color?: string | null; maxPriceCents?: number | null },
) {
  const object = args.object && objects.includes(args.object) ? args.object : null;
  const color = args.color && (COLORS as readonly string[]).includes(args.color) ? args.color : null;
  let box = null;
  let objectVec: Float32Array | null = null;
  if (ctx.scene?.selection) {
    box = ctx.scene.selection.box;
    objectVec = ctx.scene.selection.vec;
  } else if (ctx.scene && object) {
    const hit = locateObject(ctx.scene, object, color);
    if (hit) {
      box = hit.box;
      objectVec = hit.vec;
    }
  }
  const items = rankProducts({ objectVec, object, color, maxPriceCents: args.maxPriceCents ?? null });
  if (items.length === 0) return items;
  ctx.state = {
    object,
    color,
    maxPriceCents: args.maxPriceCents ?? null,
    box,
    resultIds: items.map((i) => i.id),
  };
  ctx.cards.push({ type: "products", object, color, box, items });
  return items;
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
    product: toHit(product, 0),
    totalCents: product.priceCents * qty,
  });
  return { proposed: true, product: product.title, quantity: qty, total: usd(product.priceCents * qty) };
}

function describeHits(ctx: ToolContext) {
  const ids = ctx.state.resultIds ?? [];
  return ids
    .map((id, i) => {
      const p = getProduct(id);
      return p ? `#${i + 1} ${p.title} (${usd(p.priceCents)})` : null;
    })
    .filter(Boolean)
    .join(", ");
}

// Deterministic first look at a new frame or a hand-drawn box; no LLM needed.
export function scanScene(scene: DecodedScene, state: SearchState): ChatResponse {
  const ctx: ToolContext = { scene, state, cards: [] };
  if (scene.selection) {
    const object = classifySelection(scene);
    const items = findProducts(ctx, { object });
    return {
      reply: `That region looks like a ${object ?? "product"}. Here are the closest matches — ${items[0] ? `${items[0].title} is the strongest` : "nothing close yet"}. Say "buy the first one" or refine it, e.g. "in black under $200".`,
      cards: ctx.cards,
      state: ctx.state,
      engine: "rules",
    };
  }
  const detections = detectObjects(scene);
  ctx.cards.push({ type: "detections", items: detections });
  const top = detections[0]?.object ?? null;
  if (top) findProducts(ctx, { object: top });
  const names = detections.slice(0, 4).map((d) => d.object);
  return {
    reply: names.length
      ? `I can make out ${names.slice(0, -1).join(", ")}${names.length > 1 ? " and " : ""}${names.at(-1)} in this frame. I started with the ${top}. Tap another object, drag a box around anything, or describe it in your own words.`
      : "I couldn't pick out a product in this frame. Drag a box around the object you want.",
    cards: ctx.cards,
    state: ctx.state,
    engine: "rules",
  };
}

async function runRules(messages: ChatMessage[], ctx: ToolContext): Promise<ChatResponse> {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const intent = parseIntent(last, objects);
  const finish = (reply: string): ChatResponse => ({ reply, cards: ctx.cards, state: ctx.state, engine: "rules" });

  if (intent.kind === "help") {
    return finish(
      "Describe any object in the frame (\"the silver headphones\"), drag a box around it, or ask for something cheaper or in another color. When you like a match, say \"buy the first one\".",
    );
  }
  if (intent.kind === "buy") {
    const ids = ctx.state.resultIds ?? [];
    if (ids.length === 0) return finish("Let's find the product first — describe the object or drag a box around it.");
    const idx = intent.index == null ? 0 : intent.index < 0 ? ids.length - 1 : Math.min(intent.index, ids.length - 1);
    const p = getProduct(ids[idx])!;
    await proposeCheckout(ctx, p.id, intent.quantity);
    return finish(
      `Here's a checkout for ${intent.quantity > 1 ? `${intent.quantity} × ` : ""}${p.title}. The price comes from our catalog, not from me, and nothing is charged until you confirm with Fastlane.`,
    );
  }
  if (intent.kind === "cheaper") {
    const shown = (ctx.state.resultIds ?? []).map((id) => getProduct(id)!).filter(Boolean);
    const floor = shown.length ? Math.min(...shown.map((p) => p.priceCents)) : null;
    const items = findProducts(ctx, {
      object: ctx.state.object,
      color: ctx.state.color,
      maxPriceCents: floor != null ? floor - 1 : null,
    });
    return finish(
      items.length
        ? `Cheaper options: ${describeHits(ctx)}.`
        : `That was already the most affordable ${ctx.state.object ?? "match"} in the catalog.`,
    );
  }
  const object = intent.object ?? ctx.state.object ?? null;
  const color = intent.color ?? (intent.object ? null : (ctx.state.color ?? null));
  const maxPriceCents = intent.maxPriceCents ?? (intent.object ? null : (ctx.state.maxPriceCents ?? null));
  if (!object && !ctx.scene?.selection) {
    return finish(
      `I couldn't tell which object you mean. I can search for things like ${objects.slice(0, 8).join(", ")} — or drag a box around it in the frame.`,
    );
  }
  const items = findProducts(ctx, { object, color, maxPriceCents });
  return finish(
    items.length
      ? `Top matches${color ? ` in ${color}` : ""}${maxPriceCents ? ` under ${usd(maxPriceCents)}` : ""}: ${describeHits(ctx)}.`
      : "Nothing in the catalog fits that. Try a higher budget or a different color.",
  );
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "find_products",
      description:
        "Locate an object in the user's frame (if one is loaded) and return the closest catalog products. Use for any new search, refinement (color, budget) or 'show me the X instead'.",
      parameters: {
        type: "object",
        properties: {
          object: { type: "string", enum: objects, description: "Catalog object type that best matches what the user means." },
          color: { type: "string", enum: [...COLORS], description: "Optional color filter." },
          max_price_usd: { type: "number", description: "Optional budget ceiling in USD." },
        },
        required: ["object"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_checkout",
      description:
        "Propose a checkout for a product the user explicitly asked to buy. Only products already shown in results are allowed. This never charges anything: the user must confirm with PayPal Fastlane.",
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

type GroqMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type GroqToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

function systemPrompt(ctx: ToolContext): string {
  const detections = ctx.scene && !ctx.scene.selection ? detectObjects(ctx.scene).map((d) => d.object) : [];
  return [
    "You are Visio, a shopping agent inside a chat. Users show you a frame from a film and ask to buy things they see.",
    "Use find_products to search and propose_checkout only when the user clearly asks to buy. Never invent products, prices, or order status.",
    "You cannot charge anyone: checkout always needs the user's Fastlane confirmation and a verified PayPal webhook.",
    "Keep replies to one or two short sentences; the UI already shows product cards. Refer to results as #1, #2, ...",
    `Catalog object types: ${objects.join(", ")}.`,
    detections.length ? `Objects visible in the current frame (strongest first): ${detections.join(", ")}.` : "",
    ctx.scene?.selection ? "The user drew a box around one region; find_products will search that region." : "",
    ctx.state.resultIds?.length ? `Results currently on screen: ${ctx.state.resultIds.map((id, i) => `#${i + 1} ${id} ${getProduct(id)?.title} ${usd(getProduct(id)?.priceCents ?? 0)}`).join("; ")}.` : "",
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
      body: JSON.stringify({
        model,
        messages: convo,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 400,
      }),
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
      if (call.function.name === "find_products") {
        const maxUsd = typeof args.max_price_usd === "number" ? args.max_price_usd : null;
        const items = findProducts(ctx, {
          object: typeof args.object === "string" ? args.object : null,
          color: typeof args.color === "string" ? args.color : null,
          maxPriceCents: maxUsd != null ? Math.round(maxUsd * 100) : null,
        });
        result = items.map((h, i) => ({ rank: i + 1, id: h.id, title: h.title, price: usd(h.priceCents) }));
      } else if (call.function.name === "propose_checkout") {
        result = await proposeCheckout(
          ctx,
          String(args.product_id ?? ""),
          typeof args.quantity === "number" ? args.quantity : 1,
        );
      } else {
        result = { error: "unknown tool" };
      }
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "Here's what I found.", cards: ctx.cards, state: ctx.state, engine: "groq" };
}

export async function runAgent(
  messages: ChatMessage[],
  scene: DecodedScene | null,
  state: SearchState,
): Promise<ChatResponse> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (apiKey) {
    try {
      return await runGroq(messages, { scene, state: { ...state }, cards: [] }, apiKey);
    } catch (error) {
      console.warn("groq unavailable, using rule engine:", error instanceof Error ? error.message : "unknown");
    }
  }
  return runRules(messages, { scene, state: { ...state }, cards: [] });
}
