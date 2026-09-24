# Inspectra

Inspectra helps companies schedule equipment inspections, turn failed checks into tracked work
orders, and prove what was fixed, by whom, and when.

```text
Schedule → Inspection generated → Inspector fails an item
        → Issue created → Work order → Technician completes
        → Inspector verifies → Everything recorded
```

A **Next.js** web app and a **NestJS** API over **PostgreSQL** (Prisma) and **Redis** (BullMQ),
sharing contracts through a workspace package. Managed with **pnpm workspaces** + **Turborepo**.

```
Inspectra/
├─ apps/
│  ├─ api/                # NestJS 12 API + Prisma + BullMQ   → http://localhost:3001/api
│  └─ web/                # Next.js 16 App Router              → http://localhost:3000
├─ packages/
│  └─ shared/             # @inspectra/shared: types, zod inputs, permissions, state machine, scheduling
├─ docker/                # docker-compose: postgres, redis, api, web
└─ docs/                  # monorepo documentation
```

## Run it with Docker (everything)

Needs Docker Desktop (or any Docker Engine with Compose v2).

```bash
pnpm docker:up          # = docker compose -f docker/docker-compose.yml up --build -d
```

Open **http://localhost:3000**. On first start the API applies migrations and seeds two demo
organizations; later starts keep your data.

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `pnpm docker:up`   | Build images and start postgres, redis, api, web     |
| `pnpm docker:logs` | Follow the API and web logs                          |
| `pnpm docker:down` | Stop everything (data is kept in Docker volumes)     |
| `docker compose -f docker/docker-compose.yml down -v` | Stop and **wipe** the database |

No pnpm on the host? The plain `docker compose -f docker/docker-compose.yml up --build` works the same.

### Demo logins

Use the name menu in the top right to switch between the seeded people. Each one sees only their
own organization:

| Person          | Role       | Organization         |
| --------------- | ---------- | -------------------- |
| Mohammad Khalid | Admin      | Northwind Facilities |
| Sara Haddad     | Inspector  | Northwind Facilities |
| Ahmed Nasser    | Technician | Northwind Facilities |
| Lina Farouk     | Technician | Northwind Facilities |
| Noor Salem      | Admin      | Harbor Labs          |

Sign-in is a demo mechanism (`AUTH_MODE=demo`, the web app sends `x-user-id`). Clerk replaces the
identity step later; memberships, roles and tenancy stay in our own tables.

## Run it for development

Requires Node.js ≥ 20.19 (24 recommended) and pnpm 12 (`corepack enable`).

```bash
pnpm install                               # also generates the Prisma client
cp apps/api/.env.example apps/api/.env
pnpm infra:up                              # postgres + redis in Docker
pnpm --filter @inspectra/api db:deploy     # apply migrations
pnpm --filter @inspectra/api db:seed       # demo data (safe to re-run)
pnpm dev                                   # api :3001 + web :3000 in watch mode
```

| Command                                    | What it does                                         |
| ------------------------------------------ | ---------------------------------------------------- |
| `pnpm build` / `lint` / `typecheck`        | Every package, in dependency order                   |
| `pnpm test`                                | Unit tests (shared rules, API)                       |
| `pnpm test:e2e`                            | API integration tests against real Postgres (`inspectra_test`) |
| `pnpm --filter @inspectra/api db:migrate`  | Create a migration after editing `prisma/schema.prisma` |
| `pnpm --filter @inspectra/api db:reset`    | Drop, re-migrate and re-seed the dev database        |
| `pnpm --filter @inspectra/api db:studio`   | Browse the database                                  |

## API

Every route except `/health` and `/auth/demo-users` needs `x-user-id`. Errors always look like
`{ "error": { "code": "WORK_ORDER_INVALID_TRANSITION", "message": "...", "requestId": "req_..." } }`.

