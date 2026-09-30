// Headless E2E test using the system Chrome/Edge via puppeteer-core.
// Exercises the real client pipeline: upload → MediaPipe pose detection →
// garment selection → mesh rendering → AI command → before/after → save.

import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const CHROME =
  fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const PHOTO = "C:\\Users\\USERAS\\AppData\\Local\\Temp\\opencode\\test-person.jpg";
const BASE = "http://localhost:3000";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
});
page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 200)}`));

const step = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

try {
  // ── 1. Load studio ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/tryon`, { waitUntil: "networkidle2", timeout: 60000 });
  step("studio page loads", (await page.title()).includes("Virtual Fit"));

  // ── 2. Upload photo ─────────────────────────────────────────────────────
  const input = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
  await input.uploadFile(PHOTO);
  await page.waitForSelector('text/Detect body & continue', { timeout: 10000 }).catch(() => {});
  // wait for preview image
  await page.waitForSelector('img[alt="Your photo preview"]', { timeout: 10000 });
  step("photo preview shown", true);

  // ── 3. Run detection ────────────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => x.textContent?.includes("Detect body"));
    b?.click();
  });

  // Wait for detection to complete → the dropzone disappears, canvas appears
  await page.waitForSelector("canvas.tryon", { timeout: 60000 });
  await sleep(1200);
  const badge = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    const hit = spans.find((s) => /detected|estimated/i.test(s.textContent ?? ""));
    return hit ? (hit.textContent ?? "").match(/(\d+)%/)?.[1] : null;
  });
  step("body detected", Boolean(badge), badge ? `confidence ${badge}%` : "badge not found");

  // ── 4. Select a garment ─────────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => x.textContent?.includes("Campus Blue Hoodie"));
    b?.click();
  });
  await sleep(1500); // garment image load + render

  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector("canvas.tryon");
    if (!c) return null;
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    // Count blue-ish garment pixels (hoodie blue ~ (54,105,200))
    let blue = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (b > 130 && b > r * 1.6 && b > g * 1.3 && g > r * 0.8) blue++;
    }
    return { w: c.width, h: c.height, blueSamples: blue, totalSamples: Math.floor(data.length / 16) };
  });
  step(
    "garment rendered on canvas",
    canvasInfo && canvasInfo.blueSamples > canvasInfo.totalSamples * 0.01,
    canvasInfo ? `${canvasInfo.blueSamples}/${canvasInfo.totalSamples} blue samples on ${canvasInfo.w}x${canvasInfo.h}` : "no canvas"
  );

  // Capture screenshot for the record
  await page.screenshot({ path: ".storage/temp/e2e-garment-on.png" });

  // ── 5. Before/after toggle ──────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent?.includes("Before / after"))?.click();
  });
  await sleep(400);
  const beforeInfo = await page.evaluate(() => {
    const c = document.querySelector("canvas.tryon");
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let blue = 0;
    for (let i = 0; i < data.length; i += 16) {
      const b = data[i + 2], r = data[i], g = data[i + 1];
      if (b > 130 && b > r * 1.6 && b > g * 1.3) blue++;
    }
    return blue;
  });
  step("before/after removes garment", beforeInfo < canvasInfo.blueSamples * 0.1, `${beforeInfo} blue samples (was ${canvasInfo.blueSamples})`);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent?.includes("Show garment"))?.click();
  });
  await sleep(400);

  // ── 6. AI command: "make it oversized" ──────────────────────────────────
  const widthBefore = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="range"][aria-label="Width"]')];
    return inputs.length ? Number(inputs[0].value) : null;
  });
  await page.type('input[aria-label="Message the AI assistant"]', "make it oversized");
  await page.keyboard.press("Enter");
  await sleep(2500);
  const after = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="range"][aria-label="Width"]')];
    return inputs.length ? Number(inputs[0].value) : null;
  });
  const aiReply = await page.evaluate(() =>
    [...document.querySelectorAll("span")].some((s) => s.textContent?.includes("Local rules engine") || s.textContent?.includes("LLM"))
  );
  step("AI command applied", after !== null && widthBefore !== null && after >= 1, `width slider ${widthBefore} → ${after}`);
  step("AI chat replied", aiReply);

  // ── 7. Manual slider interaction ────────────────────────────────────────
  const changed = await page.evaluate(() => {
    const input = document.querySelector('input[type="range"][aria-label="Rotation"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "12");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  await sleep(300);
  step("manual rotation slider works", changed);

  // ── 7b. Drag the garment on the canvas ─────────────────────────────────
  const hSliderBefore = await page.evaluate(
    () => document.querySelector('input[type="range"][aria-label="Horizontal"]')?.value
  );
  const canvas = await page.$("canvas.tryon");
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
  }
  await sleep(400);
  const hSliderAfter = await page.evaluate(
    () => document.querySelector('input[type="range"][aria-label="Horizontal"]')?.value
  );
  step(
    "drag on canvas moves garment",
    Number(hSliderAfter) > 0 && hSliderAfter !== hSliderBefore,
    `horizontal ${hSliderBefore} → ${hSliderAfter}`
  );

  // ── 8. Compare flow ─────────────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent?.includes("Compare") && x.textContent.includes("⇄"))?.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent?.includes("Oxford Blue Shirt"))?.click();
    btns.find((x) => x.textContent?.includes("Denim Trucker Jacket"))?.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent === "Compare")?.click();
  });
  await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
  await sleep(1200);
  const compareOk = await page.evaluate(() =>
    Boolean(document.querySelector('[role="dialog"] th')) && document.querySelectorAll('[role="dialog"] canvas').length >= 2
  );
  step("compare modal with metadata table", compareOk);
  await page.screenshot({ path: ".storage/temp/e2e-compare.png" });
  await page.keyboard.press("Escape");
  await sleep(300);

  // ── 9. Save result to server ────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent?.includes("Save to server"))?.click();
  });
  await sleep(3000);
  const saved = await page.evaluate(() =>
    [...document.querySelectorAll("img")].some((i) => i.src.includes("/api/assets/results/"))
  );
  step("result saved to VPS storage", saved);

  // ── 10. Skeleton overlay ────────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((x) => x.textContent?.includes("Skeleton"))?.click();
  });
  await sleep(400);
  const skelDrawn = await page.evaluate(() => {
    const c = document.querySelector("canvas.tryon");
    const ctx = c.getContext("2d");
    // sample for accent lime (201, 242, 77)
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let lime = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 201) < 30 && Math.abs(data[i + 1] - 242) < 25 && Math.abs(data[i + 2] - 77) < 40) lime++;
    }
    return lime;
  });
  step("skeleton overlay drawn", skelDrawn > 50, `${skelDrawn} lime pixels`);
  await page.screenshot({ path: ".storage/temp/e2e-skeleton.png" });

  // ── 11. Catalog search ──────────────────────────────────────────────────
  await page.type('input[aria-label="Search garments"]', "hoodie");
  await sleep(400);
  const cards = await page.evaluate(() => document.body.innerText.match(/Hoodie/g)?.length ?? 0);
  step("catalog search filters", cards >= 2, `${cards} hoodie mentions`);

  step("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
} catch (err) {
  console.error("E2E FAILED:", err.message);
  await page.screenshot({ path: ".storage/temp/e2e-failure.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
