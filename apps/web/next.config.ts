import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Monorepo: trace dependencies from the repository root, not just apps/web,
  // so `next build` (and standalone output) also collects workspace packages.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // `@inspectra/shared` publishes compiled JS + .d.ts, so it does not need to be
  // transpiled by Next. If you ever switch it to source-only exports, add:
  // transpilePackages: ['@inspectra/shared'],
};

export default nextConfig;
