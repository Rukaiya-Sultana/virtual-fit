// ─────────────────────────────────────────────────────────────────────────────
// Seed the garment catalog with procedurally drawn demo garments.
// Each garment is drawn as an SVG (transparent background), rasterized with
// sharp into processed/thumbnail WebP assets, and registered in catalog.json
// with exact anchor geometry derived from the drawing coordinates.
//
// Replace these with real garment photos (transparent PNGs) via the admin UI.
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Load .env manually (this script runs outside Next.js).
try {
  const env = await fs.readFile(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env — fine */
}

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT?.trim() || "./.storage");

// ── SVG builders ─────────────────────────────────────────────────────────────

function defs(id, base, light, shade) {
  return `
  <defs>
    <linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="${shade}"/>
      <stop offset="0.16" stop-color="${base}"/>
      <stop offset="0.5"  stop-color="${light}"/>
      <stop offset="0.84" stop-color="${base}"/>
      <stop offset="1"    stop-color="${shade}"/>
    </linearGradient>
    <linearGradient id="v-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.16"/>
    </linearGradient>
  </defs>`;
}

function teeSvg(p) {
  const W = 600, H = 760;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [150, 96], rightShoulder: [450, 96], leftHem: [124, 690], rightHem: [476, 690] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("tee", p.base, p.light, p.shade)}
<path d="M250 88 C262 120 338 120 350 88 L450 96 L555 255 L468 300 L452 218 L476 690 L124 690 L148 218 L132 300 L45 255 L150 96 Z" fill="url(#g-tee)"/>
<path d="M250 88 C262 120 338 120 350 88 L450 96 L555 255 L468 300 L452 218 L476 690 L124 690 L148 218 L132 300 L45 255 L150 96 Z" fill="url(#v-tee)"/>
<path d="M250 88 C262 120 338 120 350 88" fill="none" stroke="${p.rib}" stroke-width="16" stroke-linecap="round"/>
<path d="M252 96 C264 124 336 124 348 96" fill="none" stroke="${p.shade}" stroke-width="3" opacity="0.5"/>
<path d="M148 218 L452 218 L460 300" fill="none" stroke="${p.shade}" stroke-width="4" opacity="0.28"/>
<path d="M55 243 L138 287" stroke="${p.rib}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
<path d="M545 243 L462 287" stroke="${p.rib}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
<path d="M124 676 L476 676" stroke="${p.shade}" stroke-width="5" opacity="0.4"/>
<path d="M210 630 Q 300 646 390 630" stroke="${p.shade}" stroke-width="3" fill="none" opacity="0.3"/>
<path d="M190 420 Q 300 436 410 420" stroke="${p.shade}" stroke-width="3" fill="none" opacity="0.22"/>
<path d="M300 690 L300 656 M300 630 L300 596" stroke="${p.light}" stroke-width="3" opacity="0.4"/>
</svg>`,
  };
}

function shirtSvg(p) {
  const W = 600, H = 800;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [145, 98], rightShoulder: [455, 98], leftHem: [130, 700], rightHem: [470, 700] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("sh", p.base, p.light, p.shade)}
<path d="M245 92 C258 124 342 124 355 92 L455 98 L565 540 L495 575 L450 240 L470 700 Q 300 726 130 700 L150 240 L105 575 L35 540 L145 98 Z" fill="url(#g-sh)"/>
<path d="M245 92 C258 124 342 124 355 92 L455 98 L565 540 L495 575 L450 240 L470 700 Q 300 726 130 700 L150 240 L105 575 L35 540 L145 98 Z" fill="url(#v-sh)"/>
<rect x="285" y="120" width="30" height="580" fill="${p.placket}" opacity="0.5"/>
<path d="M285 120 L285 700 M315 120 L315 700" stroke="${p.shade}" stroke-width="2" opacity="0.45"/>
<path d="M245 90 Q 300 70 355 90 L336 148 Q 300 120 264 148 Z" fill="${p.collar}" stroke="${p.shade}" stroke-width="2"/>
<path d="M300 106 L282 152 L300 142 Z" fill="${p.shade}" opacity="0.35"/>
${[170, 240, 310, 380, 450, 520].map((y) => `<circle cx="300" cy="${y}" r="7" fill="${p.button}" stroke="${p.shade}" stroke-width="1"/>`).join("")}
<path d="M446 548 L560 522 L578 566 L492 590 Z" fill="${p.cuff}" stroke="${p.shade}" stroke-width="2"/>
<path d="M154 548 L40 522 L22 566 L108 590 Z" fill="${p.cuff}" stroke="${p.shade}" stroke-width="2"/>
<path d="M150 240 L450 240" stroke="${p.shade}" stroke-width="4" opacity="0.25"/>
<path d="M170 560 Q 300 580 430 560" stroke="${p.shade}" stroke-width="3" fill="none" opacity="0.25"/>
</svg>`,
  };
}

