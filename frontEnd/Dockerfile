# Exim Operation System - Frontend (Next.js)
# Production-oriented; suitable for local development when used with docker-compose.
# For smaller production image, set output: 'standalone' in next.config and use a
# standalone-stage that copies .next/standalone and .next/static.

FROM node:20-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:3003/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Bust the COPY cache when the deployed commit changes
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Cap heap to 1.5 GB so the build does not exhaust server RAM and trigger OOM kills
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npm run build

# Runner (works with default Next.js; no standalone required)
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
