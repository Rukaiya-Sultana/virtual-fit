import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Structured AI command schema.
// The AI assistant (LLM or local NLU) may ONLY emit these commands. They are
// validated with zod and clamped before the renderer applies them. The AI
// never touches arbitrary frontend code — only this data contract.
// ─────────────────────────────────────────────────────────────────────────────

export const AdjustFitParams = z.object({
  fit: z.enum(["slim", "regular", "oversized"]).optional(),
  /** Multiplicative scale on garment width, clamped to [0.6, 1.6]. */
  scale: z.number().finite().min(0.2).max(3).optional(),
});

export const MoveParams = z.object({
  /** Horizontal delta as a fraction of shoulder width. Clamped to ±0.25. */
  x: z.number().finite().min(-1).max(1).optional(),
  /** Vertical delta as a fraction of torso length. Clamped to ±0.25. */
  y: z.number().finite().min(-1).max(1).optional(),
});

export const ResizeParams = z.object({
  width: z.number().finite().min(0.2).max(3).optional(),
  height: z.number().finite().min(0.2).max(3).optional(),
  scale: z.number().finite().min(0.2).max(3).optional(),
});

export const RotateParams = z.object({
  degrees: z.number().finite().min(-180).max(180).optional(),
});

export const OpacityParams = z.object({
  opacity: z.number().finite().min(0.05).max(1).optional(),
});

export const SleeveParams = z.object({
  sleeveLength: z.number().finite().min(0.5).max(1.6).optional(),
});

export const SelectParams = z.object({
  garmentId: z.string().min(1).max(64),
});

export const CompareParams = z.object({
  garmentIds: z.array(z.string().min(1).max(64)).min(2).max(3),
});

export const RecommendParams = z.object({
  occasion: z.string().max(60).optional(),
  /** Garment IDs from the catalog (validated against the real catalog). */
  recommendations: z.array(z.string().min(1).max(64)).max(6).optional(),
});

export const ExplainParams = z.object({
  garmentId: z.string().min(1).max(64).optional(),
  comparison: z.boolean().optional(),
});

export const AiCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("adjust_fit"), parameters: AdjustFitParams }),
  z.object({ action: z.literal("move"), parameters: MoveParams }),
  z.object({ action: z.literal("resize"), parameters: ResizeParams }),
  z.object({ action: z.literal("rotate"), parameters: RotateParams }),
  z.object({ action: z.literal("set_opacity"), parameters: OpacityParams }),
  z.object({ action: z.literal("set_sleeves"), parameters: SleeveParams }),
  z.object({ action: z.literal("select_garment"), parameters: SelectParams }),
  z.object({ action: z.literal("reset_adjustments") }),
  z.object({ action: z.literal("compare"), parameters: CompareParams }),
  z.object({ action: z.literal("recommend"), parameters: RecommendParams }),
  z.object({ action: z.literal("explain"), parameters: ExplainParams }),
  z.object({ action: z.literal("unknown"), parameters: z.object({}).optional() }),
]);

export type AiCommand = z.infer<typeof AiCommandSchema>;

export const AiResponseSchema = z.object({
  /** Short human-readable reply shown in the chat. */
  message: z.string().min(1).max(600),
  /** Zero or more structured commands to apply. */
  commands: z.array(AiCommandSchema).max(5),
  /** Which engine produced this response. */
  engine: z.enum(["openrouter", "local"]),
});

export type AiResponse = z.infer<typeof AiResponseSchema>;

// ── Runtime clamping ─────────────────────────────────────────────────────────
// Applied after validation, before the UI state is touched.

export const CLAMPS = {
  offsetX: [-0.25, 0.25],
  offsetY: [-0.25, 0.25],
  widthScale: [0.5, 1.8],
  heightScale: [0.5, 1.8],
  rotationDeg: [-30, 30],
  opacity: [0.1, 1],
  sleeveLength: [0.7, 1.4],
  scale: [0.6, 1.6],
} as const;

export function clampNumber(v: number, [min, max]: readonly [number, number]): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** Clamp all numeric parameters of a validated command to safe ranges. */
export function clampCommand(command: AiCommand): AiCommand {
  switch (command.action) {
    case "adjust_fit":
      return {
        ...command,
        parameters: {
          ...command.parameters,
          scale:
            command.parameters.scale !== undefined
              ? clampNumber(command.parameters.scale, CLAMPS.scale)
              : undefined,
        },
      };
    case "move":
      return {
        ...command,
        parameters: {
          x:
            command.parameters.x !== undefined
              ? clampNumber(command.parameters.x, CLAMPS.offsetX)
              : undefined,
          y:
            command.parameters.y !== undefined
              ? clampNumber(command.parameters.y, CLAMPS.offsetY)
              : undefined,
        },
      };
    case "resize":
      return {
        ...command,
        parameters: {
          width:
            command.parameters.width !== undefined
              ? clampNumber(command.parameters.width, CLAMPS.widthScale)
              : undefined,
          height:
            command.parameters.height !== undefined
              ? clampNumber(command.parameters.height, CLAMPS.heightScale)
              : undefined,
          scale:
            command.parameters.scale !== undefined
              ? clampNumber(command.parameters.scale, CLAMPS.scale)
              : undefined,
        },
      };
    case "rotate":
      return {
        ...command,
        parameters: {
          degrees:
            command.parameters.degrees !== undefined
              ? clampNumber(command.parameters.degrees, CLAMPS.rotationDeg)
              : undefined,
        },
      };
    case "set_opacity":
      return {
        ...command,
        parameters: {
          opacity:
            command.parameters.opacity !== undefined
              ? clampNumber(command.parameters.opacity, CLAMPS.opacity)
              : undefined,
        },
      };
    case "set_sleeves":
      return {
        ...command,
        parameters: {
          sleeveLength:
            command.parameters.sleeveLength !== undefined
              ? clampNumber(command.parameters.sleeveLength, CLAMPS.sleeveLength)
              : undefined,
        },
      };
    default:
      return command;
  }
}
