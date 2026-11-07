import { z } from "zod";
import { EMBEDDING_DIM } from "./model";

const box = z.object({
  x: z.number().finite().min(0).max(20000),
  y: z.number().finite().min(0).max(20000),
  w: z.number().finite().min(1).max(20000),
  h: z.number().finite().min(1).max(20000),
});

// int8-packed 768-d vector → 1024 base64 chars.
const packed = z.object({
  s: z.number().finite().positive().max(10),
  q: z.string().length(Math.ceil(EMBEDDING_DIM / 3) * 4),
});

const crop = z.object({ box, v: packed });

export const chatRequestSchema = z.object({
  intent: z.enum(["scan", "message"]).default("message"),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1000) }))
    .max(12)
    .default([]),
  scene: z
    .object({
      width: z.number().int().min(1).max(20000),
      height: z.number().int().min(1).max(20000),
      crops: z.array(crop).max(64),
      selection: crop.nullable().optional(),
    })
    .nullable()
    .optional(),
  state: z
    .object({
      object: z.string().max(64).nullable().optional(),
      color: z.string().max(16).nullable().optional(),
      maxPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
      box: box.nullable().optional(),
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
