import type { ErrorCode } from '@inspectra/shared';

/** A failure the client can act on. The exception filter renders it as the API error body. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what: string): AppError {
    return new AppError(404, 'NOT_FOUND', `${what} not found.`);
  }

  static forbidden(message: string): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static conflict(code: ErrorCode, message: string): AppError {
    return new AppError(409, code, message);
  }

  static unprocessable(code: ErrorCode, message: string): AppError {
    return new AppError(422, code, message);
  }
}
