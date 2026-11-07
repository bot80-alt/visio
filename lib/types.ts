import type { Box } from "./crops";
import type { PackedVector } from "./vector-codec";

export type { Box };

export type Product = {
  id: string;
  title: string;
  brand: string | null;
  category: string;
  object: string;
  description: string;
  priceCents: number;
  currency: string;
  rating: number;
  stock: number;
  image: string;
};

export type ProductHit = Pick<
  Product,
  "id" | "title" | "brand" | "object" | "priceCents" | "currency" | "image" | "rating"
> & { score: number };

export type Detection = { object: string; score: number; box: Box };

export type SceneCrop = { box: Box; v: PackedVector };

export type SceneContext = {
  width: number;
  height: number;
  crops: SceneCrop[];
  selection?: SceneCrop | null;
};

export type SearchState = {
  object?: string | null;
  color?: string | null;
  maxPriceCents?: number | null;
  box?: Box | null;
  resultIds?: string[];
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Card =
  | { type: "detections"; items: Detection[] }
  | {
      type: "products";
      object: string | null;
      color: string | null;
      box: Box | null;
      items: ProductHit[];
    }
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
