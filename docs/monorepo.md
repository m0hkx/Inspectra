# Monorepo guide

Deep dive into how this workspace is wired. The README covers the day-to-day commands;
this file explains the reasoning and the "how do I add something" recipes.

## 1. Why pnpm workspaces + Turborepo

- **pnpm workspaces** give one lockfile, one `node_modules` install pass and hard links
  between projects — no duplicate copies of React or Nest.
- **Turborepo** only adds task orchestration on top: it knows that consumers must wait for
  `@inspectra/shared` to build, and it caches task results locally (`.turbo/`) so an
  unchanged package is not rebuilt.
- Nothing here is Turborepo-specific in the application code, so swapping in Nx later only
  means replacing `turbo.json` + root scripts (Nx gives you generators and a project graph in
  exchange for a heavier setup).

## 2. The pieces

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- `apps/*` are deployable units (they get built and shipped).
- `packages/*` are libraries that are only ever consumed inside this repo (`private: true`).

In pnpm v10+ this file is **also the settings file for the package manager** — `.npmrc` is
only read for auth/registry settings now. That is why you will not find `shamefully-hoist`
or build-script settings in an `.npmrc` here.

### `package.json` (root)

Deliberately contains **no runtime dependencies**. Its only jobs are:

1. pinning the toolchain (`packageManager`, `engines`),
2. exposing workspace-wide scripts (`pnpm dev`, `pnpm build`, …) that delegate to Turborepo,
3. holding tooling shared by everything (`prettier`, `turbo`).

### `turbo.json`

```jsonc
"build":      { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] }
"dev":        { "cache": false, "persistent": true }
"lint":       { "outputs": [] }
"typecheck":  { "dependsOn": ["^build"], "outputs": [] }
"test":       { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
"test:e2e":   { "dependsOn": ["^build"], "outputs": [] }
```

- `^build` means "build my dependencies first" (the `^` = upstream packages).
- `outputs` is what Turborepo stores/restores from cache; forgetting a path in there means a
  cache hit hands you a package with a missing `dist/`.
- `persistent: true` tells Turborepo the task never exits, so it starts it last and streams
  its output (used by `pnpm dev`).

### `tsconfig.base.json`

Every package extends it with `"extends": "../../tsconfig.base.json"` and then adds only what
is genuinely specific:

