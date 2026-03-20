FROM node:22-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --loglevel=error

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SKIP_ENV_VALIDATION=true
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy migrations and config for auto-migration
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Entrypoint script to run migrations before starting
RUN echo -e '#!/bin/sh\nnpm run db:migrate\nnode server.js' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]

