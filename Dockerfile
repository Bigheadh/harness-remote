# Stage 1: Build TypeScript sources
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: Minimal production runtime
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HARNESS_PORT=8787
ENV HARNESS_STORAGE_PATH=/data/harness.sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /data && chown -R node:node /app /data

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node config ./config

USER node
EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.HARNESS_PORT || process.env.PORT || 8787) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.js"]
