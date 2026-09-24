import path from 'node:path';
import type { NextConfig } from 'next';

// Where the Nest API is reachable from the Next server. Read at build time, so the
// Docker image is built with API_INTERNAL_URL=http://api:3001.
const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  // Monorepo: trace dependencies from the repository root, not just apps/web,
  // so the standalone output also collects workspace packages.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async rewrites() {
    // The browser calls /api/* on its own origin; Next proxies to the API. No CORS,
    // and the API URL never has to be baked into client code.
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
