import { fetchHealth } from '@/lib/api-client';

// Rendered per request so `next build` never needs a running API.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await fetchHealth();

  return (
    <main className="page">
      <h1>Inspectra</h1>
      <p className="lead">
        Monorepo scaffold — <code>apps/web</code> (Next.js) reading <code>apps/api</code> (NestJS)
        through the contracts in <code>packages/shared</code>.
      </p>

      <section className={health ? 'card' : 'card card--offline'}>
        <h2>API health</h2>
        {health ? (
          <dl>
            <dt>Status</dt>
            <dd>{health.status}</dd>
            <dt>Service</dt>
            <dd>{health.service}</dd>
            <dt>Version</dt>
            <dd>{health.version}</dd>
            <dt>Uptime</dt>
            <dd>{health.uptimeSeconds}s</dd>
            <dt>Checked at</dt>
            <dd>{health.timestamp}</dd>
          </dl>
        ) : (
          <p>
            No response from the API. Start it with <code>pnpm dev:api</code> (or{' '}
            <code>pnpm dev</code> to run both apps) and reload this page.
          </p>
        )}
      </section>
    </main>
  );
}