| Method | Path                               | Who                     |
| ------ | ---------------------------------- | ----------------------- |
| GET    | `/api/health`                      | public                  |
| GET    | `/api/auth/demo-users`             | public (demo mode only) |
| GET    | `/api/me`                          | signed in               |
| GET    | `/api/members` · POST · PATCH `/:userId` | read: all · write: admin |
| GET    | `/api/sites` · POST · PATCH `/:id` | read: all · write: admin |
| GET    | `/api/assets` · `/:id` · POST · PATCH `/:id` | read: all · write: admin |
| GET    | `/api/templates` · POST · PUT `/:id` | read: all · write: admin |
| GET    | `/api/schedules` · POST · PATCH `/:id` | read: all · write: admin |
| POST   | `/api/schedules/generate`          | admin (same job the hourly worker runs) |
| GET    | `/api/inspections` · `/:id`        | admin: all · inspector: assigned |
| POST   | `/api/inspections/:id/submit`      | the assigned inspector  |
| GET    | `/api/issues`                      | admin, inspector (technicians: their own) |
| POST   | `/api/issues/:id/work-orders`      | admin                   |
| GET    | `/api/work-orders` · `/:id`        | technicians see only theirs |
| POST   | `/api/work-orders/:id/transitions` | decided by the transition table |
| GET    | `/api/audit-events`                | scoped like work orders |

## Engineering decisions

- **Tenancy enforced in the data layer.** A Prisma client extension
  (`apps/api/src/infrastructure/prisma/tenant.ts`) adds `organization_id` to every query on tenant
  tables from the request context. Services never filter by hand; outside an organization context
  it throws instead of returning everything.
- **Idempotency through database constraints.** `UNIQUE (schedule_id, due_at)` makes running the
  generation job twice harmless; `UNIQUE (inspection_response_id)` makes a retried submit unable to
  open a second issue.
- **Work order state machine with role-guarded transitions.** One table in
  `packages/shared/src/work-orders.ts` drives both the API's checks and the buttons the web app shows.
- **Template snapshots.** Inspections copy each prompt when generated; editing a template never
  rewrites history.
- **Timezone-aware scheduling.** "Monthly on the 1st at 09:00" is computed in the site's timezone
  and stored as UTC; the hourly BullMQ job reaches each site's "today" in turn.
- **Audit events in the same transaction** as the change they describe.

## How the apps share code

`packages/shared` holds everything both sides must agree on: response types, zod request schemas
(the API validates with them, the web app builds payloads against them), the role → permission map,
the transition table and the schedule computation. `turbo.json` builds it before its consumers.

In the browser, the web app calls `/api/*` on its own origin; Next.js proxies to the API
(`apps/web/next.config.ts`), so there is no CORS setup and no API URL in client code.

## Stack notes

- **NestJS 12 ships ESM-only.** `apps/api` compiles to CommonJS and relies on Node's
  `require(esm)` support, and Jest runs with `--experimental-vm-modules`. Details in
  [docs/monorepo.md](docs/monorepo.md#nest-12-is-esm-only--why-the-api-scripts-look-unusual).
- **Prisma 7** generates a CommonJS client into `apps/api/src/generated` (gitignored, recreated
  on install/build) and connects through the `pg` driver adapter; CLI settings live in
  `apps/api/prisma.config.ts`.
- **pnpm 12 keeps its settings in `pnpm-workspace.yaml`**, including the `allowBuilds` map that
  approves dependency install scripts (Prisma's engines).
- `CONTEXT.md` is intentionally gitignored and left as local planning space.

## Next steps

- Clerk sign-in in place of demo logins (swap the identity step in `common/auth/auth.guard.ts`).
- CI (`.github/workflows/ci.yml`): lint → typecheck → `prisma validate` → tests → build.
- Web app tests, and Playwright E2E for the core loop.
- Deploy: web on Vercel, API + worker on Railway/Render/Fly, Supabase Postgres, managed Redis.
