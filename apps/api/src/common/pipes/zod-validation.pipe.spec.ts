import type { ArgumentMetadata } from '@nestjs/common';
import { siteInputSchema, templateInputSchema } from '@inspectra/shared';
import { z } from 'zod';
import { AppError } from '../errors/app-error';
import { ZodValidationPipe } from './zod-validation.pipe';

const meta: ArgumentMetadata = { type: 'body' };

function failure(pipe: ZodValidationPipe<unknown>, value: unknown): AppError {
  try {
    pipe.transform(value, meta);
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected the pipe to reject');
}

describe('ZodValidationPipe', () => {
  it('returns the parsed value, with trimming and defaults applied', () => {
    const pipe = new ZodValidationPipe(siteInputSchema);
    expect(pipe.transform({ name: '  Depot ', timezone: 'UTC' }, meta)).toEqual({
      name: 'Depot',
      address: '',
      timezone: 'UTC',
    });
  });

  it('strips keys the schema does not know', () => {
    const pipe = new ZodValidationPipe(siteInputSchema);
    expect(
      pipe.transform(
        { name: 'Depot', timezone: 'UTC', organizationId: 'other-org', id: 'x' },
        meta,
      ),
    ).not.toHaveProperty('organizationId');
  });

  it('throws a 400 VALIDATION_FAILED whose message is the first problem', () => {
    const error = failure(new ZodValidationPipe(siteInputSchema), {
      name: '',
      timezone: 'Nowhere/Land',
    });
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Name is required.');
    expect(error.details).toEqual([
      { path: 'name', message: 'Name is required.' },
      { path: 'timezone', message: 'Unknown timezone.' },
    ]);
  });

  it('joins nested paths with dots', () => {
    const error = failure(new ZodValidationPipe(templateInputSchema), {
      name: 'T',
      items: [
        { prompt: 'ok', defaultSeverity: 'LOW' },
        { prompt: '', defaultSeverity: 'LOW' },
      ],
    });
    expect(error.details?.[0]?.path).toBe('items.1.prompt');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', []],
    ['a string', 'name=Depot'],
  ])('reports a payload that is %s against "body"', (_label, value) => {
    expect(failure(new ZodValidationPipe(siteInputSchema), value).details?.[0]?.path).toBe('body');
  });

  it('reports query-string coercion failures on the right key', () => {
    const query = z.object({ limit: z.coerce.number().int().min(1) });
    expect(new ZodValidationPipe(query).transform({ limit: '5' }, { type: 'query' })).toEqual({
      limit: 5,
    });
    expect(failure(new ZodValidationPipe(query), { limit: 'many' }).details?.[0]?.path).toBe(
      'limit',
    );
  });
});
