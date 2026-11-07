import { applyVerifiedEvent, recordWebhookEvent, seenWebhook } from "@/lib/orders";
import { paypalConfig } from "@/lib/paypal";
import type { OrderStatus } from "@/lib/types";
import { fetchPayPalCert, readWebhookHeaders, verifyPayPalWebhook } from "@/lib/webhook-verify";

type WebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

const STATUS_BY_EVENT: Record<string, OrderStatus> = {
  "PAYMENT.CAPTURE.COMPLETED": "paid",
  "PAYMENT.CAPTURE.DENIED": "denied",
  "PAYMENT.CAPTURE.DECLINED": "denied",
};

// The only path that marks an order as paid. Signature verification runs on the
// raw bytes before the body is parsed.
export async function POST(request: Request) {
  const cfg = paypalConfig();
  if (!cfg?.webhookId) return Response.json({ error: "Webhooks are not configured" }, { status: 503 });

  const headers = readWebhookHeaders(request.headers);
  if (!headers) return Response.json({ error: "Missing PayPal signature headers" }, { status: 400 });

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > 256_000) return Response.json({ error: "Payload too large" }, { status: 413 });

  const result = await verifyPayPalWebhook({
    headers,
    rawBody,
    webhookId: cfg.webhookId,
    fetchCert: fetchPayPalCert,
  });
  if (!result.ok) {
    console.warn("rejected paypal webhook:", result.reason);
    return Response.json({ error: "Signature verification failed" }, { status: 401 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventType = event.event_type ?? "UNKNOWN";
  if (await seenWebhook(headers.transmissionId)) return Response.json({ ok: true, replay: true });

  const orderId =
    eventType.startsWith("PAYMENT.CAPTURE.")
      ? event.resource?.supplementary_data?.related_ids?.order_id
      : eventType.startsWith("CHECKOUT.ORDER.")
        ? event.resource?.id
        : undefined;
  if (orderId) {
    const matched = await applyVerifiedEvent({
      paypalOrderId: orderId,
      captureId: eventType.startsWith("PAYMENT.CAPTURE.") ? (event.resource?.id ?? null) : null,
      eventType,
      status: STATUS_BY_EVENT[eventType] ?? null,
    });
    // The capture webhook can beat our own write of the PayPal order id; a
    // non-2xx makes PayPal redeliver it shortly.
    if (!matched) return Response.json({ error: "Order not known yet" }, { status: 409 });
  }
  await recordWebhookEvent({
    transmissionId: headers.transmissionId,
    eventId: event.id ?? headers.transmissionId,
    eventType,
    resourceId: event.resource?.id ?? null,
  });
  return Response.json({ ok: true });
}
