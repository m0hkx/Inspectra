import { healthResponseSchema } from '@inspectra/shared';
import type { HealthResponse } from '@inspectra/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';

/**
 * Reads `GET /api/health` from the NestJS app and validates the response with
 * the same schema the API used to produce it.
 *
 * Returns `null` when the API is unreachable or answers with an unexpected
 * shape, so the page can render a helpful message instead of throwing.
 */
export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${API_URL}/health`, { cache: 'no-store' });

    if (!response.ok) {
      return null;
    }

    const parsed = healthResponseSchema.safeParse(await response.json());

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
