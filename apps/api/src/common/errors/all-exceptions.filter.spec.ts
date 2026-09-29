import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { apiErrorSchema, ForbiddenError, InvalidTransitionError } from '@inspectra/shared';
import { Prisma } from '../../generated/prisma/client';
import { RequestContext } from '../context/request-context';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppError } from './app-error';

function render(exception: unknown, requestId?: string) {
  const res = { statusCode: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const run = () => new AllExceptionsFilter().catch(exception, host);
  if (requestId) RequestContext.run({ requestId }, run);
  else run();
  return { status: res.statusCode, error: apiErrorSchema.parse(res.body).error };
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db said no', { code, clientVersion: 'test' });

describe('AllExceptionsFilter', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('renders an AppError with its status, code, message and details', () => {
    const details = [{ path: 'name', message: 'Name is required.' }];
    const { status, error } = render(
      new AppError(400, 'VALIDATION_FAILED', 'Name is required.', details),
      'req_abc123456789',
    );
    expect(status).toBe(400);
    expect(error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Name is required.',
      requestId: 'req_abc123456789',
      details,
    });
  });

  it('omits details when there are none', () => {
    const { error } = render(AppError.notFound('Site'));
    expect(error).not.toHaveProperty('details');
    expect(error.message).toBe('Site not found.');
  });

  it.each([
    ['notFound', AppError.notFound('Asset'), 404, 'NOT_FOUND'],
    ['forbidden', AppError.forbidden('No.'), 403, 'FORBIDDEN'],
    ['conflict', AppError.conflict('LAST_ADMIN', 'Keep one.'), 409, 'LAST_ADMIN'],
    [
      'unprocessable',
      AppError.unprocessable('INSPECTION_INCOMPLETE', 'Answer all.'),
      422,
      'INSPECTION_INCOMPLETE',
    ],
  ])('AppError.%s renders as %i %s', (_factory, exception, status, code) => {
    const rendered = render(exception);
    expect(rendered.status).toBe(status);
    expect(rendered.error.code).toBe(code);
  });

  it('renders an invalid work order move as 422 WORK_ORDER_INVALID_TRANSITION', () => {
    const { status, error } = render(new InvalidTransitionError('OPEN', 'VERIFIED'));
    expect(status).toBe(422);
    expect(error).toMatchObject({
      code: 'WORK_ORDER_INVALID_TRANSITION',
      message: 'Cannot move from OPEN to VERIFIED.',
    });
  });

  it('renders a missing permission as 403 FORBIDDEN', () => {
    const { status, error } = render(new ForbiddenError('manage:sites'));
    expect(status).toBe(403);
    expect(error).toMatchObject({
      code: 'FORBIDDEN',
      message: "You don't have permission to manage sites.",
    });
  });

  it('renders a unique-constraint violation as 409 without leaking the database message', () => {
    const { status, error } = render(prismaError('P2002'));
    expect(status).toBe(409);
    expect(error).toMatchObject({ code: 'CONFLICT', message: 'That record already exists.' });
  });

  it('renders a missing record as 404', () => {
    const { status, error } = render(prismaError('P2025'));
    expect(status).toBe(404);
    expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'Record not found.' });
  });

  it('renders other database errors as 500 and logs them', () => {
    const { status, error } = render(prismaError('P2003'), 'req_fk');
    expect(status).toBe(500);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).not.toContain('db said no');
    expect(logError).toHaveBeenCalledWith('[req_fk] Unhandled error', expect.any(String));
  });

  it.each([
    [new BadRequestException('Validation failed (uuid is expected)'), 400, 'VALIDATION_FAILED'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException('Cannot GET /api/nope'), 404, 'NOT_FOUND'],
    [new HttpException('Conflict', 409), 409, 'CONFLICT'],
    [new HttpException('Too big', 413), 413, 'INTERNAL'],
  ])('maps Nest HTTP exceptions by status (%s)', (exception, status, code) => {
    const rendered = render(exception);
    expect(rendered.status).toBe(status);
    expect(rendered.error.code).toBe(code);
    expect(logError).not.toHaveBeenCalled();
  });

  it('hides unexpected errors behind a generic 500 and logs the stack', () => {
    const { status, error } = render(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      'req_crash',
    );
    expect(status).toBe(500);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).not.toContain('undefined');
    expect(error.requestId).toBe('req_crash');
    expect(logError).toHaveBeenCalledWith(
      '[req_crash] Unhandled error',
      expect.stringContaining('TypeError'),
    );
  });

  it('survives non-Error throwables', () => {
    const { status } = render('a string was thrown');
    expect(status).toBe(500);
    expect(logError).toHaveBeenCalledWith(expect.any(String), 'a string was thrown');
  });

  it('uses a placeholder request id outside a request', () => {
    expect(render(AppError.notFound('Site')).error.requestId).toBe('no-request');
  });
});
