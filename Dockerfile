# syntax=docker/dockerfile:1
##############################################################################
# Virtual Fit - production image (Next.js standalone + Prisma + Supabase)
#
# Stages:
#   deps    - install node_modules (linux-musl native binaries: sharp, prisma)
#   assets  - generate the prisma client + demo garment assets
#   builder - compile the Next.js standalone bundle
#   runner  - minimal runtime; syncs schema to Supabase and boots server.js
#
# The database lives in Supabase (PostgreSQL) - set DATABASE_URL at runtime.
# Persistent file storage (garment assets, uploads) lives on the /data volume:
#   /data/storage - STORAGE_ROOT
##############################################################################

##############################################################################
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall script must exist before npm ci runs it
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
# postinstall copies MediaPipe wasm into public/ and downloads the pose
# model into public/models (best effort - falls back to CDN if offline).
RUN npm ci

##############################################################################
FROM deps AS assets
ENV STORAGE_ROOT=/seed/storage
COPY prisma ./prisma
COPY scripts ./scripts
# 1. generate the prisma client for postgresql
# 2. draw demo garments (SVG -> WebP via sharp) + catalog.json
RUN npx prisma generate \
 && npm run seed

##############################################################################
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# wasm + pose model produced by postinstall (in case the context lacks them)
COPY --from=deps /app/public ./public

# NEXT_PUBLIC_* are baked into the client bundle at build time.
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_POSE_MODEL_URL="/models/pose_landmarker_lite.task"
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    STORAGE_ROOT=/tmp/storage \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_POSE_MODEL_URL=${NEXT_PUBLIC_POSE_MODEL_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
# No database is needed at build time: every DB-backed page is dynamic.
RUN npx prisma generate \
 && npm run build

##############################################################################
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_ROOT=/data/storage

# Next.js standalone server + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma CLI + generated client + engines (lets the entrypoint run
# `db push` against Supabase at container start)
COPY --from=assets /app/node_modules/prisma ./node_modules/prisma
COPY --from=assets /app/node_modules/@prisma ./node_modules/@prisma

# Prisma schema + catalog import script (used to seed an empty database)
COPY prisma ./prisma
COPY scripts/migrate-catalog-to-db.mjs ./scripts/migrate-catalog-to-db.mjs

# Baked demo garment assets, copied into /data/storage on first boot
COPY --from=assets /seed/storage ./.seed-storage

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data/storage

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
