# Exim Operation System - Backend
# Production-oriented; suitable for local development when used with docker-compose.
# When a build step is added (e.g. TypeScript), add a multi-stage build that produces dist/.

# Debian slim (glibc): pip can install PyMuPDF wheels. Alpine/musl has no wheel and compiles MuPDF from source (needs gcc + long build).
FROM node:20-bookworm-slim
WORKDIR /app

# Python3 + PyMuPDF for PDF-to-image rendering (OCR pipeline)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && pip3 install --no-cache-dir pymupdf --break-system-packages \
    && apt-get purge -y python3-pip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3003
EXPOSE 3003

# Run migrations, then seed admin if SEED_ADMIN_EMAIL/PASSWORD set, then start
CMD ["sh", "-c", "npm run migrate:prod && (test -n \"$SEED_ADMIN_EMAIL\" && test -n \"$SEED_ADMIN_PASSWORD\" && npm run seed:prod || true) && npm run start"]
