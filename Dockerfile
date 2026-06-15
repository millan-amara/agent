# API service image (build context = repo root). Web has its own Dockerfile.web.
# syntax=docker/dockerfile:1
FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- deps: install workspace deps from lockfile ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# --- build: generate Prisma client (Postgres) + compile TypeScript ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node apps/api/scripts/use-postgres.mjs \
  && npm run db:generate -w apps/api \
  && npm run build -w apps/api

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
# Apply schema to the managed Postgres on boot, then start. (Pilot uses
# `db push`; switch to `prisma migrate deploy` once migrations are committed.)
WORKDIR /app/apps/api
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
