# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS front-deps
WORKDIR /build/front
COPY front/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM front-deps AS front-build
WORKDIR /build/front
COPY front/ ./
RUN mkdir -p /build/back && npm run build

FROM ${NODE_IMAGE} AS back-deps
WORKDIR /build/back
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY back/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM back-deps AS back-build
WORKDIR /build/back
COPY back/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /build/back
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY back/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/notes.sqlite
ENV AI_TRANSCRIPTION_MODEL=whisper-1
WORKDIR /app

RUN groupadd --system notes \
  && useradd --system --gid notes --home-dir /app notes \
  && mkdir -p /app/data /app/public \
  && chown -R notes:notes /app

COPY --from=prod-deps --chown=notes:notes /build/back/node_modules ./node_modules
COPY --from=back-build --chown=notes:notes /build/back/dist ./dist
COPY --from=back-build --chown=notes:notes /build/back/package*.json ./
COPY --from=front-build --chown=notes:notes /build/back/public ./public

USER notes
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
