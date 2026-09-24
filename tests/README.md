# Cross-app tests

Reserved for end-to-end tests that exercise `apps/web` and `apps/api` **together**
(for example Playwright driving the Next.js UI against a running NestJS API).

Unit tests live next to the code they cover:

- `apps/api/src/**/*.spec.ts` — Jest + `@nestjs/testing`
- `apps/api/test/*.e2e-spec.ts` — Supertest against the real Nest app (`pnpm test:e2e`)
- `packages/shared/src/**/*.spec.ts` — Jest, no framework involved

Nothing is wired up in this folder yet; when you add a runner here, expose it as a root script
(`pnpm test:cross-app`) plus a `test:cross-app` entry in `turbo.json` so caching applies.
