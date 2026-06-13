# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Notes application (NestJS API + built SPA served
# from the same port). Build context must be the `app/` directory:
#
#   docker build -f deploy/Dockerfile -t notes-app:latest .
#
# The layered env files (.env + .env.prod) are baked into the image, so the
# production compose file does not need to pass any configuration.

ARG NODE_IMAGE=node:22-bookworm-slim

# --- Frontend build -----------------------------------------------------------
FROM ${NODE_IMAGE} AS front-build
WORKDIR /build/front
COPY front/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY front/ ./
# Frontend build emits into /build/back/public (see vite config outDir).
RUN mkdir -p /build/back && npm run build

# --- Backend build ------------------------------------------------------------
FROM ${NODE_IMAGE} AS back-build
WORKDIR /build/back
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY back/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY back/ ./
RUN npm run build

# --- Production dependencies --------------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /build/back
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY back/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# --- Runtime ------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV APP_ENV=prod
ENV PORT=3000
WORKDIR /app

RUN groupadd --system notes \
  && useradd --system --gid notes --home-dir /app notes \
  && mkdir -p /app/data /app/public \
  && chown -R notes:notes /app

COPY --from=prod-deps --chown=notes:notes /build/back/node_modules ./node_modules
COPY --from=back-build --chown=notes:notes /build/back/dist ./dist
COPY --from=back-build --chown=notes:notes /build/back/package*.json ./
COPY --from=back-build --chown=notes:notes /build/back/.env /build/back/.env.prod ./
COPY --from=front-build --chown=notes:notes /build/back/public ./public

USER notes
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
