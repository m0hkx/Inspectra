# Inspectra API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t inspectra-api .

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# Prisma's schema engine (used by `migrate deploy`) needs OpenSSL on Alpine.
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

# Manifests first, so dependency layers stay cached until a package.json or the lockfile changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The API's postinstall runs `prisma generate`, which needs the schema.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/

FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @inspectra/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @inspectra/shared build && pnpm --filter @inspectra/api build

FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @inspectra/api...

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production PORT=3001
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/docker-entrypoint.sh ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
WORKDIR /repo/apps/api
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1
CMD ["sh", "docker-entrypoint.sh"]
