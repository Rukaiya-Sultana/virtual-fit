"use client";

// Applies validated AI commands to local try-on state. This is the ONLY bridge
// between the AI layer and the rendering engine — a strict data → state mapping.

import type { Adjustments, Garment } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import type { AiCommand } from "./schema";

export interface ApplyResult {
  adjustments: Adjustments;
  selectedGarmentId?: string;
  compareIds?: string[];
  recommendIds?: string[];
  explainGarmentId?: string;
  explainComparison?: boolean;
  humanSummary: string[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

export function applyCommands(
  commands: AiCommand[],
  current: Adjustments,
  currentGarmentId: string | undefined
): ApplyResult {
  let adj: Adjustments = { ...current };
  let selectedGarmentId: string | undefined;
  let compareIds: string[] | undefined;
  let recommendIds: string[] | undefined;
  let explainGarmentId: string | undefined;
  let explainComparison = false;
  const humanSummary: string[] = [];

  for (const cmd of commands) {
    switch (cmd.action) {
      case "adjust_fit": {
        const p = cmd.parameters;
        if (p.fit) {
          adj.fit = p.fit;
          adj.widthScale = 1;
          adj.heightScale = 1;
          humanSummary.push(`fit set to ${p.fit}`);
        }
        if (p.scale !== undefined) {
          const s = clamp(p.scale, 0.6, 1.6);
          adj.widthScale = clamp(adj.widthScale * s, 0.5, 1.8);
          adj.heightScale = clamp(adj.heightScale * (1 + (s - 1) * 0.5), 0.5, 1.8);
          humanSummary.push(`scaled ×${s.toFixed(2)}`);
        }
        break;
      }
      case "move": {
        const p = cmd.parameters;
        if (p.x !== undefined) adj.offsetX = clamp(adj.offsetX + p.x, -0.25, 0.25);
        if (p.y !== undefined) adj.offsetY = clamp(adj.offsetY + p.y, -0.25, 0.25);
        if (p.x === 0 && p.y !== undefined && p.y === 0) adj.offsetX = 0;
        humanSummary.push(
          p.x === 0 && p.y === 0 ? "centered" : `moved by (${p.x ?? 0}, ${p.y ?? 0})`
        );
        break;
      }
      case "resize": {
        const p = cmd.parameters;
        if (p.scale !== undefined) {
          const s = clamp(p.scale, 0.6, 1.6);
          adj.widthScale = clamp(adj.widthScale * s, 0.5, 1.8);
          adj.heightScale = clamp(adj.heightScale * s, 0.5, 1.8);
          humanSummary.push(`resized ×${s.toFixed(2)}`);
        }
        if (p.width !== undefined) {
          adj.widthScale = clamp(adj.widthScale * p.width, 0.5, 1.8);
          humanSummary.push(`width ×${p.width.toFixed(2)}`);
        }
        if (p.height !== undefined) {
          adj.heightScale = clamp(adj.heightScale * p.height, 0.5, 1.8);
          humanSummary.push(`height ×${p.height.toFixed(2)}`);
        }
        break;
      }
      case "rotate": {
        const deg = clamp(cmd.parameters.degrees ?? 0, -30, 30);
        adj.rotationDeg = clamp(adj.rotationDeg + deg, -30, 30);
        humanSummary.push(`rotated ${deg}°`);
        break;
      }
      case "set_opacity": {
        adj.opacity = clamp(cmd.parameters.opacity ?? 1, 0.1, 1);
        humanSummary.push(`opacity ${(adj.opacity * 100) | 0}%`);
        break;
      }
      case "set_sleeves": {
        adj.sleeveLength = clamp(cmd.parameters.sleeveLength ?? 1, 0.7, 1.4);
        humanSummary.push(`sleeve length ×${adj.sleeveLength.toFixed(2)}`);
        break;
      }
      case "select_garment": {
        selectedGarmentId = cmd.parameters.garmentId;
        adj = { ...DEFAULT_ADJUSTMENTS, fit: adj.fit };
        humanSummary.push("garment switched");
        break;
      }
      case "reset_adjustments": {
        adj = { ...DEFAULT_ADJUSTMENTS };
        humanSummary.push("reset to automatic fit");
        break;
      }
      case "compare": {
        compareIds = cmd.parameters.garmentIds;
        humanSummary.push("opening comparison");
        break;
      }
      case "recommend": {
        recommendIds = cmd.parameters.recommendations;
        humanSummary.push("showing recommendations");
        break;
      }
      case "explain": {
        explainGarmentId = cmd.parameters.garmentId ?? currentGarmentId;
        explainComparison = cmd.parameters.comparison ?? false;
        humanSummary.push("explaining");
        break;
      }
      case "unknown":
        break;
    }
  }

  return {
    adjustments: adj,
    selectedGarmentId,
    compareIds,
    recommendIds,
    explainGarmentId,
    explainComparison,
    humanSummary,
  };
}
