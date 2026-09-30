// Validate catalog.json against the zod GarmentSchema
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const root = path.resolve(process.env.STORAGE_ROOT?.trim() || "./.storage");
const raw = JSON.parse(readFileSync(path.join(root, "catalog", "catalog.json"), "utf8"));

const Anchors = z.object({
  leftShoulder: z.object({ x: z.number(), y: z.number() }),
  rightShoulder: z.object({ x: z.number(), y: z.number() }),
  leftHem: z.object({ x: z.number(), y: z.number() }),
  rightHem: z.object({ x: z.number(), y: z.number() }),
});

const Garment = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  name: z.string().min(1).max(80),
  category: z.enum(["tshirt", "shirt", "hoodie", "jacket"]),
  color: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fit: z.enum(["slim", "regular", "oversized"]),
  sleeve: z.enum(["short", "long", "none"]),
  style: z.array(z.string().min(1).max(30)).max(8),
  formality: z.number().int().min(1).max(5),
  occasions: z.array(z.string().min(1).max(40)).max(10),
  lengthFactor: z.number().min(0.5).max(2.5),
  assetPath: z.string().min(1),
  originalPath: z.string().min(1),
  thumbnailPath: z.string().min(1),
  anchors: Anchors,
  width: z.number().int().positive().max(6000),
  height: z.number().int().positive().max(6000),
  createdAt: z.string(),
});

let ok = 0;
for (const g of raw.garments) {
  const r = Garment.safeParse(g);
  if (r.success) ok++;
  else console.log(`✗ ${g.id}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
}
console.log(`${ok}/${raw.garments.length} garments valid`);
