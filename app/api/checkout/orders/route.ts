import { randomUUID } from "node:crypto";
import { getProduct } from "@/lib/catalog";
import { insertOrder, NonceReusedError, recordPayPalResult, setStatus } from "@/lib/orders";
import { captureOrder, createCardOrder, firstCapture, paypalConfig, PayPalError } from "@/lib/paypal";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { createOrderSchema } from "@/lib/schemas";
import { trustGateSecret } from "@/lib/secrets";
import { ProposalError, verifyProposal } from "@/lib/trust-gate";

// Trust Gate execution step: the proposal's signature, expiry and single-use
// nonce are checked, then the amount is computed here from the catalog.
export async function POST(request: Request) {
  if (!rateLimit("orders", clientKey(request), 10)) return tooMany();
  let body;
  try {
    body = createOrderSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.success) return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  const { proposal, mode, paymentToken, shipping } = body.data;

  let payload;
  try {
    payload = verifyProposal(proposal, await trustGateSecret());
  } catch (error) {
    if (error instanceof ProposalError) {
      const msg = error.code === "expired" ? "This checkout expired. Ask Visio for a fresh one." : "Checkout proposal rejected by the Trust Gate.";
      return Response.json({ error: msg, code: error.code }, { status: 403 });
    }
    throw error;
  }

  const product = getProduct(payload.pid);
  if (!product) return Response.json({ error: "Product no longer available" }, { status: 410 });
  const amountCents = product.priceCents * payload.qty;
  const id = randomUUID();

  if (mode === "sandbox") {
    const cfg = paypalConfig();
    if (!cfg) return Response.json({ error: "PayPal Sandbox is not configured" }, { status: 503 });
    if (!paymentToken || !shipping) {
      return Response.json({ error: "Payment token and shipping address are required" }, { status: 400 });
    }
    try {
      await insertOrder({ id, nonce: payload.n, productId: product.id, quantity: payload.qty, amountCents, currency: product.currency, mode, status: "created" });
    } catch (error) {
      if (error instanceof NonceReusedError) return Response.json({ error: "This checkout was already used." }, { status: 409 });
      throw error;
    }
    try {
      let order = await createCardOrder(cfg, {
        product,
        quantity: payload.qty,
        singleUseToken: paymentToken,
        shipping,
        referenceId: id,
        requestId: `visio-create-${id}`,
      });
      if (order.status === "APPROVED") order = await captureOrder(cfg, order.id, `visio-capture-${id}`);
      const capture = firstCapture(order);
      const status =
        capture?.status === "COMPLETED" || capture?.status === "PENDING"
          ? "awaiting_webhook"
          : capture?.status === "DECLINED" || order.status === "VOIDED"
            ? "denied"
            : "failed";
      await recordPayPalResult(id, order.id, capture?.id ?? null, status);
      return Response.json({ orderId: id, status, paypalOrderId: order.id });
    } catch (error) {
      await setStatus(id, "failed");
      if (error instanceof PayPalError) {
        console.warn("paypal order failed", error.status, error.debugId);
        return Response.json({ error: "PayPal declined this payment. Try another card.", orderId: id }, { status: 402 });
      }
      throw error;
    }
  }

  try {
    await insertOrder({ id, nonce: payload.n, productId: product.id, quantity: payload.qty, amountCents, currency: product.currency, mode: "demo", status: "demo_paid" });
  } catch (error) {
    if (error instanceof NonceReusedError) return Response.json({ error: "This checkout was already used." }, { status: 409 });
    throw error;
  }
  return Response.json({ orderId: id, status: "demo_paid" });
}
