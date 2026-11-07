import { runAgent, scanScene } from "@/lib/agent";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { chatRequestSchema } from "@/lib/schemas";
import { decodeScene } from "@/lib/search";

export async function POST(request: Request) {
  if (!rateLimit("chat", clientKey(request), 30)) return tooMany();
  const raw = await request.text();
  if (raw.length > 200_000) return Response.json({ error: "Request too large" }, { status: 413 });

  let parsed;
  try {
    parsed = chatRequestSchema.safeParse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const { intent, messages, state } = parsed.data;
  const scene = decodeScene(parsed.data.scene ?? null);

  if (intent === "scan") {
    if (!scene) return Response.json({ error: "No frame to scan" }, { status: 400 });
    return Response.json(scanScene(scene, state));
  }
  if (!messages.some((m) => m.role === "user")) {
    return Response.json({ error: "Say something first" }, { status: 400 });
  }
  return Response.json(await runAgent(messages, scene, state));
}
