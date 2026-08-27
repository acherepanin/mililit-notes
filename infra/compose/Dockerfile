FROM node:24-alpine AS dependencies

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY apps apps
COPY packages packages
RUN pnpm build \
  && mkdir -p apps/web/.next/standalone/apps/web/.next \
  && cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
  && cp -R apps/web/public apps/web/.next/standalone/apps/web/public \
  && pnpm --filter @notes/api deploy --prod /runtime/api \
  && pnpm --filter @notes/worker deploy --prod /runtime/worker

FROM node:24-alpine AS db-build

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/tsconfig.json packages/db/tsconfig.build.json packages/db/
RUN pnpm install --frozen-lockfile --filter @notes/db...

COPY packages/db packages/db
RUN pnpm --filter @notes/db build \
  && pnpm --filter @notes/db deploy --prod /runtime/db

FROM node:24-alpine AS db-runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=db-build --chown=node:node /runtime/db ./
COPY --from=db-build --chown=node:node /workspace/packages/db/dist ./dist
COPY --from=db-build --chown=node:node /workspace/packages/db/drizzle ./drizzle

USER node
CMD ["node", "dist/migrate.js"]

FROM node:24-alpine AS api-runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /runtime/api ./
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist

USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM node:24-alpine AS worker-runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /runtime/worker ./
COPY --from=build --chown=node:node /workspace/apps/worker/dist ./dist

USER node
EXPOSE 3002
CMD ["node", "dist/main.js"]

FROM node:24-alpine AS web-runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
