# ByteOffer — multi-stage image (architecture §11 Docker path). Produces a small runner that runs
# the Next standalone server (`node server.js`). Requires `output: "standalone"` in next.config.mjs.
#
# Stages:
#   deps    → install node_modules (with dev deps; needed for prisma generate + next build)
#   build   → prisma generate + next build (standalone)
#   runner  → copy only the standalone output + static assets + prisma engine; run as non-root

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
# Prisma needs OpenSSL at generate/runtime on Alpine.
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then build. Build-time env is not needed to connect anywhere; the
# app reads real env at runtime. A dummy DATABASE_URL keeps prisma/env happy during the build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV AUTH_SECRET="build-only-secret-not-for-production-0123456789ab"
ENV AUTH_URL="http://localhost:3000"
RUN npx prisma generate && npx next build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# The standalone output already contains a pruned node_modules + server.js. Copy the public assets
# and the static chunks alongside it (Next does not fold these into standalone).
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma schema + migrations are handy for `prisma migrate deploy` from within the image.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

# Standalone server entrypoint. Run DB migrations separately (e.g. `prisma migrate deploy`) as a
# release step before starting the container in production.
CMD ["node", "server.js"]
