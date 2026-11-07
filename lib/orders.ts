import "server-only";
import { getProduct } from "./catalog";
import { sql } from "./db";
import type { CheckoutMode, OrderStatus, OrderView } from "./types";

type OrderRow = {
  id: string;
  proposal_nonce: string;
  product_id: string;
  quantity: number;
  amount_cents: number;
  currency: string;
  mode: CheckoutMode;
  status: OrderStatus;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  webhook_verified: boolean;
  last_event_type: string | null;
};

export class NonceReusedError extends Error {}

export async function insertOrder(o: {
  id: string;
  nonce: string;
  productId: string;
  quantity: number;
  amountCents: number;
  currency: string;
  mode: CheckoutMode;
  status: OrderStatus;
}): Promise<void> {
  const rows = await sql<{ id: string }>(
    `insert into orders (id, proposal_nonce, product_id, quantity, amount_cents, currency, mode, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (proposal_nonce) do nothing
     returning id`,
    [o.id, o.nonce, o.productId, o.quantity, o.amountCents, o.currency, o.mode, o.status],
  );
  if (rows.length === 0) throw new NonceReusedError("proposal already used");
}

export async function recordPayPalResult(
  id: string,
  paypalOrderId: string,
  captureId: string | null,
  status: OrderStatus,
): Promise<void> {
  // A webhook can land before this write; never downgrade a verified terminal state.
  await sql(
    `update orders
       set paypal_order_id = $2,
           paypal_capture_id = coalesce(paypal_capture_id, $3),
           status = case when webhook_verified then status else $4 end,
           updated_at = now()
     where id = $1`,
    [id, paypalOrderId, captureId, status],
  );
}

export async function setStatus(id: string, status: OrderStatus): Promise<void> {
  await sql("update orders set status = $2, updated_at = now() where id = $1 and not webhook_verified", [id, status]);
}

export async function applyVerifiedEvent(opts: {
  paypalOrderId: string;
  captureId: string | null;
  eventType: string;
  status: OrderStatus | null;
}): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `update orders
        set webhook_verified = webhook_verified or $4::text is not null,
            last_event_type = $3,
            paypal_capture_id = coalesce($2, paypal_capture_id),
            status = coalesce($4::text, status),
            updated_at = now()
      where paypal_order_id = $1
      returning id`,
    [opts.paypalOrderId, opts.captureId, opts.eventType, opts.status],
  );
  return rows.length > 0;
}

export async function seenWebhook(transmissionId: string): Promise<boolean> {
  const rows = await sql("select 1 from webhook_events where transmission_id = $1", [transmissionId]);
  return rows.length > 0;
}

export async function recordWebhookEvent(e: {
  transmissionId: string;
  eventId: string;
  eventType: string;
  resourceId: string | null;
}): Promise<boolean> {
  const rows = await sql<{ transmission_id: string }>(
    `insert into webhook_events (transmission_id, event_id, event_type, resource_id)
     values ($1, $2, $3, $4)
     on conflict (transmission_id) do nothing
     returning transmission_id`,
    [e.transmissionId, e.eventId, e.eventType, e.resourceId],
  );
  return rows.length > 0;
}

export async function getOrderView(id: string): Promise<OrderView | null> {
  const rows = await sql<OrderRow>("select * from orders where id = $1", [id]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    mode: r.mode,
    productTitle: getProduct(r.product_id)?.title ?? r.product_id,
    quantity: r.quantity,
    amountCents: r.amount_cents,
    currency: r.currency,
    webhookVerified: r.webhook_verified,
    paypalOrderId: r.paypal_order_id,
    lastEventType: r.last_event_type,
  };
}
