import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "./db";

let cached: Promise<string> | undefined;

// TRUST_GATE_SECRET wins when set. Otherwise a random key is generated once and
// kept in the app database so every server instance signs with the same key.
export function trustGateSecret(): Promise<string> {
  const fromEnv = process.env.TRUST_GATE_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return Promise.resolve(fromEnv);
  cached ??= (async () => {
    await sql(
      "insert into app_settings (key, value) values ('trust_gate_secret', $1) on conflict (key) do nothing",
      [randomBytes(32).toString("hex")],
    );
    const rows = await sql<{ value: string }>("select value from app_settings where key = 'trust_gate_secret'");
    return rows[0].value;
  })().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
