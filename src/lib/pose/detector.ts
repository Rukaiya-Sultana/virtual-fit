"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Browser-side body landmark detection using MediaPipe Pose Landmarker
// (free, open-source, runs entirely in the browser via WASM/GPU).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { BodyLandmarks, Landmark } from "@/types";

export type DetectionErrorCode =
  | "MODEL_LOAD_FAILED"
  | "NO_PERSON"
  | "LOW_CONFIDENCE"
  | "MISSING_SHOULDERS"
  | "MISSING_HIPS"
  | "TOO_SMALL"
  | "BAD_ANGLE";

export class DetectionError extends Error {
  code: DetectionErrorCode;
  hint: string;
  constructor(code: DetectionErrorCode, message: string, hint: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

export interface DetectionResult {
  landmarks: BodyLandmarks;
  /** Overall confidence 0..1 */
  confidence: number;
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function modelUrl(): string {
  const url = process.env.NEXT_PUBLIC_POSE_MODEL_URL?.trim();
  return url || "/models/pose_landmarker_lite.task";
}

/** Lazily create the singleton PoseLandmarker (GPU delegate with CPU fallback). */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker: PL } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const base = {
        runningMode: "IMAGE" as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      };
      const modelAssetPath = modelUrl();
      try {
        return await PL.createFromOptions(fileset, {
          ...base,
          baseOptions: { modelAssetPath, delegate: "GPU" },
        });
      } catch (err) {
        console.warn("[pose] GPU delegate unavailable, falling back to CPU:", err);
        return await PL.createFromOptions(fileset, {
          ...base,
          baseOptions: { modelAssetPath, delegate: "CPU" },
        });
      }
    })().catch((err) => {
      landmarkerPromise = null; // allow retry
      throw err;
    });
  }
  return landmarkerPromise;
}

const IDX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

const VISIBILITY_THRESHOLD = 0.55;

function pick(all: Landmark[], idx: number, what: string): Landmark {
  const lm = all[idx];
  if (!lm) throw new DetectionError("LOW_CONFIDENCE", `Could not locate the ${what}.`, "");
  return lm;
}

/**
 * Detect body landmarks on an image/canvas. Throws DetectionError with an
 * actionable, user-facing hint when the photo is unsuitable.
 */
export async function detectBody(
  source: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
): Promise<DetectionResult> {
  let landmarker: PoseLandmarker;
  try {
    landmarker = await getPoseLandmarker();
  } catch (err) {
    console.error("[pose] model load failed:", err);
    throw new DetectionError(
      "MODEL_LOAD_FAILED",
      "The pose detection engine could not be loaded.",
      "Check your internet connection or the self-hosted model files, then retry."
    );
  }

  const result = landmarker.detect(source as HTMLCanvasElement);
  const pose = result.landmarks?.[0];
  if (!pose || pose.length < 25) {
    throw new DetectionError(
      "NO_PERSON",
      "No person was detected in this photo.",
      "Make sure your full upper body is in frame, facing the camera in reasonable light."
    );
  }

  const all = pose as Landmark[];
  const raw: BodyLandmarks = {
    leftShoulder: pick(all, IDX.leftShoulder, "left shoulder"),
    rightShoulder: pick(all, IDX.rightShoulder, "right shoulder"),
    leftElbow: pick(all, IDX.leftElbow, "left elbow"),
    rightElbow: pick(all, IDX.rightElbow, "right elbow"),
    leftWrist: pick(all, IDX.leftWrist, "left wrist"),
    rightWrist: pick(all, IDX.rightWrist, "right wrist"),
    leftHip: pick(all, IDX.leftHip, "left hip"),
    rightHip: pick(all, IDX.rightHip, "right hip"),
  };

  // Confidence gate on the landmarks that actually matter for torso fitting.
  const critical: Array<[Landmark, string]> = [
    [raw.leftShoulder, "left shoulder"],
    [raw.rightShoulder, "right shoulder"],
  ];
  for (const [lm, name] of critical) {
    if ((lm.visibility ?? 0) < VISIBILITY_THRESHOLD) {
      throw new DetectionError(
        "MISSING_SHOULDERS",
        `The ${name} is not clearly visible.`,
        "Face the camera directly and keep both shoulders fully inside the photo."
      );
    }
  }

  const hipVisibility = Math.min(
    raw.leftHip.visibility ?? 0,
    raw.rightHip.visibility ?? 0
  );

  // Shoulder geometry checks
  const shoulderDist = Math.hypot(
    raw.leftShoulder.x - raw.rightShoulder.x,
    raw.leftShoulder.y - raw.rightShoulder.y
  );
  if (shoulderDist < 0.06) {
    throw new DetectionError(
      "TOO_SMALL",
      "You appear to be very far from the camera.",
      "Move closer so your upper body fills more of the frame."
    );
  }

  const shoulderAngleRad = Math.atan2(
    raw.leftShoulder.y - raw.rightShoulder.y,
    raw.leftShoulder.x - raw.rightShoulder.x
  );
  const angleDeg = Math.abs((shoulderAngleRad * 180) / Math.PI);
  // Deviation from horizontal: 0° = level shoulders, 90° = vertical line.
  // (170° is also near-level, just a reversed left/right direction.)
  const tilt = Math.min(angleDeg, 180 - angleDeg);
  if (tilt > 32) {
    throw new DetectionError(
      "BAD_ANGLE",
      "Your shoulders are strongly tilted relative to the camera.",
      "Stand upright and face the camera squarely for the best fit."
    );
  }

  const confidence =
    (raw.leftShoulder.visibility + raw.rightShoulder.visibility) / 2;

  // Hips below threshold are handled with imputation downstream — flag it.
  return { landmarks: raw, confidence: hipVisibility < 0.4 ? confidence * 0.8 : confidence };
}

/**
 * Normalize landmarks from a source canvas that may have been resized:
 * MediaPipe returns coordinates normalized to the input, so this is a no-op
 * kept for API clarity.
 */
export function toImageSpace(lm: BodyLandmarks, _w: number, _h: number): BodyLandmarks {
  return lm;
}
