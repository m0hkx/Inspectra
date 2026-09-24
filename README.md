# Inspectra

Monorepo for the Inspectra platform: a **Next.js** web app and a **NestJS** API, sharing
contracts through a workspace package. Managed with **pnpm workspaces** + **Turborepo**.

```
Inspectra/
├─ apps/
│  ├─ api/                # NestJS 12 HTTP API            → http://localhost:3001/api
│  └─ web/                # Next.js 16 App Router         → http://localhost:3000
├─ packages/
│  └─ shared/             # @inspectra/shared — zod schemas + types used by both apps
├─ docker/                # docker-compose for local infra (not wired up yet)
├─ docs/                  # monorepo documentation
├─ tests/                 # reserved for cross-app end-to-end tests
├─ package.json           # workspace root — scripts only, no application code
├─ pnpm-workspace.yaml    # workspace globs + pnpm settings
├─ turbo.json             # task pipeline (build/dev/lint/typecheck/test)
└─ tsconfig.base.json     # shared TypeScript options extended by every package
```

## Requirements

| Tool    | Version   | Notes                                                          |
| ------- | --------- | -------------------------------------------------------------- |
| Node.js | >= 20.9.0 | Next 16 and Nest 12 both require it                            |
| pnpm    | 12.x      | pinned via the root `packageManager` field (enable `corepack`) |

```bash
corepack enable          # once, makes pnpm@12.5.1 the version this repo uses
pnpm install             # installs every workspace package from the single lockfile
```

## Everyday commands

Run these from the repository root — Turborepo figures out the correct order.

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | Runs the API, the web app **and** `@inspectra/shared` in watch mode |
| `pnpm dev:api`   | Only the NestJS API (`nest start --watch`)                          |
| `pnpm dev:web`   | Only the Next.js app (`next dev`)                                   |
| `pnpm build`     | Builds every package, dependencies first (`^build`)                 |
| `pnpm lint`      | ESLint for `apps/web`, oxlint for `apps/api`                        |
| `pnpm typecheck` | `tsc --noEmit` for every package                                    |
| `pnpm test`      | Jest unit tests (`apps/api`, `packages/shared`)                     |
| `pnpm test:e2e`  | Supertest e2e suite against the real Nest app                       |
| `pnpm format`    | Prettier across the repo                                            |

Target one package with a filter: `pnpm turbo run build --filter=@inspectra/api`.

## Endpoints

| Method | Path                   | Notes                                        |
| ------ | ---------------------- | -------------------------------------------- |
| GET    | `/api/health`          | Response typed by `healthResponseSchema`     |
| GET    | `/api/inspections`     | In-memory list                               |
| POST   | `/api/inspections`     | Body validated with `createInspectionSchema` |
| GET    | `/api/inspections/:id` | `404` for unknown ids                        |

```bash
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/inspections \
  -H 'content-type: application/json' \
  -d '{"name":"Homepage","target":"https://example.com"}'
```

## How the apps share code

`packages/shared` is the only runtime dependency between the two apps:

1. `packages/shared/src/*.ts` defines zod schemas; `z.infer` derives the TypeScript types.
2. Both apps declare `"@inspectra/shared": "workspace:*"`, so pnpm links the local package
   instead of hitting the registry.
3. The API validates request bodies with `ZodValidationPipe(createInspectionSchema)`, and the
   web app validates the API response with the same schema — one change breaks both builds
   rather than silently breaking production.

Build order is handled for you: `turbo.json` declares `"dependsOn": ["^build"]`, so
`@inspectra/shared` is always compiled (`tsc` → `dist/`) before its consumers run.

## Environment files

Each app owns its own env file; nothing is read from the repo root.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- `apps/api` loads `.env` through `@nestjs/config` (see `apps/api/src/app.module.ts`).
- `apps/web` reads `API_URL` in server components; use `NEXT_PUBLIC_API_URL` for browser code.
- `CONTEXT.md` is intentionally gitignored and left as local scratch space.

## Stack notes

- **NestJS 12 ships ESM-only.** `apps/api` compiles to CommonJS and relies on Node's
  `require(esm)` support, so the runtime needs Node ≥ 20.19 / 22.12 (24+ recommended), and Jest
  is launched with `--experimental-vm-modules` — exactly how the official Nest 12 template does
  it. Details in [docs/monorepo.md](docs/monorepo.md#nest-12-is-esm-only--why-the-api-scripts-look-unusual).
- **TypeScript 6** is the version Nest's own CLI pins; both apps and the shared package use it.
- **`next typegen`** is part of `apps/web`'s `typecheck` script, so Next's route types exist
  before `tsc --noEmit` runs.
- **pnpm 12 keeps its settings in `pnpm-workspace.yaml`**, not `.npmrc` — including the
  `allowBuilds` map that approves dependency postinstall scripts.

## Next steps

- Persist data: add Prisma/Drizzle to `apps/api` and start `docker/docker-compose.yml`.
- Tests for the web app (Vitest + React Testing Library) — `apps/web` currently has none.
- API documentation: `@nestjs/swagger` in `apps/api`.
- CI (`.github/workflows/ci.yml`) running `pnpm install --frozen-lockfile && pnpm check`.
- Multi-package version alignment via pnpm catalogs.

More detail — including how to add a new app or package — in [docs/monorepo.md](docs/monorepo.md).
