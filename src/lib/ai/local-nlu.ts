// ─────────────────────────────────────────────────────────────────────────────
// Deterministic local NLU engine.
// Parses the specified natural-language command vocabulary with rules and
// fuzzy garment matching against the catalog. Used:
//   1. when no OPENROUTER_API_KEY is configured, and
//   2. as an automatic fallback when the LLM is unavailable/malformed.
// The core try-on system therefore NEVER depends on external AI services.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiCommand, AiResponse } from "./schema";
import type { Garment } from "@/types";

function magnitude(text: string): number {
  if (/\b(slightly|a little|a bit|tiny bit|touch|barely|just)\b/i.test(text)) return 0.35;
  if (/\b(way|much|a lot|significantly|heavily|far)\b/i.test(text)) return 1.0;
  if (/\b(somewhat|fairly|a bit more)\b/i.test(text)) return 0.6;
  return 0.6; // unqualified
}

function findGarments(text: string, catalog: Garment[]): Garment[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  const found: Array<{ g: Garment; score: number }> = [];

  for (const g of catalog) {
    let score = 0;
    const color = g.color.toLowerCase();
    const nameWords = g.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const categoryWords: Record<string, string[]> = {
      tshirt: ["t-shirt", "tshirt", "tee"],
      polo: ["polo"],
      shirt: ["shirt"],
      sweatshirt: ["sweatshirt", "crewneck", "crew neck", "sweater"],
      hoodie: ["hoodie", "hoody", "pullover"],
      jacket: ["jacket", "bomber", "trucker", "chore", "coat", "denim jacket"],
    };
    const catWords = categoryWords[g.category] ?? [g.category];

    // Full name match is strongest.
    const name = g.name.toLowerCase();
    if (t.includes(` ${name} `)) score += 6;

    // color + category co-occurrence ("the blue hoodie")
    const hasColor = t.includes(` ${color} `) || t.includes(` ${color}`);
    const hasCat = catWords.some((w) => t.includes(w));
    if (hasColor) score += 3;
    if (hasCat) score += 2;
    if (hasColor && hasCat) score += 2;

    // Distinctive name words ("oxford", "bomber", "trucker")
    for (const w of nameWords) {
      if (["the", "and", "fit", "try"].includes(w)) continue;
      if (t.includes(` ${w}`)) score += 2;
    }

    if (score > 0) found.push({ g, score });
  }

  return found.sort((a, b) => b.score - a.score).map((f) => f.g);
}

function withoutGarmentPhrases(text: string): string {
  return text
    .replace(/\b(the\s+)?[a-z]+[-\s]?(t-?shirt|tee|shirt|hoodie|hoody|sweatshirt|pullover|jacket|bomber|trucker|coat)\b/gi, " ")
    .replace(/\b(make|it|try|select|choose|pick|show|put on|wear|switch to|give me|me|the|a|an|please|can you|could you|would|i want|i'd like|let's|lets)\b/gi, " ")
    .toLowerCase();
}

/**
 * Parse a user utterance into structured commands. `catalog` must be the real
 * garment catalog so recommendations/selects reference existing IDs only.
 */