| Package           | Adds                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/web`        | `module: esnext`, `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit`, `@/*` path alias            |
| `apps/api`        | `module/moduleResolution: nodenext`, `experimentalDecorators`, `emitDecoratorMetadata`, `outDir: dist` |
| `packages/shared` | `module/moduleResolution: nodenext`, `declaration`, `outDir: dist`                                     |

Keeping the base thin is intentional: Nest needs decorator metadata, Next needs a bundler
resolver, and forcing both to share `module`/`target` settings causes more breakage than it
prevents.

### Nest 12 is ESM-only — why the API scripts look unusual

Every `@nestjs/*` package v12 ships as pure ESM (`"type": "module"`, `exports` → `./index.js`,
no CommonJS build). `apps/api` intentionally stays **CommonJS** (no `"type": "module"`, so
`module: nodenext` emits `require()` calls) and relies on Node's `require(esm)` support, which
is exactly the setup Nest's own `nest new` CJS template produces. Two consequences:

1. **Jest must be started with `--experimental-vm-modules`**, otherwise requiring the ESM Nest
   packages fails with "Must use import to load ES Module". That is why `apps/api` runs
   `node --experimental-vm-modules ./node_modules/jest/bin/jest.js` instead of bare `jest`
   (copied verbatim from the Nest 12 template). `packages/shared` does not need it — it has no
   ESM-only dependencies.
2. **Runtime requires Node ≥ 20.19 / 22.12 (24+ recommended)** for `require(esm)`; this repo was
   verified with `node dist/main` on Node 26.

If you would rather embrace ESM end to end, delete `apps/api/tsconfig*.json`'s CJS stance by
adding `"type": "module"` to `apps/api/package.json` and switch the test runner to Vitest —
that is Nest's `ts-esm` template, and `vitest.config.ts` replaces `jest.config.ts`.

### `packages/shared`

The library is compiled (`tsc -p tsconfig.build.json` → `dist/`) and publishes an `exports`
map, so consumers resolve ordinary JS + `.d.ts` files. That means:

- no `transpilePackages` is required in Next,
- Jest/ts-jest and the Nest compiler both resolve it through normal `node_modules`,
- `@inspectra/shared` must be **built before** anything that imports it — which is exactly
  what `dependsOn: ["^build"]` guarantees.

If you prefer source-only exports (faster refactors, no build step), point `main`/`exports` at
`src/index.ts` and add `transpilePackages: ['@inspectra/shared']` to
`apps/web/next.config.ts`. Build-then-consume, as set up here, is less magic.

## 3. Dependency rules

```
apps/web  ─┐
           ├─►  packages/shared
apps/api  ─┘
```

- Apps may depend on packages; packages must **never** depend on apps.
- `apps/web` and `apps/api` must not import each other — they talk over HTTP, and the shared
  package is what keeps the two sides honest.
- Add a dependency to the right owner: `pnpm --filter @inspectra/api add @nestjs/swagger`.

## 4. Recipes

### Add a dependency to one app

```bash
pnpm --filter @inspectra/web add swr
pnpm --filter @inspectra/api add -D @nestjs/swagger
```

### Add a new shared library

```bash
# 1. create packages/utils/{package.json,tsconfig.json,tsconfig.build.json,src/index.ts}
#    name: "@inspectra/utils", private: true,
#    exports -> ./dist/index.js + ./dist/index.d.ts, build: "tsc -p tsconfig.build.json"
# 2. wire it into whoever needs it:
pnpm --filter @inspectra/api add @inspectra/utils@workspace:*
pnpm install
```

`packages/*` is already a workspace glob, so no other config change is needed.

### Add a new app

1. Scaffold it inside `apps/` with the official CLI, e.g.
   `pnpm create next-app@16 apps/admin --ts --app --eslint --skip-install`, then remove the
   generated lockfile/`node_modules` (the workspace has exactly one lockfile).
2. Give it a unique `name` (`@inspectra/admin`) and a unique dev port.
3. Make sure it exposes the `build` / `dev` / `lint` / `typecheck` scripts so Turborepo picks
   it up automatically.
4. Mention it in the root README and, if it is called from a browser, in `WEB_ORIGIN` /
   CORS handling in `apps/api`.

### Run one task for one package

```bash
pnpm turbo run test --filter=@inspectra/api
pnpm turbo run typecheck --filter=@inspectra/web...   # "..." = this package + its deps
```

## 5. Environment strategy

- Config lives next to the app that reads it: `apps/api/.env`, `apps/web/.env.local`.
- Commit only `.env.example`. The root `.gitignore` ignores `.env*` but whitelists
  `.env.example` / `.env.sample` / `.env.template`.
- Turborepo runs each package with that package's folder as `cwd`, which is why
  `@nestjs/config` finds `apps/api/.env` with no path configuration.
- Server-only values (`API_URL`) stay unprefixed; anything the browser needs must be
  `NEXT_PUBLIC_*` and is inlined into the client bundle at build time.

## 6. CI sketch

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

Add a Turborepo remote cache (or `actions/cache` over `.turbo` + `.next/cache`) once the repo
is in CI, otherwise every run rebuilds from scratch.

## 7. Troubleshooting

| Symptom                                                 | Cause / fix                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module '@inspectra/shared'`                | The package has not been built yet: `pnpm build` (Turborepo runs `^build` first).                                               |
| Web typecheck complains about `.next/types/routes.d.ts` | The `typecheck` script already runs `next typegen` first; if you run `tsc` by hand, run it after `next typegen` / `next build`. |
| `Ignored build scripts: …` during install               | pnpm blocks postinstall scripts; approve the ones you trust with `pnpm approve-builds` or allow them in `pnpm-workspace.yaml`.  |
| Two React copies / `Invalid hook call`                  | A dependency was installed outside the workspace, or `pnpm install` was run inside an app folder.                               |
| Port already in use                                     | Web = 3000, API = 3001; override via `PORT` (`apps/api/.env`) or `next dev --port 3002`.                                        |
| Want a clean slate                                      | Delete the `node_modules` folders and `pnpm-lock.yaml`, then re-run `pnpm install`.                                             |

## 8. Deliberate gaps

These are intentionally **not** set up yet, so the scaffold stays readable:

- no database/ORM — `InspectionsService` is an in-memory `Map` (`docker/docker-compose.yml`
  has Postgres + Redis ready for when that changes);
- no frontend test runner;
- no OpenAPI documentation;
- no CI workflow;
- `tests/` is reserved for cross-app end-to-end tests (e.g. Playwright against both apps).
