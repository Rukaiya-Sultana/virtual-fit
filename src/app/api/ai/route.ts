import { NextResponse } from "next/server";
import { z } from "zod";
import { askAssistant } from "@/lib/ai/assistant";
import { config } from "@/lib/config";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z.string().min(1).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .max(12)
    .optional(),
  currentGarmentId: z.string().max(64).optional(),
});

/**
 * POST /api/ai — natural-language assistant endpoint.
 * Returns validated, clamped structured commands. Works with or without an
 * LLM key (falls back to the deterministic local NLU engine).
 */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "ai"), config.aiRateLimitPerMinute);
  if (!rl.ok) {
    return NextResponse.json(
      {
        message: "You're sending messages a bit fast — give me a moment.",
        commands: [],
        engine: "local",
        limited: true,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { message, history, currentGarmentId } = parsed.data;

  try {
    const response = await askAssistant(message, history ?? [], currentGarmentId);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[ai] assistant failed:", err);
    // The try-on keeps working; report a graceful assistant failure.
    return NextResponse.json(
      {
        message: "The assistant is unavailable right now, but the fitting room still works.",
        commands: [],
        engine: "local",
      },
      { status: 200 }
    );
  }
}
