import { apiErrorSchema, type ErrorCode } from '@inspectra/shared';

/** A failed API call, carrying the server's typed error code and request id. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode | 'NETWORK',
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  /** Demo sign-in: which seeded user is acting. */
  userId?: string | null;
}

/**
 * Calls the Nest API through Next's `/api/*` rewrite (see next.config.ts), so the
 * browser only ever talks to its own origin.
 */
export async function api<T>(path: string, { method = 'GET', body, userId }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError("Can't reach the Inspectra API. Check that it's running, then try again.", 'NETWORK', 0);
  }

  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, requestId } = parsed.data.error;
      throw new ApiRequestError(message, code, response.status, requestId);
    }
    throw new ApiRequestError(`The API answered ${response.status}. Try again in a moment.`, 'INTERNAL', response.status);
  }
  return payload as T;
}
