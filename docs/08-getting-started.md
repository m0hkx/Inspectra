[Docs](./README.md) › **Getting started**

# Getting started

Run Inspectra on your own machine in about five minutes.

## You'll need

- **Docker** (Docker Desktop on Windows and macOS)
- **A free [Clerk](https://clerk.com) application**, for sign-in. You need its *publishable key* (`pk_…`) and *secret key* (`sk_…`) from **Clerk Dashboard → API keys**.
- **Git**

For local development without Docker you'll also need **Node.js** 20.19+ or 22.12+ (24 recommended) and **pnpm** (`corepack enable` sets up the right version).

## 1. Get the code

Inspectra is one repository with both apps inside:

```bash
git clone https://github.com/m0hkx/Inspectra.git
cd Inspectra
```

## Option A: run everything in Docker

The quickest way. One command builds and starts PostgreSQL, Redis, the API and the web app.

### 2. Add your Clerk keys

Create `docker/.env`:

```bash
CLERK_SECRET_KEY="sk_test_…"                    # used by the API
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_…"   # built into the web app
```

### 3. Start the stack

```bash
pnpm docker:up      # or: docker compose -f docker/docker-compose.yml up --build -d
```

The API applies database migrations by itself when it starts.

### 4. Sign in

Open <http://localhost:3000>, create an account, and name your organization. You're its admin.

> [!NOTE]
> Stop with `pnpm docker:down`. Your data is kept. To wipe the database too, run `docker compose -f docker/docker-compose.yml down -v`.

## Option B: run the apps locally

Best for development: hot reload in both apps, with only the database and Redis in Docker.

### 2. Install and start the infrastructure

```bash
pnpm install         # also generates the Prisma client
pnpm infra:up        # PostgreSQL on :5432 and Redis on :6379
```

### 3. Configure both apps

```bash
cp apps/api/.env.example apps/api/.env              # then set CLERK_SECRET_KEY
cp apps/web/.env.example apps/web/.env.local        # then set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

### 4. Create the database and start

```bash
pnpm --filter @inspectra/api db:migrate   # apply the migrations
pnpm dev                                  # web on :3000, API on :3001
```

Open <http://localhost:3000> and sign in.

## Environment variables

**API** (`apps/api/.env`)

| Variable | Required | What it does |
| --- | :-: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string. Defaults to the Docker database in `.env.example`. |
| `CLERK_SECRET_KEY` | ✅ | Clerk **secret** key (`sk_…`). The API refuses to start with a publishable key by mistake. |
| `WEB_ORIGIN` | ✅ | The web app's address. Used for CORS and to reject tokens made for other sites. Comma-separate several. |
| `REDIS_URL` | | Redis for the hourly job. Leave it empty to run without the job (the tests do). |
| `CLERK_JWT_KEY` | | Clerk's JWT public key, to verify tokens without fetching Clerk's keys over the network |
| `PORT` | | Port to listen on. Defaults to `3001`. |

**Web app** (`apps/web/.env.local`)

| Variable | Required | What it does |
| --- | :-: | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk **publishable** key (`pk_…`), built into the browser bundle |
| `API_INTERNAL_URL` | | Where the Next.js server sends `/api/*`. Defaults to `http://localhost:3001`. |

Both web variables are read when `next dev` or `next build` starts, so restart after changing them.

## Useful scripts

Run these from the repository root. Turborepo runs each one in every app that has it, and builds the shared package first.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the web app and the API with hot reload |
| `pnpm dev:web` · `pnpm dev:api` | Start just one of them |
| `pnpm build` | Build everything for production |
| `pnpm lint` | ESLint for the web app, oxlint for the API |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Unit tests (API and shared package) |
| `pnpm test:e2e` | API integration tests against a real PostgreSQL |
| `pnpm infra:up` | Start only PostgreSQL and Redis in Docker |
| `pnpm docker:up` · `pnpm docker:down` · `pnpm docker:logs` | Run, stop or follow the full Docker stack |
| `pnpm --filter @inspectra/api db:migrate` | Create and apply a migration after changing the schema |
| `pnpm --filter @inspectra/api db:studio` | Browse the database in Prisma Studio |

> [!TIP]
> The integration tests create and migrate their own `inspectra_test` database. Start PostgreSQL with `pnpm infra:up` first.

## Continuous integration

Every push and pull request runs [the CI workflow](../.github/workflows/ci.yml) on GitHub Actions: install, lint, type-check, validate the Prisma schema, unit tests, integration tests against a PostgreSQL service, and a full build.

## Common problems

| Problem | Fix |
| --- | --- |
| **"Sign-in isn't configured"** | The web app was built without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Set it, then restart `next dev` or rebuild the image. |
| **"CLERK_SECRET_KEY must be the secret key"** | You pasted the publishable key (`pk_…`) into the API. Use the secret key (`sk_…`). |
| **Signed in, but every request is 401** | `WEB_ORIGIN` must match the web app's address exactly, including the port. |
| **"Verify the email address on your account"** | Inspectra only links verified emails. Verify it in Clerk, then sign in again. |
| **No inspections appear** | Check `REDIS_URL` is set and Redis is running, or press *Create due inspections now* on the Schedules page. |
| **`Cannot find module '@inspectra/shared'`** | The shared package hasn't been built. Run `pnpm build` once. (`test`, `typecheck` and `build` build it first, and `pnpm dev` rebuilds it as you edit.) |
| **Port already in use** | The web app uses 3000, the API 3001, PostgreSQL 5432 and Redis 6379. Stop whatever is using them, or change `PORT`. |

---

<div align="center">

[← Design system](./07-design-system.md) · [Docs home](./README.md) · [Engineering decisions →](./09-engineering-decisions.md)

</div>