function hoodieSvg(p) {
  const W = 640, H = 800;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [160, 108], rightShoulder: [480, 108], leftHem: [140, 726], rightHem: [500, 726] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("hd", p.base, p.light, p.shade)}
<path d="M210 130 Q 234 34 320 30 Q 406 34 430 130 Q 400 96 320 96 Q 240 96 210 130 Z" fill="${p.shade}" stroke="${p.rib}" stroke-width="4"/>
<path d="M244 110 Q 320 62 396 110 Q 380 90 320 88 Q 260 90 244 110 Z" fill="#000000" opacity="0.28"/>
<path d="M254 116 C270 152 370 152 386 116 L488 124 L596 560 L514 596 L472 250 L492 700 L148 700 L168 250 L126 596 L44 560 L152 124 Z" fill="url(#g-hd)"/>
<path d="M254 116 C270 152 370 152 386 116 L488 124 L596 560 L514 596 L472 250 L492 700 L148 700 L168 250 L126 596 L44 560 L152 124 Z" fill="url(#v-hd)"/>
<path d="M148 700 L492 700 L492 726 Q 320 740 148 726 Z" fill="${p.rib}"/>
<rect x="148" y="700" width="344" height="8" fill="${p.shade}" opacity="0.5"/>
<path d="M214 500 L426 500 L440 596 Q 320 612 200 596 Z" fill="none" stroke="${p.shade}" stroke-width="5" opacity="0.75"/>
<path d="M214 500 L426 500" stroke="${p.rib}" stroke-width="5" opacity="0.6"/>
<path d="M286 128 C280 190 284 240 296 268" stroke="${p.string}" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M354 128 C360 190 356 240 344 268" stroke="${p.string}" stroke-width="7" fill="none" stroke-linecap="round"/>
<circle cx="296" cy="272" r="6" fill="${p.shade}"/><circle cx="344" cy="272" r="6" fill="${p.shade}"/>
<path d="M52 552 L124 585 L114 612 L36 578 Z" fill="${p.rib}"/>
<path d="M588 552 L516 585 L526 612 L604 578 Z" fill="${p.rib}"/>
<path d="M168 250 L472 250" stroke="${p.shade}" stroke-width="4" opacity="0.25"/>
</svg>`,
  };
}

function jacketSvg(p) {
  const W = 640, H = 820;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [158, 112], rightShoulder: [482, 112], leftHem: [148, 716], rightHem: [492, 716] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("jk", p.base, p.light, p.shade)}
<path d="M252 108 C268 146 372 146 388 108 L492 116 L600 560 L520 598 L484 250 L500 660 L336 660 L336 160 L304 160 L304 660 L140 660 L156 250 L120 598 L40 560 L148 116 Z" fill="url(#g-jk)"/>
<path d="M252 108 C268 146 372 146 388 108 L492 116 L600 560 L520 598 L484 250 L500 660 L336 660 L336 160 L304 160 L304 660 L140 660 L156 250 L120 598 L40 560 L148 116 Z" fill="url(#v-jk)"/>
<path d="M140 660 L500 660 L500 716 L140 716 Z" fill="${p.band}"/>
<path d="M140 660 L500 660" stroke="${p.stitch}" stroke-width="3" stroke-dasharray="8 6" opacity="0.8"/>
<path d="M252 108 C268 146 372 146 388 108 L304 160 L252 108 Z" fill="${p.lapel}" stroke="${p.shade}" stroke-width="2"/>
<path d="M252 108 C268 146 372 146 388 108 L336 160 L388 108 Z" fill="${p.lapel}" stroke="${p.shade}" stroke-width="2" transform="translate(24 0)"/>
<path d="M304 160 L304 656 M336 160 L336 656" stroke="${p.shade}" stroke-width="3" opacity="0.6"/>
<rect x="176" y="300" width="120" height="16" rx="3" fill="${p.shade}" opacity="0.55"/>
<path d="M176 330 L296 330 L296 420 L176 420 Z" fill="none" stroke="${p.stitch}" stroke-width="3" stroke-dasharray="8 6"/>
<rect x="344" y="300" width="120" height="16" rx="3" fill="${p.shade}" opacity="0.55"/>
<path d="M344 330 L464 330 L464 420 L344 420 Z" fill="none" stroke="${p.stitch}" stroke-width="3" stroke-dasharray="8 6"/>
<circle cx="320" cy="230" r="8" fill="${p.button}" stroke="${p.shade}" stroke-width="2"/>
<circle cx="320" cy="470" r="8" fill="${p.button}" stroke="${p.shade}" stroke-width="2"/>
<path d="M156 250 L484 250" stroke="${p.shade}" stroke-width="4" opacity="0.3"/>
<path d="M46 540 L124 572 M594 540 L516 572" stroke="${p.stitch}" stroke-width="3" stroke-dasharray="8 6"/>
</svg>`,
  };
}

