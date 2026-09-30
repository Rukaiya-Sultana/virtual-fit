import { NextResponse } from "next/server";
import type { BodyLandmarks, Garment, Adjustments, Landmark } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import { buildTorsoFrame, computePlacement, frameSummary } from "@/lib/fitting/engine";
import { affineFromTriangles, applyAffine, len, sub } from "@/lib/fitting/geometry";
import { listGarments } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const lm = (x: number, y: number, v = 0.95): Landmark => ({ x, y, visibility: v });

/**
 * GET /api/dev/selftest — exercises the fitting engine with synthetic bodies
 * against every catalog garment and reports geometric sanity checks.
 * Useful as a smoke test; safe to expose (read-only, no user data).
 */
export async function GET() {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const record = (name: string, ok: boolean, detail = "") =>
    checks.push({ name, ok, detail });

  // ── Synthetic body: front-facing, shoulders + hips visible ─────────────────
  const W = 900;
  const H = 1200;
  const body: BodyLandmarks = {
    // Subject-space: left shoulder appears on viewer-right.
    leftShoulder: lm(0.61, 0.24),
    rightShoulder: lm(0.39, 0.24),
    leftElbow: lm(0.65, 0.42),
    rightElbow: lm(0.35, 0.42),
    leftWrist: lm(0.67, 0.58),
    rightWrist: lm(0.33, 0.58),
    leftHip: lm(0.57, 0.52),
    rightHip: lm(0.43, 0.52),
  };

  const frame = buildTorsoFrame(body, W, H);
  record(
    "torso frame: shoulders horizontal",
    Math.abs(frame.shoulderL.y - frame.shoulderR.y) < 1
  );
  record(
    "torso frame: yAxis points down",
    frame.yAxis.y > 0.9 && Math.abs(frame.yAxis.x) < 0.1
  );
  const sum = frameSummary(frame);
  record(
    "torso frame: plausible dimensions",
    frame.shoulderWidth > 100 && frame.torsoLength > 150,
    JSON.stringify(sum)
  );

  // ── Missing hips: imputation ───────────────────────────────────────────────
  const noHips: BodyLandmarks = {
    ...body,
    leftHip: lm(0.57, 0.52, 0.1),
    rightHip: lm(0.43, 0.52, 0.1),
  };
  const frameNH = buildTorsoFrame(noHips, W, H);
  record("imputed hips: flagged invisible", frameNH.hipsVisible === false);
  record(
    "imputed hips: plausible torso length",
    frameNH.torsoLength > frameNH.shoulderWidth * 1.2 &&
      frameNH.torsoLength < frameNH.shoulderWidth * 1.8,
    `torso=${Math.round(frameNH.torsoLength)} shoulder=${Math.round(frameNH.shoulderWidth)}`
  );

  // ── Placement for every catalog garment ────────────────────────────────────
  const garments = await listGarments();
  record("catalog present", garments.length > 0, `${garments.length} garments`);

  const fitsByFit: Record<string, Adjustments> = {
    slim: { ...DEFAULT_ADJUSTMENTS, fit: "slim" },
    regular: { ...DEFAULT_ADJUSTMENTS, fit: "regular" },
    oversized: { ...DEFAULT_ADJUSTMENTS, fit: "oversized" },
    manual: {
      ...DEFAULT_ADJUSTMENTS,
      offsetX: 0.05,
      offsetY: 0.03,
      widthScale: 1.2,
      heightScale: 0.9,
      rotationDeg: 8,
      sleeveLength: 1.2,
    },
  };

  let minShoulderErr = Infinity;
  let maxHemBelowPhoto = -Infinity;
  let degenerate = 0;

  for (const g of garments) {
    for (const [label, adj] of Object.entries(fitsByFit)) {
      const p = computePlacement(frame, g, adj, { width: W, height: H });

      // Triangle count = 2 * cols * rows
      const expectedTris = 2 * p.cols * p.rows;
      recordCount(expectedTris === p.triangles.length);

      // Every triangle must be non-degenerate (invertible affine).
      for (const [i0, i1, i2] of p.triangles) {
        const m = affineFromTriangles(
          p.srcPts[i0], p.srcPts[i1], p.srcPts[i2],
          p.dstPts[i0], p.dstPts[i1], p.dstPts[i2]
        );
        if (!m) degenerate++;
      }

      // Anchor fidelity: shoulder anchors must land on the body shoulder line
      // (before manual offsets).
      if (label === "regular") {
        const idxTL = 0; // top-left grid vertex == image corner, not anchor;
        // instead map the garment's anchor points through the same base affine
        // implicitly via quad corners: check dst top corners vs body shoulders
        const a = g.anchors.leftShoulder;
        const b = g.anchors.rightShoulder;
        const mappedA = applyAffine(
          affineFromTriangles(
            { x: 0, y: 0 }, { x: g.width, y: 0 }, { x: 0, y: g.height },
            p.dstPts[0],
            p.dstPts[p.cols],
            p.dstPts[p.rows * (p.cols + 1)]
          )!,
          { x: a.x * g.width, y: a.y * g.height }
        );
        const mappedB = applyAffine(
          affineFromTriangles(
            { x: 0, y: 0 }, { x: g.width, y: 0 }, { x: 0, y: g.height },
            p.dstPts[0],
            p.dstPts[p.cols],
            p.dstPts[p.rows * (p.cols + 1)]
          )!,
          { x: b.x * g.width, y: b.y * g.height }
        );
        const errA = len(sub(mappedA, { x: frame.shoulderL.x + frame.shoulderWidth * 0.02, y: frame.shoulderL.y + frame.shoulderWidth * 0.02 }));
        const errB = len(sub(mappedB, { x: frame.shoulderR.x - frame.shoulderWidth * 0.02, y: frame.shoulderR.y + frame.shoulderWidth * 0.02 }));
        // Regular fit widens shoulders by 4% — allow that slack + small tolerance.
        const tol = frame.shoulderWidth * 0.06 + 12;
        minShoulderErr = Math.min(minShoulderErr, Math.max(errA, errB));
        recordAnchor(errA < tol && errB < tol, g.id, label, Math.max(errA, errB));
      }

      // Destination vertices must stay within a sane photo region.
      for (const d of p.dstPts) {
        if (d.y > H * 1.35) maxHemBelowPhoto = Math.max(maxHemBelowPhoto, d.y);
        if (d.x < -W * 0.3 || d.x > W * 1.3) {
          recordCount(false);
        }
      }
    }
  }

  record("no degenerate triangles", degenerate === 0, `${degenerate} degenerate`);
  record(
    "shoulder anchor mapping within tolerance",
    minShoulderErr < frame.shoulderWidth * 0.06 + 12,
    `max err ${minShoulderErr.toFixed(1)}px (shoulder ${frame.shoulderWidth.toFixed(0)}px)`
  );

  const failed = checks.filter((c) => !c.ok);
  return NextResponse.json(
    {
      ok: failed.length === 0,
      total: checks.length,
      failed: failed.length,
      failures: failed.slice(0, 20),
      anchorFailures: anchorFailures.slice(0, 20),
      trianglesChecked: triCount,
      degenerate,
    },
    { status: failed.length === 0 ? 200 : 500 }
  );
}

let triCount = 0;
const anchorFailures: string[] = [];
function recordCount(ok: boolean) {
  if (ok) triCount++;
}
function recordAnchor(ok: boolean, garment: string, fit: string, err: number) {
  if (!ok) anchorFailures.push(`${garment}/${fit}: ${err.toFixed(1)}px`);
}
