# syntax=docker/dockerfile:1
# Build from the project root: docker build -f deploy/Dockerfile .
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
# npm automatically excludes packages for other operating systems. Do not copy
# Windows node_modules: Next/SWC and image libraries need their Linux binaries.
RUN npm ci --include=dev --include=optional --no-audit --no-fund

FROM dependencies AS builder
COPY . .
# Build-only placeholders are not credentials and are never used for deployment.
# Public pages are rendered dynamically; no production database is contacted.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:9/build \
    DIRECT_DATABASE_URL=postgresql://build:build@127.0.0.1:9/build \
    DATABASE_TRANSPORT=pg APP_ORIGIN=https://homeretreatdirect.com \
    SITES_RUNTIME=false SITES_BUILD=false
RUN node node_modules/prisma/build/index.js generate
RUN node scripts/build-production.mjs

# Manual migration / initialization / audit image, never a public web service.
FROM base AS tools
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.json /app/prisma.config.ts ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/data ./data
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/deploy ./deploy
ENV NODE_ENV=production
RUN mkdir -p .local/media .local/backups && chown -R node:node .local
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "status"]

# The application runs as an unprivileged user and receives secrets at runtime.
FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Staff provenance is read from disk; it never belongs in the public directory.
COPY --from=builder --chown=node:node /app/data ./data
COPY --from=builder --chown=node:node /app/deploy/email-worker.mjs ./deploy/email-worker.mjs
RUN mkdir -p .local/media .local/backups .next/cache && chown -R node:node .local .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
