import "server-only";
import type { Product } from "./types";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string | null;
  apiBase: string;
};

export function paypalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  // Visio only ever talks to the Sandbox; production would need merchant onboarding.
  return {
    clientId,
    clientSecret,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() || null,
    apiBase: "https://api-m.sandbox.paypal.com",
  };
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId: string | null,
  ) {
    super(message);
  }
}

let tokenCache: { token: string; exp: number } | null = null;

function basicAuth(cfg: PayPalConfig) {
  return `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
}

async function paypalFetch(cfg: PayPalConfig, path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${cfg.apiBase}${path}`, { ...init, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    let issue = res.statusText;
    try {
      const body = await res.json();
      issue = body?.details?.[0]?.issue ?? body?.name ?? body?.error ?? issue;
    } catch {}
    throw new PayPalError(`PayPal ${path} failed: ${issue}`, res.status, res.headers.get("paypal-debug-id"));
  }
  return res;
}

export async function accessToken(cfg: PayPalConfig): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await paypalFetch(cfg, "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: basicAuth(cfg), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

// Fastlane is initialised in the browser with a short-lived, domain-scoped SDK client token.
export async function sdkClientToken(cfg: PayPalConfig, domain: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    response_type: "client_token",
    intent: "sdk_init",
  });
  params.append("domains[]", domain);
  const res = await paypalFetch(cfg, "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: basicAuth(cfg), "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export type Shipping = {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

export type PayPalOrder = {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function createCardOrder(
  cfg: PayPalConfig,
  input: {
    product: Product;
    quantity: number;
    singleUseToken: string;
    shipping: Shipping;
    referenceId: string;
    requestId: string;
  },
): Promise<PayPalOrder> {
  const { product, quantity, shipping } = input;
  const total = product.priceCents * quantity;
  const body = {
    intent: "CAPTURE",
    payment_source: { card: { single_use_token: input.singleUseToken } },
    purchase_units: [
      {
        reference_id: input.referenceId,
        custom_id: input.referenceId,
        description: `Visio: ${product.title}`.slice(0, 127),
        amount: {
          currency_code: product.currency,
          value: money(total),
          breakdown: { item_total: { currency_code: product.currency, value: money(total) } },
        },
        items: [
          {
            name: product.title.slice(0, 127),
            sku: product.id,
            quantity: String(quantity),
            category: "PHYSICAL_GOODS",
            unit_amount: { currency_code: product.currency, value: money(product.priceCents) },
          },
        ],
        shipping: {
          type: "SHIPPING",
          name: { full_name: shipping.fullName.slice(0, 300) },
          address: {
            address_line_1: shipping.addressLine1,
            ...(shipping.addressLine2 ? { address_line_2: shipping.addressLine2 } : {}),
            admin_area_2: shipping.city,
            admin_area_1: shipping.state,
            postal_code: shipping.postalCode,
            country_code: shipping.countryCode,
          },
        },
      },
    ],
  };
  const res = await paypalFetch(cfg, "/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(cfg)}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.requestId,
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as PayPalOrder;
}

export async function captureOrder(cfg: PayPalConfig, orderId: string, requestId: string): Promise<PayPalOrder> {
  const res = await paypalFetch(cfg, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(cfg)}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
  });
  return (await res.json()) as PayPalOrder;
}

export function firstCapture(order: PayPalOrder): { id: string; status: string } | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}
