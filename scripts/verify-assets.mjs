// Verify seeded garment assets: alpha coverage, trim box, mean color.
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = path.resolve(".storage/garments/processed");
const files = (await fs.readdir(root)).filter((f) => f.endsWith(".webp"));

for (const f of files.sort()) {
  const img = sharp(path.join(root, f));
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let semi = 0;
  let r = 0, g = 0, b = 0;
  const px = new Uint8Array(data.buffer, data.byteOffset, data.length);
  for (let i = 0; i < info.width * info.height; i++) {
    const a = px[i * 4 + 3];
    if (a > 250) { opaque++; r += px[i*4]; g += px[i*4+1]; b += px[i*4+2]; }
    else if (a > 0) semi++;
  }
  const total = info.width * info.height;
  const avg = opaque ? [r,g,b].map((v) => Math.round(v / opaque)) : [0,0,0];
  console.log(
    `${f.padEnd(28)} ${info.width}x${info.height} opaque:${((opaque/total)*100).toFixed(1)}% semi:${((semi/total)*100).toFixed(1)}% avgRGB:${avg.join(",")}`
  );
}
