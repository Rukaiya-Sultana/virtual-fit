import { config } from "../config";
import { listGarments } from "../catalog";
import type { Garment } from "@/types";
import { AiResponseSchema, clampCommand, type AiCommand, type AiResponse } from "./schema";
import { localNlu, recommendFromText } from "./local-nlu";

// ─────────────────────────────────────────────────────────────────────────────
// AI assistant orchestration.
// Primary: OpenRouter LLM (optional, free-tier models) grounded with the real
// catalog. Fallback: deterministic local NLU. Either path produces the same
// validated + clamped command contract — never raw code.
// ─────────────────────────────────────────────────────────────────────────────

function catalogSummary(garments: Garment[]): string {
  return garments
    .map(
      (g) =>
        `- id:${g.id} | ${g.name} | category:${g.category} | color:${g.color} | fit:${g.fit} | sleeve:${g.sleeve} | formality:${g.formality}/5 | style:${g.style.join(",")} | occasions:${g.occasions.join(",")}`
    )
    .join("\n");
}

function systemPrompt(garments: Garment[], currentGarmentId?: string): string {
  const current = garments.find((g) => g.id === currentGarmentId);
  return `You are the AI fashion assistant inside "Virtual Fit", a virtual try-on web app.
You NEVER see or analyze user photos. You operate ONLY on structured catalog data.

AVAILABLE GARMENTS (the only products that exist — never invent IDs):
${catalogSummary(garments)}
${current ? `\nCURRENTLY SELECTED GARMENT: ${current.id} (${current.name})` : ""}

You reply with STRICT JSON only, matching this schema:
{
  "message": string (max 2 sentences, plain text),
  "commands": [ max 5 commands ]
}

Allowed commands (JSON):
{"action":"adjust_fit","parameters":{"fit":"slim|regular|oversized","scale":1.1}}
{"action":"move","parameters":{"x":0,"y":0.03}}            // fractions; +x right, +y down; keep |x|,|y| <= 0.15
{"action":"resize","parameters":{"scale":1.1}}             // or {"width":1.1,"height":1.05}
{"action":"rotate","parameters":{"degrees":-4}}
{"action":"set_opacity","parameters":{"opacity":0.8}}
{"action":"set_sleeves","parameters":{"sleeveLength":1.15}}
{"action":"select_garment","parameters":{"garmentId":"<existing id>"}}
{"action":"reset_adjustments"}
{"action":"compare","parameters":{"garmentIds":["<id1>","<id2>"]}}
{"action":"recommend","parameters":{"recommendations":["<id1>","<id2>"],"occasion":"casual"}}
{"action":"explain","parameters":{"garmentId":"<id>","comparison":false}}
{"action":"unknown"}

Rules:
- For adjustments ("make it oversized", "move it down a little", "make it tighter"), emit the matching command with SMALL parameter values. "slightly/a little" ≈ 40% of a full step, "much" ≈ 100%.
- To switch garments ("try the blue shirt"), emit select_garment with the matching EXISTING id.
- For recommendations, pick 2-3 real catalog IDs that match the occasion and explain briefly from metadata (formality, style, occasions).
- For comparisons, use the compare command with exactly 2-3 existing IDs, then summarize differences (formality, fit, sleeve, color, occasions) in the message.
- Never mention bodies, appearance, or what the user looks like.
- If the request is unrelated to clothing or the try-on, use {"action":"unknown"} and a polite message.
- No markdown, no code, no extra keys. JSON only.`;
}

interface OpenRouterChoice {
  message?: { content?: string };
}
interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

/** Try to extract the first JSON object from an LLM reply. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenRouter(
  userText: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  garments: Garment[],
  currentGarmentId?: string
): Promise<AiResponse | null> {
  const key = config.openRouterKey;
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Virtual Fit",
      },
      body: JSON.stringify({
        model: config.openRouterModel,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(garments, currentGarmentId) },
          ...history.slice(-6),
          { role: "user", content: userText },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`[ai] OpenRouter HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = extractJson(content);
    const validated = AiResponseSchema.parse({ ...parsedObj(parsed), engine: "openrouter" });
    return {
      ...validated,
      commands: validated.commands.map(clampCommand),
    };
  } catch (err) {
    console.error("[ai] OpenRouter failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parsedObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/**
 * Main entry: ask the assistant. Tries the LLM when configured; always falls
 * back to the deterministic local NLU. Additionally post-validates any
 * garment IDs against the live catalog.
 */
export async function askAssistant(
  userText: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  currentGarmentId?: string
): Promise<AiResponse> {
  const garments = await listGarments();
  const ids = new Set(garments.map((g) => g.id));

  const llm = await callOpenRouter(userText, history, garments, currentGarmentId);
  if (llm) {
    const safe: AiCommand[] = [];
    for (const cmd of llm.commands) {
      if (cmd.action === "select_garment" && !ids.has(cmd.parameters.garmentId)) continue;
      if (cmd.action === "compare") {
        const valid = cmd.parameters.garmentIds.filter((id) => ids.has(id));
        if (valid.length < 2) continue;
        cmd.parameters.garmentIds = valid.slice(0, 3);
      }
      if (cmd.action === "recommend") {
        const valid = (cmd.parameters.recommendations ?? []).filter((id) => ids.has(id));
        if (valid.length === 0) {
          const local = recommendFromText(userText.toLowerCase(), garments).map((g) => g.id);
          if (local.length === 0) continue;
          cmd.parameters.recommendations = local;
        } else {
          cmd.parameters.recommendations = valid.slice(0, 3);
        }
      }
      if (cmd.action === "explain" && cmd.parameters.garmentId && !ids.has(cmd.parameters.garmentId)) {
        cmd.parameters.garmentId = currentGarmentId;
      }
      safe.push(clampCommand(cmd));
    }
    if (safe.length > 0 || llm.commands.length === 0) {
      return { ...llm, commands: safe };
    }
    // LLM produced only invalid commands → fall through to local NLU.
  }

  return localNlu(userText, garments, currentGarmentId);
}
