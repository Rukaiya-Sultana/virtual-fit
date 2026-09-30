# Deploying Virtual Fit on AWS Lightsail

> **Docker / Dokploy users:** see [§0 - Deploy with Docker (Dokploy)](#0-deploy-with-docker-dokploy)
> below. The repo ships a production `Dockerfile` (Next.js standalone +
> Prisma/SQLite) that is ready for any Docker-based PaaS.

Target: a single Lightsail VPS (any size ≥ 512 MB / 1 vCPU works — there is no
server-side ML), Ubuntu 22.04/24.04 LTS, with nginx, HTTPS via Let's Encrypt,
and filesystem storage under `/data/virtual-fit`.

Total cost: the instance itself. No S3, no Cloudflare R2, no GPU, no paid APIs
(the OpenRouter key is optional and free-tier models suffice).

---

## 0. Deploy with Docker (Dokploy)

The repository contains everything Dokploy needs: a multi-stage `Dockerfile`
(Alpine, Next.js standalone output, Prisma migrations applied automatically at
container start) plus a `docker-compose.yml` for reference/local testing.

### What the image does

- Builds the app with the demo garment assets baked in (copied into `/data`
  on first boot).
- The **database is Supabase (PostgreSQL)** — set `DATABASE_URL` and the
  container syncs the schema and seeds the demo catalog automatically on
  start.

### Steps (Dokploy)

1. **One-time database setup (Supabase):**
   - Supabase Dashboard → **SQL Editor** → New query → paste the contents of
     [`prisma/supabase-setup.sql`](../prisma/supabase-setup.sql) → **Run**.
     This creates the schema and loads the demo catalog.
   - Supabase → **Project Settings → Database → Connection string → URI**,
     replace `[YOUR-PASSWORD]` (and region host) — this is your `DATABASE_URL`.
2. **Dokploy → Projects → New → Dockerfile** (or add a Compose service).
3. Connect the Git provider and select the `Rukaiya-Sultana/virtual-fit` repository,
   branch `main`. Dokploy auto-detects the `Dockerfile`.
4. **Build configuration**: leave the Dockerfile path as `/Dockerfile`. Set the
   build arg `NEXT_PUBLIC_APP_URL=https://your-domain.com` if you want absolute
   URLs baked into the client bundle (optional).
5. **Environment variables** (required):

   ```env
   # Supabase Postgres connection (Project Settings -> Database -> URI)
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

   AUTH_SECRET=<openssl rand -hex 32>
   ADMIN_PASSWORD=<openssl rand -hex 24, min 8 chars>
   # Optional:
   # OPENROUTER_API_KEY=<free key from openrouter.ai>
   ```

   On boot the container validates `DATABASE_URL`, syncs the Prisma schema
   (`prisma db push`, idempotent) and imports the demo catalog if the product
   table is empty. No SQLite files anymore — the database is fully managed by
   Supabase.

6. **Persistent storage**: in the service settings add a volume mounted at
   `/data` (this keeps garment assets/uploads/results across deploys — the
   database itself lives in Supabase).
7. **Network / port**: expose port `3000` (the container listens on
   `0.0.0.0:3000`). Attach your domain and let Dokploy terminate HTTPS.
8. Deploy. Verify with `https://your-domain.com/api/health` — it should return
   `{"status":"ok",...}`. Admin panel: `/admin` (password = `ADMIN_PASSWORD`).

### Local Docker test

```bash
AUTH_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD=$(openssl rand -hex 24) \
  DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  docker compose up --build -d
curl http://localhost:3000/api/health
```

### Notes

- Backups: Supabase manages the database (daily automatic snapshots on the
  free tier); back up the `/data` volume for garment assets/uploads.
- The pose model (`public/models`) and MediaPipe wasm are self-hosted in the
  image; the browser never needs a third-party CDN.

---

## 1. Create the instance

1. Lightsail → Create instance → Linux → **Ubuntu 24.04 LTS**.
2. Pick a plan (512 MB–2 GB is plenty for a demo; add a swap file on 512 MB —
   see §9).
3. Optional but recommended: create/attach a 320 GB block storage disk for
   garment assets and results.
4. Networking tab → IPv4 firewall: allow **22, 80, 443** only.

## 2. First login & base packages

```bash
ssh ubuntu@<INSTANCE_IP>
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx git curl ufw
```

## 3. Install Node.js 20+ (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v   # v20.x or v22.x
```

## 4. Storage layout & permissions

```bash
# If you attached a block disk, format/mount it at /data first
# (Lightsail console → Storage → attach → follow its instructions).

sudo mkdir -p /data/virtual-fit
# The app runs as www-data:
sudo chown -R www-data:www-data /data/virtual-fit
sudo chmod 750 /data/virtual-fit
```

Final layout (created automatically by the app on first start):

```
/data/virtual-fit/
├── garments/{original,processed,thumbnails}/
├── uploads/sessions/
├── results/sessions/
├── temp/
└── catalog/catalog.json
```

## 5. Get the code & configure

```bash
sudo mkdir -p /var/www && sudo chown ubuntu:ubuntu /var/www
git clone <your-repo-url> /var/www/virtual-fit
cd /var/www/virtual-fit

cp .env.example .env
nano .env
```

Set at minimum:

```env
STORAGE_ROOT=/data/virtual-fit
NEXT_PUBLIC_APP_URL=https://your-domain.com
ADMIN_PASSWORD=<long random string>      # openssl rand -hex 24
# Optional — enables the LLM assistant path:
# OPENROUTER_API_KEY=<free key from openrouter.ai>
```

```bash
# Install, fetch the pose model, build, seed demo garments
npm ci
npm run build
sudo -u www-data STORAGE_ROOT=/data/virtual-fit npm run seed
```

> `npm ci` runs the postinstall script that copies MediaPipe WASM into
> `public/mediapipe/wasm` and downloads the pose model into `public/models/`.
> If the VPS has no outbound internet at build time, run that step elsewhere
> and commit/copy `public/mediapipe` + `public/models`, or set
> `NEXT_PUBLIC_POSE_MODEL_URL` to the Google Storage CDN URL.

## 6. Process manager — PM2 (or systemd, §6b)

```bash
sudo npm i -g pm2
sudo mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow the printed instruction to install the boot hook
```

Verify: `curl -s localhost:3000/api/health` →
`{"status":"ok",...,"garments":9}`.

### 6b. systemd alternative

```bash
sudo cp deploy/virtual-fit.service /etc/systemd/system/
sudo mkdir -p /var/log/virtual-fit && sudo chown www-data:www-data /var/log/virtual-fit
sudo chown -R www-data:www-data /var/www/virtual-fit
sudo systemctl daemon-reload
sudo systemctl enable --now virtual-fit
```

(Use either PM2 **or** systemd, not both.)

## 7. nginx + HTTPS

```bash
sudo cp nginx/virtual-fit.conf /etc/nginx/sites-available/virtual-fit
sudo ln -s /etc/nginx/sites-available/virtual-fit /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/virtual-fit   # set your domain
sudo nginx -t && sudo systemctl reload nginx

sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot rewrites the TLS paths; the config already expects
`/etc/letsencrypt/live/your-domain.com/`. Renewal is automatic
(`certbot` installs a systemd timer).

### Optional: Cloudflare in front

Proxy the DNS record (orange cloud). Nothing app-specific is required; nginx
already trusts only `X-Forwarded-For` from itself. You may enable “Always use
HTTPS” and Brotli at Cloudflare.

## 8. Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

(Plus the Lightsail firewall from §1.)

## 9. Small-instance tweaks (512 MB–1 GB)

```bash
# 1 GB swap to survive npm build memory spikes
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Build on the VPS takes ~1–2 minutes; `pm2 max_memory_restart` is set to 512 MB.

## 10. Retention / cron cleanup

The app sweeps expired files opportunistically (at most every 15 min). For
defense in depth add a cron job:

```bash
sudo crontab -u www-data -e
# add:
17 * * * * cd /var/www/virtual-fit && /usr/bin/node scripts/cleanup.mjs >> /var/log/virtual-fit-cleanup.log 2>&1
```

Tunables: `TEMP_TTL_HOURS` (1), `UPLOAD_TTL_HOURS` (24),
`RESULT_TTL_HOURS` (24).

## 11. Adding garments in production

Use `https://your-domain.com/admin` (password = `ADMIN_PASSWORD`), or place
files under `/data/virtual-fit/garments/` and edit
`/data/virtual-fit/catalog/catalog.json`. See README §15.

## 12. Backups

Everything stateful lives in `/data/virtual-fit` (plus `.env`):

```bash
# nightly tarball to the instance disk (adjust destination as needed)
sudo tar -czf /root/virtual-fit-$(date +\%F).tar.gz /data/virtual-fit /var/www/virtual-fit/.env
```

Lightsail snapshots of the instance give whole-machine recovery.

## 13. Updating the app

```bash
cd /var/www/virtual-fit
git pull
npm ci
npm run build
pm2 reload virtual-fit        # or: sudo systemctl restart virtual-fit
```

## 14. Troubleshooting

| Symptom | Check |
|---|---|
| Health returns `degraded` | `ls -l /data/virtual-fit` (owner must be www-data), disk full |
| 404 on `/api/assets/...` | File missing or path outside whitelisted areas |
| Pose model fails to load in browser | `public/models/*.task` exists; or set `NEXT_PUBLIC_POSE_MODEL_URL` to the CDN and rebuild |
| Uploads rejected 413 | nginx `client_max_body_size` (12m) vs `MAX_UPLOAD_MB` |
| Assistant says “Local rules engine” with a key set | Key invalid/model name wrong — check `pm2 logs virtual-fit` for `[ai]` lines |
| 429 responses | Rate limits hit (see env tunables) |