function poloSvg(p) {
  const W = 600, H = 760;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [150, 96], rightShoulder: [450, 96], leftHem: [128, 690], rightHem: [472, 690] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("po", p.base, p.light, p.shade)}
<path d="M252 96 C266 126 334 126 348 96 L450 102 L548 252 L464 296 L450 216 L472 690 L128 690 L150 216 L136 296 L52 252 L150 102 Z" fill="url(#g-po)"/>
<path d="M252 96 C266 126 334 126 348 96 L450 102 L548 252 L464 296 L450 216 L472 690 L128 690 L150 216 L136 296 L52 252 L150 102 Z" fill="url(#v-po)"/>
<rect x="290" y="98" width="20" height="118" fill="${p.placket}" stroke="${p.shade}" stroke-width="2"/>
<path d="M252 94 Q 300 64 348 94 L322 150 L300 158 L278 150 Z" fill="${p.collar}" stroke="${p.shade}" stroke-width="2"/>
<path d="M252 94 Q 300 76 348 94 L340 118 Q 300 96 260 118 Z" fill="${p.shade}" opacity="0.3"/>
${[136, 196].map((y) => `<circle cx="300" cy="${y}" r="6" fill="${p.button}" stroke="${p.shade}" stroke-width="1"/>`).join("")}
<path d="M150 216 L450 216" stroke="${p.shade}" stroke-width="4" opacity="0.25"/>
<path d="M60 240 L140 282" stroke="${p.rib}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
<path d="M540 240 L460 282" stroke="${p.rib}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
<path d="M128 676 L472 676" stroke="${p.shade}" stroke-width="5" opacity="0.4"/>
<path d="M200 480 Q 300 494 400 480" stroke="${p.shade}" stroke-width="3" fill="none" opacity="0.25"/>
</svg>`,
  };
}

function crewneckSvg(p) {
  const W = 640, H = 800;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [160, 118], rightShoulder: [480, 118], leftHem: [148, 726], rightHem: [492, 726] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("cn", p.base, p.light, p.shade)}
<path d="M254 122 C268 158 372 158 386 122 L488 130 L596 560 L514 596 L472 250 L492 700 L148 700 L168 250 L126 596 L44 560 L152 130 Z" fill="url(#g-cn)"/>
<path d="M254 122 C268 158 372 158 386 122 L488 130 L596 560 L514 596 L472 250 L492 700 L148 700 L168 250 L126 596 L44 560 L152 130 Z" fill="url(#v-cn)"/>
<path d="M254 122 C268 158 372 158 386 122" fill="none" stroke="${p.rib}" stroke-width="20" stroke-linecap="round"/>
<path d="M320 140 L320 172" stroke="${p.shade}" stroke-width="4" opacity="0.5"/>
<path d="M312 150 L320 178 L328 150" fill="none" stroke="${p.shade}" stroke-width="3" opacity="0.45"/>
<path d="M148 700 L492 700 L492 726 Q 320 740 148 726 Z" fill="${p.rib}"/>
<path d="M52 552 L124 585 L114 612 L36 578 Z" fill="${p.rib}"/>
<path d="M588 552 L516 585 L526 612 L604 578 Z" fill="${p.rib}"/>
<path d="M168 250 L472 250" stroke="${p.shade}" stroke-width="4" opacity="0.22"/>
<path d="M210 470 Q 320 486 430 470" stroke="${p.shade}" stroke-width="3" fill="none" opacity="0.22"/>
<path d="M300 700 L300 668 M300 648 L300 616" stroke="${p.light}" stroke-width="3" opacity="0.35"/>
</svg>`,
  };
}

