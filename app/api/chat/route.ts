import { decodeQuery, runAgent } from "@/lib/agent";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { chatRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  if (!rateLimit("chat", clientKey(request), 30)) return tooMany();
  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ error: "Request too large" }, { status: 413 });

  let parsed;
  try {
    parsed = chatRequestSchema.safeParse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const { messages, state } = parsed.data;
  const lastUser = messages.filter((m) => m.role === "user").at(-1);
  if (!lastUser) return Response.json({ error: "Say something first" }, { status: 400 });

  return Response.json(await runAgent(messages, decodeQuery(lastUser.content, parsed.data.query), state));
}
