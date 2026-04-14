# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# No database required — only generates client + Next bundle.
RUN npx prisma generate && npm run build:next

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Standalone trace does not include the Prisma CLI; add it for `migrate deploy` in entrypoint.
USER root
# Keep in sync with package-lock (Prisma CLI must match generated client).
RUN npm install prisma@6.19.3 --omit=dev --no-save \
  && chown -R nextjs:nodejs /app

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
