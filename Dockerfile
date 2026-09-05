ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build
RUN pnpm --filter @lingcoo-edu-oms/server deploy --prod /prod/server

FROM ${NODE_IMAGE} AS runtime

ARG APP_VERSION=development
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION
ENV API_HOST=0.0.0.0
ENV API_PORT=8090

WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
RUN mkdir -p /app/data/storage && chown -R app:app /app/data

COPY --from=build --chown=app:app /prod/server ./apps/server
COPY --from=build --chown=app:app /app/apps/admin/dist ./apps/admin/dist
COPY --from=build --chown=app:app /app/apps/web/dist ./apps/web/dist

USER app
EXPOSE 8090
CMD ["node", "apps/server/dist/entrypoints/api.js"]
