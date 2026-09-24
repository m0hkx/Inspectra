import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ForbiddenError, InvalidTransitionError, type ApiError, type ErrorCode } from '@inspectra/shared';
import { Prisma } from '../../generated/prisma/client';
import { RequestContext } from '../context/request-context';
import { AppError } from './app-error';

const HTTP_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

/** Renders every failure as `{ error: { code, message, requestId } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    response.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ApiError } {
    const requestId = RequestContext.requestId();
    const body = (code: ErrorCode, message: string, details?: AppError['details']): ApiError => ({
      error: { code, message, requestId, ...(details ? { details } : {}) },
    });

    if (exception instanceof AppError) {
      return { status: exception.status, body: body(exception.code, exception.message, exception.details) };
    }
    if (exception instanceof InvalidTransitionError) {
      return { status: 422, body: body('WORK_ORDER_INVALID_TRANSITION', exception.message) };
    }
    if (exception instanceof ForbiddenError) {
      return { status: 403, body: body('FORBIDDEN', exception.message) };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { status: 409, body: body('CONFLICT', 'That record already exists.') };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: body('NOT_FOUND', 'Record not found.') };
      }
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: body(HTTP_CODES[status] ?? 'INTERNAL', exception.message) };
    }

    this.logger.error(`[${requestId}] Unhandled error`, exception instanceof Error ? exception.stack : String(exception));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: body('INTERNAL', 'Something went wrong on our side. Try again, and quote the request ID if it keeps happening.'),
    };
  }
}
