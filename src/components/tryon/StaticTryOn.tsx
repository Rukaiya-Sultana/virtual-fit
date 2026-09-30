"use client";

import { useEffect, useRef, useState } from "react";
import type { Adjustments, BodyLandmarks, Garment } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import { buildTorsoFrame, computePlacement } from "@/lib/fitting/engine";
import { drawGarmentMesh } from "@/lib/fitting/render";
import { loadGarmentImage } from "@/lib/fitting/garment-loader";

export interface StaticTryOnProps {
  photo: HTMLImageElement;
  landmarks: BodyLandmarks;
  garment: Garment;
  adjustments?: Partial<Adjustments>;
  className?: string;
}

/** One-shot rendered try-on (used in comparisons and previews). */
export function StaticTryOn({
  photo,
  landmarks,
  garment,
  adjustments,
  className,
}: StaticTryOnProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const img = await loadGarmentImage(garment.assetPath);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = photo.naturalWidth || photo.width;
        canvas.height = photo.naturalHeight || photo.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

        const frame = buildTorsoFrame(landmarks, canvas.width, canvas.height);
        const adj: Adjustments = {
          ...DEFAULT_ADJUSTMENTS,
          fit: garment.fit,
          ...adjustments,
        };
        const placement = computePlacement(frame, garment, adj, {
          width: canvas.width,
          height: canvas.height,
        });
        drawGarmentMesh(ctx, img, placement, {
          opacity: adj.opacity,
          shadowBlur: 10,
          shadowAlpha: 0.28,
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photo, landmarks, garment, adjustments]);

  if (failed) {
    return (
      <div className={className}>
        <div className="w-full h-full grid place-items-center text-xs text-zinc-500">
          Garment asset unavailable
        </div>
      </div>
    );
  }

  return <canvas ref={canvasRef} className={className} />;
}
