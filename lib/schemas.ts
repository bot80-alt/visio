import { z } from "zod";
import { CLIP_DIM, TEXT_DIM } from "./model";

// int8-packed vectors: dim bytes → ceil(dim / 3) * 4 base64 chars.
const packed = (dim: number) =>
  z.object({
    s: z.number().finite().positive().max(10),
    q: z.string().length(Math.ceil(dim / 3) * 4),
  });

const vectors = z.object({ t: packed(TEXT_DIM), v: packed(CLIP_DIM).nullable().optional() });

export const chatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1000) }))
    .min(1)
    .max(12),
  query: z.object({ message: vectors, combined: vectors.nullable().optional() }).nullable().optional(),
  state: z
    .object({
      anchor: z.string().max(600).nullable().optional(),
      category: z.string().max(64).nullable().optional(),
      color: z.string().max(16).nullable().optional(),
      maxPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
      resultIds: z.array(z.string().max(16)).max(8).optional(),
    })
    .default({}),
});

export const shippingSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  addressLine1: z.string().trim().min(3).max(300),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(40),
  postalCode: z.string().trim().min(3).max(20),
  countryCode: z.string().trim().length(2).toUpperCase(),
});

export const createOrderSchema = z.object({
  proposal: z.string().min(10).max(1024),
  mode: z.enum(["sandbox", "demo"]),
  paymentToken: z.string().min(4).max(512).optional(),
  shipping: shippingSchema.optional(),
});
