/**
 * `@inspectra/shared` is the single source of truth for the data that crosses
 * the HTTP boundary between `apps/api` (NestJS) and `apps/web` (Next.js), plus the
 * business rules both sides must agree on (permissions, the work order state
 * machine, schedule computation).
 *
 * Everything here must stay framework-agnostic: no NestJS, no React, no Node
 * built-ins. Zod schemas double as runtime validators and as TypeScript types,
 * so a change made here breaks the build on both sides instead of silently
 * breaking production.
 */
export * from './api-error';
export * from './domain';
export * from './health';
export * from './inputs';
export * from './permissions';
export * from './schedule';
export * from './work-orders';
