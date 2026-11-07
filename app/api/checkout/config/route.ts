import { connection } from "next/server";
import { paypalConfig, sdkClientToken } from "@/lib/paypal";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";

function requestDomain(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host") || new URL(request.url).host;
  return host.replace(/:\d+$/, "");
}

export async function GET(request: Request) {
  await connection();
  const cfg = paypalConfig();
  if (!cfg) return Response.json({ mode: "demo" });
  if (!rateLimit("client-token", clientKey(request), 10)) return tooMany();
  try {
    const clientToken = await sdkClientToken(cfg, requestDomain(request));
    return Response.json(
      { mode: "sandbox", clientId: cfg.clientId, clientToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.warn("fastlane client token failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ mode: "demo", reason: "PayPal Sandbox is unreachable right now" });
  }
}
