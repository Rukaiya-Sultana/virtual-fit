# Virtual Fit — AI-Powered Virtual Try-On Platform

A polished, deployable web platform that lets users virtually try clothing on
themselves: upload a photo, browse a garment catalog, and see the garment
automatically **positioned, scaled, rotated and deformed** to fit their detected
body geometry — with manual refinement and a natural-language AI fashion
assistant on top.

> **Technical honesty statement**
> Virtual Fit is a **browser-based, body-aware geometric try-on system**. It
> detects body landmarks with MediaPipe in the browser and fits garment assets
> using piecewise-affine mesh deformation. It is **not** a generative/diffusion
> virtual try-on system and does not claim to be: there is no cloud GPU, no
> paid VTO API, and no image-generation model anywhere in the pipeline. This
> trade-off is deliberate — it makes the system free to run, private by
> default, instant, and fully reproducible on a $5 VPS. See
> [Known limitations](#16-known-limitations).

---

## 1. Project purpose

University project demonstrating a complete consumer-facing virtual try-on
experience under hard constraints:

- **zero marginal cost** (no paid APIs, no GPU inference),
- **privacy-first** (photo processing happens in the browser),
- **production-deployable** on a single AWS Lightsail VPS using its
  filesystem for storage.

## 2. Core features

| Area | What it does |
|---|---|
| Photo upload | Drag & drop or file picker, preview with guidance checklist, client-side validation (type/size/dimensions) |
| Body detection | MediaPipe Pose Landmarker (lite) running fully client-side; shoulder/elbow/wrist/hip landmarks with confidence gating and actionable error messages |
| Auto fitting | Torso frame construction → garment anchor mapping → mesh deformation (waist shaping, hem drape along hip line, sleeve extension along arm directions) |
| Manual controls | Width, height, horizontal, vertical, rotation, sleeve length, opacity + Slim/Regular/Oversized presets; drag the garment directly on the canvas |
| Catalog | Category filters, search, lazy-loaded thumbnails; adding a garment needs only an asset + metadata (admin UI or seed script) |
| Before/after | One-click toggle; skeleton overlay for demonstrating detection |
| Compare | Pick any two garments → side-by-side renders on the same body + metadata comparison table |
| AI assistant | Natural-language adjustments, garment switching, recommendations, comparisons, style explanations — via OpenRouter (optional, free models) with a deterministic local NLU fallback |
| Save/share | Explicit "Save to server" stores the composite (and photo) on the VPS with auto-expiring session storage; client-side download |
| Admin | Password-protected garment management with an interactive anchor editor, automatic alpha-trim/thumbnail generation |

## 3. System architecture

```
                    USER
                      │
                      ▼
              Next.js Web App (React/TS/Tailwind)
                      │
          ┌───────────┴────────────┐
          │                        │
          ▼                        ▼
     User Photo              Clothing Catalog (catalog.json + assets)
          │                        │
          ▼                        ▼
   MediaPipe Pose           Garment Anchors
   Landmarker (browser)     (per-garment geometry)
          │                        │
          └───────────┬────────────┘
                      ▼
           Garment Geometry Engine  (torso frame → destination quad)
                      ▼
           Mesh Transformation      (base affine + IDW control-point field)
                      ▼
              Canvas 2D renderer    (piecewise-affine triangles + soft shadow)
                      ▼
                 TRY-ON RESULT
```

Separate AI control path:

```
User natural-language command
        ▼
   POST /api/ai
        ▼
 OpenRouter LLM (optional)  ──fail──▶  Local rule-based NLU
        ▼                                    ▼
      Strict JSON schema (zod-validated, clamped, catalog-checked)
        ▼
   Structured commands  ──▶  applyCommands()  ──▶  rendering state
```

The AI layer **never** touches frontend code — it can only emit a small set of
validated data commands.

### Code layout

```
src/
├── app/                        Next.js App Router
│   ├── page.tsx                Landing page
│   ├── tryon/page.tsx          The fitting room studio
│   ├── admin/page.tsx          Catalog admin + anchor editor
│   └── api/
│       ├── garments/           Catalog list (GET)
│       ├── assets/[...path]/   Controlled image serving from storage
│       ├── sessions/           Session create / photo upload / result save
│       ├── ai/                 Assistant endpoint (LLM + local fallback)
│       ├── admin/              Login + garment CRUD (auth-gated)
│       ├── health/             Health/storage probe
│       └── dev/selftest/       Fitting-engine geometric self-test
├── components/
│   ├── tryon/                  Studio UI (stage, catalog, controls, AI chat…)
│   └── ui.tsx                  Primitives (buttons, sliders, panels…)
├── lib/
│   ├── pose/detector.ts        MediaPipe wrapper + photo quality gates
│   ├── fitting/                geometry.ts · engine.ts · render.ts · garment-loader.ts
│   ├── ai/                     schema.ts · assistant.ts · local-nlu.ts · apply.ts
│   ├── storage/                ImageStorage interface + filesystem implementation
│   ├── catalog.ts              JSON catalog store (atomic writes)
│   ├── image.ts                Upload validation/normalization (sharp)
│   ├── cleanup.ts              Retention sweeps
│   ├── rate-limit.ts           In-memory fixed-window limiter
│   └── admin-auth.ts           HMAC-signed admin cookie
└── types/index.ts              Shared domain types
```

## 4. Virtual try-on approach

The core is **geometric garment transformation**, not generation:

1. **Detect** — MediaPipe returns 8 relevant landmarks normalized to the photo.
2. **Torso frame** (`buildTorsoFrame`) — viewer-space shoulder/hip lines are
   blended into a stable torso coordinate frame (`xAxis`, `yAxis`, widths,
   lengths). Missing hips are imputed anthropometrically and flagged in the UI.
3. **Destination quad** (`computePlacement`) — the garment's four anchors
   (shoulder seams + hem corners) are mapped to body-derived targets:
   shoulder span × fit width factor, hem distance = torso length × garment
   `lengthFactor`, hem span × garment taper ratio × fit drape, plus manual
   offsets/scales/rotation.
4. **Mesh deformation** — the garment image is covered by an 8×10 grid.
   Each vertex maps through (a) a base affine transform fit on the
   shoulder/hem anchor triangle, plus (b) an inverse-distance-weighted
   displacement field driven by control points: anchor residuals (adapts the
   garment's taper to the body), waist shaping (slim ≈ tapered, oversized ≈
   boxy) and sleeve-tip extension along the shoulder→elbow direction.
5. **Render** — 160 triangles drawn as clipped affine `drawImage` calls on a
   Canvas 2D layer, composited with a soft silhouette shadow over the photo.

The result follows body geometry (shoulder tilt, torso taper, arm direction)
instead of sitting on the photo like a rectangular sticker.

## 5. Body landmark detection

- Library: **MediaPipe Tasks Vision — Pose Landmarker (lite, float16)**,
  free and open-source, executed in the browser (WASM; GPU delegate with
  automatic CPU fallback).
- The WASM runtime and the ~5.8 MB model are **self-hosted** from
  `/public/mediapipe/wasm` and `/public/models` (no CDN dependency at
  runtime).
- Landmarks used: shoulders (11/12), elbows (13/14), wrists (15/16),
  hips (23/24), each with a visibility score.
- Quality gates with actionable user messages: no person, unclear shoulders,
  too far from camera, strongly tilted shoulders. Low-confidence hips are
  imputed and surfaced as a “Hips estimated” badge.

## 6. Garment transformation details

| Concept | Where | Notes |
|---|---|---|
| Anchors | `GarmentAnchors` (normalized image-space quad) | Configurable per garment (admin editor / seed script) |
| Fit presets | `FIT_FACTORS` | slim / regular / oversized width+hem+waist factors |
| Base affine | `affineFromTriangles` | Exact mapping of the anchor triangle |
| Deformation field | IDW over control points | Replaceable engine boundary (`computePlacement`) |
| Sleeves | shoulder→elbow direction | Long sleeves respond fully; short sleeves damped |
| Rendering | `drawGarmentMesh` | Piecewise-affine, seam-expanded triangles, soft shadow |

## 7. AI assistant

- **Optional LLM**: if `OPENROUTER_API_KEY` is set, commands are interpreted by
  the configured (free-tier) model with a catalog-grounded system prompt and
  `response_format: json_object`.
- **Deterministic fallback**: a rule-based local NLU handles the full command
  vocabulary offline — the app is fully functional with **no key at all**
  (assistant badge shows which engine replied).
- Every response passes a strict zod schema (`AiCommand` discriminated union),
  numeric clamping (`CLAMPS`), and catalog existence checks for any garment
  IDs. Recommendations can only reference real products.
- The assistant never sees or receives the user's photo.

## 8. Storage architecture

Single-VPS filesystem storage with an abstraction layer:

```ts
interface ImageStorage {
  save(opts): Promise<StoredImage>;
  get(relativePath): Promise<Buffer>;
  exists(relativePath): Promise<boolean>;
  delete(relativePath): Promise<void>;
  ensureLayout(): Promise<void>;
  root(): string;
  resolveSafe(relativePath): string;   // traversal-proof resolution
}
```

Layout under `STORAGE_ROOT` (default `./.storage` in dev,
`/data/virtual-fit` in production):

```
STORAGE_ROOT/
├── garments/{original,processed,thumbnails}/   # permanent catalog assets
├── uploads/sessions/<uuid>/original.webp       # user photos (auto-expiring)
├── results/sessions/<uuid>/<id>.webp           # try-on results (auto-expiring)
├── temp/
└── catalog/catalog.json                        # garment metadata
```

- User files use generated UUIDs — original filenames are never used.
- Files are served only through `/api/assets/*` with whitelisted areas and
  extensions; the storage root is never a public static directory.
- Retention (configurable via env): temp 1 h, uploads 24 h, results 24 h.
  Cleanup runs opportunistically from API routes (max one sweep / 15 min) and
  via `npm run cleanup` (cron-friendly). Catalog assets are never touched.

## 9. Security

- **Uploads treated as untrusted**: magic-byte sniffing via sharp (declared
  MIME is ignored), format whitelist (JPEG/PNG/WebP), size limits, dimension
  sanity, EXIF stripping, server-side re-encode to WebP.
- **Path traversal protection**: every storage path is segment-checked and
  prefix-resolved; writes use generated names with no-overwrite (`wx`) flags.
- **Admin**: password from env (≥8 chars), HMAC-signed httpOnly cookie,
  timing-safe comparisons, login rate limiting + delay.
- **API validation**: zod schemas on all request bodies; strict limits on
  array lengths and string sizes.
- **Rate limiting** (in-memory, per-IP): AI endpoint 12/min (configurable),
  uploads 20/min, admin login 8/min.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` app-wide; `Content-Security-Policy: sandbox` on served
  assets; HSTS at the nginx layer.
- **Secrets**: only in `.env` (git-ignored); no keys in client bundles — the
  only `NEXT_PUBLIC_*` variables are a URL and a model path.
- **Executables**: extension whitelist makes executable uploads impossible.

## 10. Local development

Requirements: Node.js ≥ 20, npm ≥ 10.

```bash
npm install            # also copies MediaPipe WASM + downloads the pose model
cp .env.example .env   # set ADMIN_PASSWORD (min 8 chars)
npm run seed           # generate the demo garment catalog (9 garments)
npm run dev            # http://localhost:3000
```

Useful scripts:

```bash
npm run build          # production build
npm start              # run the production build
npm run cleanup        # run one retention sweep manually
node scripts/e2e-test.mjs        # headless browser E2E (needs Chrome/Edge + a test photo)
node scripts/test-admin-upload.mjs  # admin pipeline test
```

## 11. Production deployment (overview)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full Lightsail walkthrough
(Node, PM2/systemd, nginx, HTTPS, storage setup, backups).

Quick summary:

```bash
# on the VPS
sudo mkdir -p /data/virtual-fit && sudo chown www-data:www-data /data/virtual-fit
git clone <repo> /var/www/virtual-fit && cd /var/www/virtual-fit
cp .env.example .env && nano .env          # STORAGE_ROOT=/data/virtual-fit, ADMIN_PASSWORD, optional OPENROUTER_API_KEY
npm ci && npm run build && npm run seed
pm2 start ecosystem.config.cjs && pm2 save
# nginx: copy nginx/virtual-fit.conf, certbot for TLS
```

## 12. Lightsail configuration notes

- Any instance works (even 512 MB / 1 vCPU — the VPS only serves the app,
  catalog and files; there is no server-side ML).
- Attach the 320 GB volume (or use the instance disk) and mount it at
  `/data` if you want storage independent of the OS disk.
- Open only 22/80/443 in the Lightsail firewall; nginx proxies to
  `127.0.0.1:3000`.
- Optional: Cloudflare in front (proxy on) — nothing app-specific required.

## 13. Nginx configuration

`nginx/virtual-fit.conf` contains the reference config: HTTP→HTTPS redirect,
TLS via certbot, `client_max_body_size 12m` (must exceed `MAX_UPLOAD_MB`),
gzip, hard caching for `/_next/static`, `/mediapipe/` and `/models/`, and
standard proxy headers (`X-Forwarded-For` is used by the rate limiter).

## 14. Environment variables

All variables are documented in **[.env.example](./.env.example)**:

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_ROOT` | `./.storage` | Storage root (`/data/virtual-fit` in prod) |
| `NEXT_PUBLIC_APP_URL` | — | Public base URL (used for OpenRouter referer) |
| `NEXT_PUBLIC_POSE_MODEL_URL` | `/models/pose_landmarker_lite.task` | Pose model URL (self-hosted or CDN fallback) |
| `OPENROUTER_API_KEY` | *(empty)* | Optional LLM for the assistant |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | Model id |
| `ADMIN_PASSWORD` | — | Admin login secret (≥ 8 chars) |
| `MAX_UPLOAD_MB` | `10` | Upload size limit |
| `TEMP_TTL_HOURS` / `UPLOAD_TTL_HOURS` / `RESULT_TTL_HOURS` | 1 / 24 / 24 | Retention |
| `AI_RATE_LIMIT_PER_MINUTE` / `UPLOAD_RATE_LIMIT_PER_MINUTE` | 12 / 20 | Rate limits |

## 15. Adding garments

**Via the admin UI** (`/admin`): upload a transparent PNG/WebP garment image
(flat-lay, front-facing), fill the metadata (name, category, color, fit,
sleeve, style tags, occasions, formality), then click the four anchor points
on the trimmed preview (left shoulder → right shoulder → left hem → right
hem). The server stores the original, generates the alpha-trimmed processed
asset + thumbnail, and registers the garment — no code changes needed.

**Via the filesystem**: drop assets into
`STORAGE_ROOT/garments/{original,processed,thumbnails}/` and append an entry
to `catalog/catalog.json` (schema in `src/lib/catalog.ts`). `npm run seed`
shows the exact format and preserves admin-added garments.

Demo garments are procedurally generated vector illustrations with exact
anchor geometry — replace them with real product cutouts for best results.

## 16. Known limitations

- **Not photorealistic.** This is geometric fitting, not diffusion-based
  VTO: the garment is a transformed 2D asset, not a re-lit, re-folded garment
  rendered onto the body. Fabric does not simulate, lighting is not matched.
- Single flat-lay garment pose: strongly turned bodies or crossed arms
  degrade fit quality (the detector gates extreme cases).
- Landmark-based fitting cannot reason about occlusion (hair over shoulders,
  baggy clothes already worn).
- The AI assistant's local engine covers a curated command vocabulary; the
  LLM path broadens it but is optional and rate-limited.
- Single-process design (JSON catalog store + in-memory rate limiting);
  vertical scaling only. Adequate for a demo/coursework deployment.
- Catalog garment SVGs are placeholders; real product photography with
  transparent backgrounds will look substantially better.

## 17. Future improvements

- TPS (thin-plate spline) deformation as an alternative engine behind the
  same `computePlacement` boundary.
- Segmentation-based body masks (MediaPipe Selfie Segmentation, also free and
  browser-side) to occlude garment parts behind arms.
- Lower-body garments (trousers, dresses) using hip/knee/ankle landmarks —
  the landmark model already provides them.
- Per-user accounts with saved sessions; shareable result links.
- On-server background removal via `sharp`-compatible `rembg` ports when a
  free pipeline is validated; today the workflow expects pre-transparent
  assets (the admin UI documents this).
- SQLite migration path if the catalog outgrows JSON.

---

## Verification performed

- `GET /api/dev/selftest` — geometric self-test across every garment × fit
  preset (torso frame, imputation, anchor fidelity, triangle degeneracy).
- `scripts/e2e-test.mjs` — 14-step headless-Chrome E2E: upload → detection →
  rendering (pixel-sampled) → before/after → AI command → drag → sliders →
  compare → save-to-VPS → skeleton → search → console-error check.
- `scripts/test-admin-upload.mjs` — admin auth, garment pipeline, asset
  serving, unauthorized rejection, cleanup.
- Storage/security probes: traversal attempts (plain + URL-encoded), invalid
  image rejection, rate limiting, wrong-password login.

## License / attribution

- MediaPipe Pose Landmarker — Apache 2.0 (Google).
- Next.js, React, Tailwind, sharp, zod — MIT.
- Demo garments generated by this project's seed script (no third-party
  assets). Test photo: public-domain Wikimedia Commons studio portrait.