function bomberSvg(p) {
  const W = 640, H = 820;
  return {
    width: W, height: H,
    anchors: { leftShoulder: [158, 112], rightShoulder: [482, 112], leftHem: [168, 716], rightHem: [472, 716] },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs("bm", p.base, p.light, p.shade)}
<path d="M252 108 C268 146 372 146 388 108 L492 116 L600 556 L520 594 L484 250 L500 660 L336 660 L336 152 L304 152 L304 660 L140 660 L156 250 L120 594 L40 556 L148 116 Z" fill="url(#g-bm)"/>
<path d="M252 108 C268 146 372 146 388 108 L492 116 L600 556 L520 594 L484 250 L500 660 L336 660 L336 152 L304 660 L140 660 L156 250 L120 594 L40 556 L148 116 Z" fill="url(#v-bm)"/>
<path d="M244 100 Q 320 74 396 100 L392 128 Q 320 104 248 128 Z" fill="${p.band}" stroke="${p.shade}" stroke-width="2"/>
<path d="M140 660 L500 660 L500 716 L140 716 Z" fill="${p.band}"/>
<path d="M304 152 L304 656 M336 152 L336 656" stroke="${p.shade}" stroke-width="3" opacity="0.55"/>
<path d="M320 160 L320 640" stroke="${p.zip}" stroke-width="6" opacity="0.9"/>
<rect x="314" y="196" width="12" height="26" rx="4" fill="${p.zip}"/>
<path d="M180 470 L262 440 M460 470 L378 440" stroke="${p.shade}" stroke-width="5" opacity="0.6"/>
<path d="M188 458 L256 432 M452 458 L384 432" stroke="${p.stitch}" stroke-width="2" opacity="0.7"/>
<path d="M156 250 L484 250" stroke="${p.shade}" stroke-width="4" opacity="0.3"/>
<path d="M46 536 L124 568 M594 536 L516 568" stroke="${p.stitch}" stroke-width="3" stroke-dasharray="8 6"/>
</svg>`,
  };
}

// ── Catalog definition ───────────────────────────────────────────────────────

const SIZES = ["S", "M", "L", "XL", "XXL"];

const GARMENTS = [
  {
    id: "black-tshirt", name: "Essential Black Tee", category: "tshirt",
    color: "black", colorHex: "#232529", fit: "regular", sleeve: "short",
    style: ["casual", "minimal", "everyday"], formality: 1,
    occasions: ["everyday", "campus", "lounge"],
    price: 24, sizes: SIZES, badge: "bestseller",
    description:
      "The one you reach for every week. Midweight combed cotton with a clean, unchanged-after-washing fit. Pre-shrunk, breathable, and quietly indestructible.",
    palette: { base: "#26282d", light: "#33363d", shade: "#191b1f", rib: "#1d1f23" },
  },
  {
    id: "white-tshirt", name: "Crisp White Tee", category: "tshirt",
    color: "white", colorHex: "#ececea", fit: "regular", sleeve: "short",
    style: ["casual", "minimal", "everyday"], formality: 1,
    occasions: ["everyday", "campus", "layering"],
    price: 24, sizes: SIZES,
    description:
      "A properly opaque white tee — the hardest working item in any wardrobe. Cut a touch longer in the body so it stays tucked or hangs straight.",
    palette: { base: "#e9e9e6", light: "#f4f4f1", shade: "#d3d3cf", rib: "#dbdbd7" },
  },
  {
    id: "olive-tshirt", name: "Olive Cotton Tee", category: "tshirt",
    color: "olive", colorHex: "#6a7048", fit: "regular", sleeve: "short",
    style: ["casual", "earth-tone"], formality: 1,
    occasions: ["everyday", "campus", "weekend"],
    price: 28, sizes: SIZES,
    description:
      "Garment-dyed olive that reads utilitarian without trying. Pairs with denim, chinos, and everything you already own.",
    palette: { base: "#6a7048", light: "#7a8154", shade: "#565c3a", rib: "#5d6340" },
  },
  {
    id: "cream-tshirt", name: "Cream Boxy Tee", category: "tshirt",
    color: "cream", colorHex: "#ded5c2", fit: "oversized", sleeve: "short",
    style: ["casual", "relaxed", "earth-tone"], formality: 1,
    occasions: ["everyday", "weekend", "lounge"],
    price: 29, sizes: SIZES, badge: "new",
    description:
      "A boxy, drop-shoulder cut in soft cream. Structured enough to hold its shape, relaxed enough to live in all weekend.",
    palette: { base: "#ded5c2", light: "#e9e1d1", shade: "#c8bda5", rib: "#cfc5ae" },
  },
  {
    id: "forest-polo", name: "Forest Knit Polo", category: "polo",
    color: "forest green", colorHex: "#2e5240", fit: "regular", sleeve: "short",
    style: ["smart-casual", "classic", "knit"], formality: 3,
    occasions: ["university", "office-casual", "dinner", "weekend"],
    price: 45, sizes: SIZES, badge: "new",
    description:
      "A knitted polo in deep forest green — the easiest way to look considered in warm weather. Two-button placket, ribbed collar that actually keeps its shape.",
    palette: { base: "#2e5240", light: "#3a6350", shade: "#233f31", rib: "#28483a", collar: "#33583f", placket: "#2a4c3b", button: "#e8e4d4" },
  },
  {
    id: "oxford-blue-shirt", name: "Oxford Blue Shirt", category: "shirt",
    color: "blue", colorHex: "#5b7fa6", fit: "regular", sleeve: "long",
    style: ["smart-casual", "classic"], formality: 3,
    occasions: ["university", "office-casual", "dinner"],
    price: 69, sizes: SIZES, badge: "bestseller",
    description:
      "The textbook oxford: button-down collar, soft rumpled weave, works with chinos or under a bomber. An honest shirt that outlives trends.",
    palette: { base: "#5b7fa6", light: "#6d90b6", shade: "#48688c", rib: "#4d6f94", collar: "#6288ae", placket: "#54769c", cuff: "#6288ae", button: "#e8edf2" },
  },
  {
    id: "white-dress-shirt", name: "White Dress Shirt", category: "shirt",
    color: "white", colorHex: "#edeff1", fit: "slim", sleeve: "long",
    style: ["formal", "minimal", "classic"], formality: 4,
    occasions: ["formal", "interview", "event"],
    price: 79, sizes: SIZES,
    description:
      "A slim-cut white shirt for the moments that matter. Crisp poplin, clean placket, collar that sits right with or without a tie.",
    palette: { base: "#e9ebee", light: "#f5f6f8", shade: "#d2d5da", rib: "#d9dce0", collar: "#eef0f3", placket: "#e4e7ea", cuff: "#eef0f3", button: "#ffffff" },
  },
  {
    id: "burgundy-dress-shirt", name: "Burgundy Dress Shirt", category: "shirt",
    color: "burgundy", colorHex: "#7a2d3b", fit: "slim", sleeve: "long",
    style: ["formal", "classic", "evening"], formality: 4,
    occasions: ["dinner", "event", "evening-out"],
    price: 75, sizes: SIZES,
    description:
      "Deep burgundy with a subtle sheen — formal without the funeral. Understated at the office, sharp after dark.",
    palette: { base: "#7a2d3b", light: "#8a3a49", shade: "#63232e", rib: "#6d2836", collar: "#803446", placket: "#732e3c", cuff: "#803446", button: "#e8d8dc" },
  },
  {
    id: "sand-crewneck", name: "Sand Crewneck Sweatshirt", category: "sweatshirt",
    color: "sand", colorHex: "#cbb8a0", fit: "regular", sleeve: "long",
    style: ["casual", "minimal", "earth-tone"], formality: 1,
    occasions: ["everyday", "campus", "lounge", "weekend"],
    price: 55, sizes: SIZES, badge: "new",
    description:
      "Brushed-loopback fleece in warm sand. Ribbed collar, cuffs and hem that grip without squeezing — the vintage sweatshirt, minus the vintage-shop smell.",
    palette: { base: "#cbb8a0", light: "#d8c7b1", shade: "#b5a184", rib: "#bfae95" },
  },
  {
    id: "blue-hoodie", name: "Campus Blue Hoodie", category: "hoodie",
    color: "blue", colorHex: "#2f66d0", fit: "oversized", sleeve: "long",
    style: ["casual", "streetwear", "campus"], formality: 1,
    occasions: ["campus", "lounge", "weekend", "cold-weather"],
    price: 64, sizes: SIZES, badge: "bestseller",
    description:
      "Our most-loved layer: heavyweight fleece in a vivid campus blue, with a roomy hood, kangaroo pocket and drawcords that don't fray.",
    palette: { base: "#2f66d0", light: "#3d74da", shade: "#2653ab", rib: "#2a5bb8", string: "#dfe8f5" },
  },
  {
    id: "charcoal-hoodie", name: "Charcoal Hoodie", category: "hoodie",
    color: "charcoal", colorHex: "#3a3d43", fit: "regular", sleeve: "long",
    style: ["casual", "minimal", "streetwear"], formality: 1,
    occasions: ["everyday", "lounge", "cold-weather"],
    price: 59, sizes: SIZES,
    description:
      "The quiet hoodie. Mid-weight charcoal fleece that layers under jackets and disappears into any outfit you build around it.",
    palette: { base: "#3a3d43", light: "#464a51", shade: "#2d3035", rib: "#31343a", string: "#c9ccd1" },
  },
  {
    id: "denim-trucker-jacket", name: "Denim Trucker Jacket", category: "jacket",
    color: "indigo", colorHex: "#3b5c8a", fit: "regular", sleeve: "long",
    style: ["casual", "denim", "classic"], formality: 2,
    occasions: ["weekend", "campus", "evening-out"],
    price: 98, sizes: SIZES,
    description:
      "The type-III cut that never left. Rigid-feel indigo denim, button flap pockets, adjustable waist — breaks in beautifully.",
    palette: { base: "#3b5c8a", light: "#466899", shade: "#2f4a70", band: "#334f77", lapel: "#3e6090", stitch: "#7d9cc0", button: "#c8d4e0" },
  },
  {
    id: "olive-bomber-jacket", name: "Olive Bomber Jacket", category: "jacket",
    color: "olive", colorHex: "#5b6240", fit: "regular", sleeve: "long",
    style: ["streetwear", "casual", "utility"], formality: 2,
    occasions: ["evening-out", "weekend", "campus"],
    price: 119, sizes: SIZES,
    description:
      "MA-1 attitude in wearable olive: ribbed collar, cuffs and hem, full-length zip, welt pockets. Slim enough to drive in, warm enough for autumn nights.",
    palette: { base: "#5b6240", light: "#687049", shade: "#494f33", band: "#3f442e", stitch: "#9aa077", zip: "#c9cdb8" },
  },
  {
    id: "black-bomber-jacket", name: "Black Bomber Jacket", category: "jacket",
    color: "black", colorHex: "#1f2126", fit: "regular", sleeve: "long",
    style: ["streetwear", "minimal", "evening"], formality: 2,
    occasions: ["evening-out", "weekend", "event"],
    price: 125, sizes: SIZES, badge: "new",
    description:
      "Blacked-out bomber with matte hardware. The jacket equivalent of a plain white tee — goes over everything, apologises for nothing.",
    palette: { base: "#1f2126", light: "#2a2d33", shade: "#16181c", band: "#14161a", stitch: "#3c4048", zip: "#6a6e76" },
  },
  {
    id: "stone-chore-jacket", name: "Stone Chore Jacket", category: "jacket",
    color: "stone", colorHex: "#a89e8c", fit: "regular", sleeve: "long",
    style: ["casual", "utility", "workwear"], formality: 2,
    occasions: ["weekend", "campus", "everyday"],
    price: 89, sizes: SIZES,
    description:
      "French workwear proportions in a soft stone cotton-twill. Three patch pockets, corozo-style buttons, zero fuss.",
    palette: { base: "#a89e8c", light: "#b5ab99", shade: "#8f8574", band: "#968c7a", lapel: "#ada391", stitch: "#d1c9b8", button: "#e5dfd1" },
  },
];

const LENGTH_FACTOR = { tshirt: 0.98, polo: 1.02, shirt: 1.06, sweatshirt: 1.12, hoodie: 1.22, jacket: 1.14 };

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dirs = [
    path.join(STORAGE_ROOT, "garments", "original"),
    path.join(STORAGE_ROOT, "garments", "processed"),
    path.join(STORAGE_ROOT, "garments", "thumbnails"),
    path.join(STORAGE_ROOT, "uploads", "sessions"),
    path.join(STORAGE_ROOT, "results", "sessions"),
    path.join(STORAGE_ROOT, "temp"),
    path.join(STORAGE_ROOT, "catalog"),
  ];
  await Promise.all(dirs.map((d) => fs.mkdir(d, { recursive: true })));
  console.log(`Storage root: ${STORAGE_ROOT}`);

  const entries = [];

  for (const g of GARMENTS) {
    const built =
      g.category === "tshirt" ? teeSvg(g.palette)
      : g.category === "polo" ? poloSvg(g.palette)
      : g.category === "shirt" ? shirtSvg(g.palette)
      : g.category === "sweatshirt" ? crewneckSvg(g.palette)
      : g.category === "hoodie" ? hoodieSvg(g.palette)
      : g.id.includes("bomber") ? bomberSvg(g.palette)
      : jacketSvg(g.palette);

    const processed = await sharp(Buffer.from(built.svg))
      .resize({ width: Math.round(built.width * 1.1), height: Math.round(built.height * 1.1), fit: "inside" })
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });

    // Original = lossless PNG render of the source SVG (never modified later).
    const originalPng = await sharp(Buffer.from(built.svg)).png().toBuffer();

    const thumb = await sharp(processed.data)
      .resize({ width: 384, height: 480, fit: "inside" })
      .webp({ quality: 82 })
      .toBuffer();

    const originalRel = path.posix.join("garments", "original", `${g.id}.png`);
    const processedRel = path.posix.join("garments", "processed", `${g.id}.webp`);
    const thumbRel = path.posix.join("garments", "thumbnails", `${g.id}.webp`);

    await fs.writeFile(path.join(STORAGE_ROOT, originalRel), originalPng);
    await fs.writeFile(path.join(STORAGE_ROOT, processedRel), processed.data);
    await fs.writeFile(path.join(STORAGE_ROOT, thumbRel), thumb);

    const a = built.anchors;
    // Anchors must be normalized against the PROCESSED image dimensions —
    // the processed asset is an upscale of the SVG canvas, so divide by the
    // actual rasterized size.
    entries.push({
      id: g.id,
      name: g.name,
      category: g.category,
      color: g.color,
      colorHex: g.colorHex,
      fit: g.fit,
      sleeve: g.sleeve,
      style: g.style,
      formality: g.formality,
      occasions: g.occasions,
      lengthFactor: LENGTH_FACTOR[g.category],
      assetPath: processedRel,
      originalPath: originalRel,
      thumbnailPath: thumbRel,
      anchors: {
        leftShoulder: { x: (a.leftShoulder[0] * 1.1) / processed.info.width, y: (a.leftShoulder[1] * 1.1) / processed.info.height },
        rightShoulder: { x: (a.rightShoulder[0] * 1.1) / processed.info.width, y: (a.rightShoulder[1] * 1.1) / processed.info.height },
        leftHem: { x: (a.leftHem[0] * 1.1) / processed.info.width, y: (a.leftHem[1] * 1.1) / processed.info.height },
        rightHem: { x: (a.rightHem[0] * 1.1) / processed.info.width, y: (a.rightHem[1] * 1.1) / processed.info.height },
      },
      width: processed.info.width,
      height: processed.info.height,
      createdAt: new Date().toISOString(),
      price: g.price,
      description: g.description,
      sizes: g.sizes,
      badge: g.badge,
    });

    console.log(`✓ ${g.id} (${processed.info.width}×${processed.info.height})`);
  }

  // Preserve any admin-added garments when re-seeding.
  const catalogFile = path.join(STORAGE_ROOT, "catalog", "catalog.json");
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(catalogFile, "utf8")).garments ?? [];
  } catch { /* fresh */ }
  const existingIds = new Set(entries.map((e) => e.id));
  const merged = [...entries, ...existing.filter((e) => !existingIds.has(e.id))].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  await fs.writeFile(catalogFile, JSON.stringify({ garments: merged }, null, 2));
  console.log(`\nSeeded ${entries.length} garments → catalog.json (${merged.length} total)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
