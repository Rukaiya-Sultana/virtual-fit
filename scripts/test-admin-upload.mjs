// E2E: admin garment upload → processing → catalog listing → delete
// Uses local node_modules sharp + fetch against the dev server.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const results = [];
const step = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

// 1. Build a test garment PNG (simple tee silhouette, transparent bg)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="640">
  <path d="M180 60 C 195 90, 305 90, 320 60 L400 70 L470 220 L390 260 L370 200 L390 600 L110 600 L130 200 L110 260 L30 220 L100 70 Z"
        fill="#7a3b8f" stroke="#5c2c6d" stroke-width="4"/>
  <path d="M180 60 C 195 90, 305 90, 320 60" fill="none" stroke="#5c2c6d" stroke-width="10"/>
</svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
step("test garment PNG generated", png.length > 1000, `${png.length} bytes`);

// 2. Login
const login = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: "local-dev-admin-123" }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
step("admin login", login.ok, `cookie: ${cookie.slice(0, 20)}...`);

// 3. Upload with metadata + anchors
const meta = {
  id: "test-purple-tee",
  name: "Test Purple Tee",
  category: "tshirt",
  color: "purple",
  colorHex: "#7a3b8f",
  fit: "regular",
  sleeve: "short",
  style: ["casual", "test"],
  occasions: ["testing"],
  formality: 1,
  lengthFactor: 0,
  anchors: {
    leftShoulder: { x: 0.2, y: 0.1 },
    rightShoulder: { x: 0.8, y: 0.1 },
    leftHem: { x: 0.22, y: 0.93 },
    rightHem: { x: 0.78, y: 0.93 },
  },
};
const form = new FormData();
form.set("image", new Blob([png], { type: "image/png" }), "tee.png");
form.set("meta", JSON.stringify(meta));
const up = await fetch(`${BASE}/api/admin/garments`, {
  method: "POST",
  headers: { Cookie: cookie },
  body: form,
});
const upd = await up.json();
step("garment uploaded", up.ok, up.ok ? `${upd.garment.width}x${upd.garment.height}` : JSON.stringify(upd));

// 4. Appears in catalog API with all fields the client needs
const cat = await (await fetch(`${BASE}/api/garments`)).json();
const listed = cat.garments.find((g) => g.id === "test-purple-tee");
step("listed in catalog", Boolean(listed));
step(
  "all client-required fields present",
  Boolean(listed && listed.lengthFactor && listed.anchors && listed.assetPath && listed.thumbnailPath && listed.sleeve),
  listed ? `lengthFactor=${listed.lengthFactor}` : ""
);

// 5. Assets served
const asset = await fetch(`${BASE}/api/assets/${listed.assetPath}`);
const thumb = await fetch(`${BASE}/api/assets/${listed.thumbnailPath}`);
step("processed asset served", asset.ok, `${asset.status} ${asset.headers.get("content-type")}`);
step("thumbnail served", thumb.ok);

// 6. Unauthorized upload rejected
const badForm = new FormData();
badForm.set("image", new Blob([png], { type: "image/png" }), "tee.png");
badForm.set("meta", JSON.stringify(meta));
const unauth = await fetch(`${BASE}/api/admin/garments`, { method: "POST", body: badForm });
step("upload without cookie rejected", unauth.status === 401, `${unauth.status}`);

// 7. Delete
const del = await fetch(`${BASE}/api/admin/garments?id=test-purple-tee`, {
  method: "DELETE",
  headers: { Cookie: cookie },
});
step("cleanup delete", del.ok);
const cat2 = await (await fetch(`${BASE}/api/garments`)).json();
step("removed from catalog", !cat2.garments.some((g) => g.id === "test-purple-tee"));
