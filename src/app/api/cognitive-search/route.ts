import { searchCognitive } from "@/lib/cognitive";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const query =
    typeof body === "object" &&
    body !== null &&
    "query" in body &&
    typeof body.query === "string"
      ? body.query.trim()
      : "";

  if (!query) {
    return Response.json({ error: "Query is required." }, { status: 400 });
  }

  return Response.json(searchCognitive(query));
}
