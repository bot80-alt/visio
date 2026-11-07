import "server-only";

type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "anon";
}

// Per-instance token bucket. It bounds how fast one visitor can spend LLM or
// PayPal calls; it is not a global quota.
export function rateLimit(scope: string, key: string, perMinute: number): boolean {
  const id = `${scope}:${key}`;
  const now = Date.now();
  const b = buckets.get(id) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(id, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(id, b);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.at > 120_000) buckets.delete(k);
  }
  return true;
}

export function tooMany() {
  return Response.json({ error: "Too many requests. Give it a few seconds." }, { status: 429 });
}
