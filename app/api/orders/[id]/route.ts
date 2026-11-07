import { getOrderView } from "@/lib/orders";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  if (!rateLimit("order-status", clientKey(request), 90)) return tooMany();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const order = await getOrderView(id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(order, { headers: { "Cache-Control": "no-store" } });
}
