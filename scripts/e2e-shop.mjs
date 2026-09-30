// E2E: storefront shopping flow — browse → filter → PDP → cart → checkout →
// order confirmation → try-on deep link. Runs against the production build.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
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
await page.setViewport({ width: 1440, height: 1000 });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
});
page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 200)}`));

const step = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

const clickText = (includes, exact = false) =>
  page.evaluate((inc, ex) => {
    const btns = [...document.querySelectorAll("button, a")];
    const el = btns.find((x) =>
      ex ? x.textContent?.trim() === inc : x.textContent?.includes(inc)
    );
    el?.click();
    return Boolean(el);
  }, includes, exact);

try {
  // ── 1. Storefront home ──────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  const heroOk = await page.waitForSelector("text/Wear it before you buy it", { timeout: 10000 }).then(() => true).catch(() => false);
  step("storefront home renders", heroOk);
  await sleep(600);
  const cardCount = await page.evaluate(
    () => document.querySelectorAll("article").length
  );
  step("product grid seeded", cardCount >= 12, `${cardCount} cards`);

  // ── 2. Category filter ──────────────────────────────────────────────────
  await clickText("Hoodies");
  await sleep(400);
  const hoodieCount = await page.evaluate(() => document.querySelectorAll("article").length);
  step("category filter works", hoodieCount === 2, `${hoodieCount} hoodies`);
  await clickText("All");
  await sleep(300);

  // ── 3. Search ───────────────────────────────────────────────────────────
  await page.type('input[aria-label="Search products"]', "bomber");
  await sleep(400);
  const bomberCount = await page.evaluate(() => document.querySelectorAll("article").length);
  step("search filters", bomberCount === 2, `${bomberCount} bombers`);
  await page.evaluate(() => {
    const i = document.querySelector('input[aria-label="Search products"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(i, "");
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(300);

  // ── 4. Product detail page ──────────────────────────────────────────────
  await clickText("Campus Blue Hoodie");
  await page.waitForSelector("text/Add to cart", { timeout: 10000 });
  const pdp = await page.evaluate(() => ({
    name: document.querySelector("h1")?.textContent,
    hasPrice: /\$64/.test(document.body.innerText),
    hasDescription: /most-loved layer/i.test(document.body.innerText),
    hasSizes: document.body.innerText.includes("Size"),
    hasFormality: document.body.innerText.includes("Formality"),
    hasTryOn: [...document.querySelectorAll("a")].some((a) =>
      a.href.includes("/tryon?garment=blue-hoodie")
    ),
  }));
  step("PDP renders", pdp.name === "Campus Blue Hoodie", JSON.stringify(pdp.name));
  step("PDP price + copy", pdp.hasPrice && pdp.hasDescription);
  step("PDP try-on deep link", pdp.hasTryOn);

  // ── 5. Size guard + add to cart ─────────────────────────────────────────
  const guarded = await clickText("Add to cart");
  await sleep(300);
  const guardMsg = await page.evaluate(() => document.body.innerText.includes("Choose a size first"));
  step("size selection enforced", guarded && guardMsg);

  await clickText("L", true); // size pill
  await sleep(200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "+");
    btn?.click(); // qty 2
  });
  await sleep(200);
  await clickText("Add to cart");
  await sleep(600);
  const drawer = await page.evaluate(() => ({
    open: Boolean(document.querySelector('[role="dialog"][aria-label="Shopping cart"]')),
    hasItem: document.body.innerText.includes("Campus Blue Hoodie"),
    qty2: document.body.innerText.includes("Size L × 2") || document.body.innerText.includes("× 2"),
    subtotal: document.body.innerText.match(/\$128/)?.[0],
  }));
  step("cart drawer opens with item", drawer.open && drawer.hasItem);
  step("quantity + subtotal computed", drawer.qty2 && Boolean(drawer.subtotal), drawer.subtotal);

  // ── 6. Badge count persists after closing drawer ────────────────────────
  await page.keyboard.press("Escape");
  await sleep(400);
  const badge = await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Open cart"))?.textContent ?? ""
  );
  step("cart badge shows count", badge.includes("2"), badge);

  // ── 7. Add a second product via PDP ─────────────────────────────────────
  await page.goto(`${BASE}/product/black-bomber-jacket`, { waitUntil: "networkidle2" });
  await page.waitForSelector("text/Add to cart");
  await clickText("M", true);
  await sleep(200);
  await clickText("Add to cart");
  await sleep(500);
  await page.keyboard.press("Escape");
  await sleep(300);
  const badge2 = await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Open cart"))?.textContent ?? ""
  );
  step("second product added", badge2.includes("3"), badge2);

  // ── 8. Checkout → order ─────────────────────────────────────────────────
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle2" });
  await page.waitForSelector("text/Place demo order");
  const summary = await page.evaluate(() => document.body.innerText);
  step("checkout shows both items", summary.includes("Campus Blue Hoodie") && summary.includes("Black Bomber Jacket"));

  const type = async (sel, val) => {
    await page.click(sel);
    await page.type(sel, val);
  };
  await type('input[autocomplete="name"]', "Test Person");
  await type('input[autocomplete="email"]', "test@example.com");
  await type('input[autocomplete="street-address"]', "42 Sample Street");
  await type('input[autocomplete="address-level2"]', "Dhaka");
  await type('input[autocomplete="country-name"]', "Bangladesh");

  const placeBtnEnabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("Place demo order"));
    return b ? !b.disabled : false;
  });
  step("checkout form enables order", placeBtnEnabled);

  await clickText("Place demo order");
  await page.waitForSelector("text/Order confirmed", { timeout: 15000 });
  const order = await page.evaluate(() => ({
    id: document.body.innerText.match(/VF-[A-F0-9]{6,}/)?.[0],
    items: document.body.innerText.includes("Campus Blue Hoodie") && document.body.innerText.includes("Black Bomber Jacket"),
    total: document.body.innerText.match(/\$247/)?.[0], // 64*2 + 119
  }));
  step("order confirmation with id", Boolean(order.id), order.id);
  step("order items + server total", order.items && Boolean(order.total), order.total);

  const badge3 = await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Open cart"))?.textContent ?? ""
  );
  step("cart cleared after order", !/\d/.test(badge3), badge3 || "(empty)");

  // ── 9. Order API is authoritative ───────────────────────────────────────
  const orderFetch = await page.evaluate(async (id) => {
    const r = await fetch(`/api/orders/${id}`);
    return r.status;
  }, order.id);
  step("order fetchable via API", orderFetch === 200);

  // ── 10. Try-on deep link with photo ─────────────────────────────────────
  await page.goto(`${BASE}/product/oxford-blue-shirt`, { waitUntil: "networkidle2" });
  await page.waitForSelector("text/Add to cart");
  const clicked = await clickText("Try it on virtually");
  await sleep(1200);
  step("PDP try-on navigates to studio", clicked && page.url().includes("/tryon?garment=oxford-blue-shirt"), page.url().slice(0, 60));
  const preselected = await page.evaluate(() =>
    document.body.innerText.includes("Oxford Blue Shirt")
  );
  step("garment preselected in studio", preselected);

  // Upload photo & detect — the full loop from a product page
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(PHOTO);
  await page.waitForSelector('img[alt="Your photo preview"]');
  await clickText("Detect body");
  await page.waitForSelector("canvas.tryon", { timeout: 60000 });
  await sleep(1800);
  const rendered = await page.evaluate(() => {
    const c = document.querySelector("canvas.tryon");
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    // oxford blue ~ (91,127,166)
    let blue = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (b > 120 && b < 200 && g > 80 && g < 160 && r > 40 && r < 130 && b > r) blue++;
    }
    return blue;
  });
  step("product → photo → fitted render", rendered > 5000, `${rendered} oxford-blue pixels`);

  step("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));
} catch (err) {
  console.error("SHOP E2E FAILED:", err.message);
  await page.screenshot({ path: ".storage/temp/e2e-shop-failure.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
