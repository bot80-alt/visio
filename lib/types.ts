import type { PackedVector } from "./vector-codec";

export type Product = {
  id: string;
  title: string;
  brand: string | null;
  category: string;
  tags: string[];
  description: string;
  priceCents: number;
  currency: string;
  rating: number;
  stock: number;
  image: string;
};

export type MatchSignals = {
  semantic: number;
  visual: number | null;
  categoryProb: number;
  attributeBoost: number;
  fused: number;
  match: number;
};

export type ProductHit = Pick<
  Product,
  "id" | "title" | "brand" | "category" | "priceCents" | "currency" | "image" | "rating"
> & { signals: MatchSignals };

/** Embeddings of one piece of text, computed in the browser. */
export type QueryVectors = { t: PackedVector; v?: PackedVector | null };

export type QueryEmbeddings = {
  /** The latest user message on its own. */
  message: QueryVectors;
  /** The active description plus the latest message, for refinements. */
  combined?: QueryVectors | null;
};

export type SearchState = {
  anchor?: string | null;
  category?: string | null;
  color?: string | null;
  maxPriceCents?: number | null;
  resultIds?: string[];
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Understanding = {
  description: string;
  refinement: boolean;
  categories: { name: string; prob: number }[];
  color: string | null;
  maxPriceCents: number | null;
  signals: ("semantic" | "visual")[];
  catalogSize: number;
  retrievalMs: number;
};

export type Card =
  | { type: "products"; items: ProductHit[]; understanding: Understanding }
  | {
      type: "checkout";
      proposal: string;
      expiresAt: number;
      quantity: number;
      product: ProductHit;
      totalCents: number;
    };

export type ChatResponse = {
  reply: string;
  cards: Card[];
  state: SearchState;
  engine: "groq" | "rules";
};

export type CheckoutMode = "sandbox" | "demo";

export type OrderStatus =
  | "created"
  | "awaiting_webhook"
  | "paid"
  | "denied"
  | "failed"
  | "demo_paid";

export type OrderView = {
  id: string;
  status: OrderStatus;
  mode: CheckoutMode;
  productTitle: string;
  quantity: number;
  amountCents: number;
  currency: string;
  webhookVerified: boolean;
  paypalOrderId: string | null;
  lastEventType: string | null;
};
