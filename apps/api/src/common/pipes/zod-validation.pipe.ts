import { Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error';

/**
 * Validates a request payload against a zod schema from `@inspectra/shared`, the
 * same schema the web app builds its payloads against.
 *
 * @example
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(siteInputSchema)) input: SiteInput) {}
 * ```
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw new AppError(400, 'VALIDATION_FAILED', details[0]?.message ?? 'The request is invalid.', details);
  }
}