export function localNlu(text: string, catalog: Garment[], currentGarmentId?: string): AiResponse {
  const t = text.trim();
  const lower = t.toLowerCase();
  const commands: AiCommand[] = [];
  const m = magnitude(lower);

  // ── Garment selection ────────────────────────────────────────────────────
  const wantsSelect = /\b(try|select|choose|pick|show|put on|wear|switch to|give me)\b/.test(lower);
  const isCompare = /\b(compare|versus|vs\.?|difference between|which is better)\b/.test(lower);
  const matches = findGarments(t, catalog);

  // For comparisons, split the utterance around "and"/"vs" and match each half
  // separately so "the white dress shirt and the denim jacket" resolves to
  // exactly those two garments.
  if (isCompare) {
    const halves = lower
      .split(/\b(?:and|vs\.?|versus)\b/)
      .map((h) => h.trim())
      .filter(Boolean);
    if (halves.length >= 2) {
      const perHalf = halves
        .map((h) => findGarments(h, catalog)[0])
        .filter((g): g is Garment => Boolean(g));
      const unique = perHalf.filter((g, i) => perHalf.findIndex((x) => x.id === g.id) === i);
      if (unique.length >= 2) {
        return {
          message: `Comparing ${unique.slice(0, 3).map((g) => g.name).join(" vs ")}.`,
          commands: [
            {
              action: "compare",
              parameters: { garmentIds: unique.slice(0, 3).map((g) => g.id) },
            },
          ],
          engine: "local",
        };
      }
    }
  }

  if (matches.length > 0) {
    if (wantsSelect && !isCompare) {
      commands.push({ action: "select_garment", parameters: { garmentId: matches[0].id } });
      // "try the blue hoodie, make it oversized" → also parse the adjustment
      const rest = withoutGarmentPhrases(lower);
      const fitCmd = parseFit(rest, m);
      if (fitCmd) commands.push(fitCmd);
      return {
        message: `Switched to the ${matches[0].name}.`,
        commands,
        engine: "local",
      };
    }
  }

  // ── Comparison without obvious garment words ─────────────────────────────
  if (isCompare && matches.length >= 2) {
    commands.push({
      action: "compare",
      parameters: { garmentIds: matches.slice(0, 3).map((g) => g.id) },
    });
    return {
      message: "Opening the comparison view.",
      commands,
      engine: "local",
    };
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  if (/\b(reset|start over|revert|undo everything|default)\b/.test(lower)) {
    return {
      message: "Reset the garment to its automatic fit.",
      commands: [{ action: "reset_adjustments" }],
      engine: "local",
    };
  }

  // ── Fit adjustments ──────────────────────────────────────────────────────
  const fit = parseFit(lower, m);
  if (fit) commands.push(fit);

  // ── Movement ─────────────────────────────────────────────────────────────
  if (/\b(move|shift|nudge|slide|raise|lower|up|down|left|right|higher|lower)\b/.test(lower)) {
    let dx = 0;
    let dy = 0;
    const hasDown = /\b(down|lower|lower)\b/.test(lower);
    const hasUp = /\b(up|higher|raise)\b/.test(lower);
    const hasLeft = /\bleft\b/.test(lower);
    const hasRight = /\bright\b/.test(lower);
    if (hasDown) dy += 0.045 * m;
    if (hasUp) dy -= 0.045 * m;
    if (hasLeft) dx -= 0.045 * m;
    if (hasRight) dx += 0.045 * m;
    if (dx !== 0 || dy !== 0) {
      commands.push({ action: "move", parameters: { x: round(dx), y: round(dy) } });
    }
  }

  // ── Size ─────────────────────────────────────────────────────────────────
  if (/\b(bigger|larger|enlarge|size up|grow)\b/.test(lower)) {
    commands.push({ action: "resize", parameters: { scale: round(1 + 0.12 * m) } });
  } else if (/\b(smaller|shrink|reduce|size down)\b/.test(lower)) {
    commands.push({ action: "resize", parameters: { scale: round(1 - 0.1 * m) } });
  }
  if (/\b(longer|lengthen|extend)\b/.test(lower) && /\b(sleeve|sleeves)\b/.test(lower)) {
    commands.push({ action: "set_sleeves", parameters: { sleeveLength: round(1 + 0.15 * m) } });
  } else if (/\b(shorter|shorten)\b/.test(lower) && /\b(sleeve|sleeves)\b/.test(lower)) {
    commands.push({ action: "set_sleeves", parameters: { sleeveLength: round(1 - 0.15 * m) } });
  }

  // ── Rotation ─────────────────────────────────────────────────────────────
  const rotMatch = lower.match(/rotat\w*\b[^]*?(-?\d+(?:\.\d+)?)\s*(?:degrees?|deg|°)/);
  if (rotMatch) {
    commands.push({ action: "rotate", parameters: { degrees: Number(rotMatch[1]) } });
  } else if (/\brotate\b/.test(lower)) {
    const cw = !/counterclockwise|anti-?clockwise/.test(lower);
    commands.push({ action: "rotate", parameters: { degrees: round((cw ? 3 : -3) * m) } });
  }

  // ── Opacity ──────────────────────────────────────────────────────────────
  const opMatch = lower.match(/(\d{1,3})\s*%\s*(?:opacity|transparent|opacity to)/);
  if (/\b(opacity|transparent|see-?through)\b/.test(lower)) {
    const op = opMatch ? Number(opMatch[1]) / 100 : /more|increase/.test(lower) ? 1 : 0.6;
    commands.push({ action: "set_opacity", parameters: { opacity: Math.min(1, Math.max(0.1, op)) } });
  }

  if (commands.length > 0) {
    return {
      message: describeCommands(commands),
      commands,
      engine: "local",
    };
  }

  // ── Recommendations & explanations ───────────────────────────────────────
  if (/\b(recommend|suggest|what should|need something|looking for|outfit|wear to|something for)\b/.test(lower)) {
    const recommendations = recommendFromText(lower, catalog).map((g) => g.id);
    if (recommendations.length > 0) {
      commands.push({
        action: "recommend",
        parameters: { recommendations, occasion: lower.slice(0, 60) },
      });
      return {
        message: `Based on the catalog, I'd suggest: ${recommendations
          .map((id) => catalog.find((g) => g.id === id)?.name)
          .filter(Boolean)
          .join(", ")}.`,
        commands,
        engine: "local",
      };
    }
  }

  if (/\b(why|explain|difference|more formal|casual|when would)\b/.test(lower)) {
    const target =
      matches[0]?.id ?? currentGarmentId;
    commands.push({ action: "explain", parameters: { garmentId: target, comparison: /\bcompare|difference|versus\b/.test(lower) } });
    return {
      message: target ? "Here's what the catalog says about that piece." : "Select a garment first, then ask me about it.",
      commands,
      engine: "local",
    };
  }

  return {
    message:
      "I didn't catch that. Try things like “make it oversized”, “move it down a little”, “try the blue hoodie”, or ask me to compare two garments.",
    commands: [],
    engine: "local",
  };
}

function parseFit(lower: string, m: number): AiCommand | null {
  if (/\b(oversized|baggy|looser|loose|roomier|boxy|comfy fit)\b/.test(lower)) {
    return { action: "adjust_fit", parameters: { fit: "oversized", scale: round(1 + 0.08 * m) } };
  }
  if (/\b(tighter|tighter fit|slim|slimmer|fitted|snug|more fitted)\b/.test(lower)) {
    return { action: "adjust_fit", parameters: { fit: "slim", scale: round(1 - 0.06 * m) } };
  }
  if (/\b(regular fit|normal fit|standard fit|regular)\b/.test(lower)) {
    return { action: "adjust_fit", parameters: { fit: "regular", scale: 1 } };
  }
  if (/\bcenter|centre\b/.test(lower)) {
    return { action: "move", parameters: { x: 0, y: 0 } };
  }
  return null;
}

export function recommendFromText(lower: string, catalog: Garment[]): Garment[] {
  const wants =
    /\b(formal|office|interview|business|professional|dressy)\b/.test(lower)
      ? "formal"
      : /\b(university|uni|college|class|casual|everyday|relaxed|lounge|campus)\b/.test(lower)
        ? "casual"
        : /\b(party|night out|date|event|dinner)\b/.test(lower)
          ? "smart"
          : /\b(cold|winter|warm|cozy|chilly)\b/.test(lower)
            ? "warm"
            : "any";

  const warmCats = new Set(["hoodie", "jacket"]);
  const scored = catalog.map((g) => {
    let score = 0;
    if (wants === "formal") score = g.formality * 2 - (warmCats.has(g.category) ? 1 : 0);
    else if (wants === "casual") score = (6 - g.formality) + (g.occasions.some((o) => /casual|campus|everyday|university/i.test(o)) ? 2 : 0);
    else if (wants === "smart") score = Math.abs(g.formality - 4) * -1 + 2;
    else if (wants === "warm") score = (warmCats.has(g.category) ? 3 : 0) + (g.sleeve === "long" ? 2 : 0);
    else score = g.formality >= 2 ? 1 : 2;
    return { g, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.g);
}

function describeCommands(commands: AiCommand[]): string {
  const parts = commands.map((c) => {
    switch (c.action) {
      case "adjust_fit":
        return `fit → ${c.parameters.fit ?? "adjusted"}`;
      case "move":
        return `moved (${c.parameters.x ?? 0}, ${c.parameters.y ?? 0})`;
      case "resize":
        return `resized ×${c.parameters.scale ?? c.parameters.width ?? "?"}`;
      case "rotate":
        return `rotated ${c.parameters.degrees ?? 0}°`;
      case "set_opacity":
        return `opacity ${(c.parameters.opacity ?? 1) * 100}%`;
      case "set_sleeves":
        return `sleeve length ×${c.parameters.sleeveLength ?? 1}`;
      default:
        return c.action;
    }
  });
  return `Done — ${parts.join(", ")}.`;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
