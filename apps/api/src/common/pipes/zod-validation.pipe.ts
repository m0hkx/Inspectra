import { BadRequestException, Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request payload against a zod schema from `@inspectra/shared`.
 *
 * Using the very same schema the web app uses means a request can never be
 * accepted by one side and rejected by the other.
 *
 * @example
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(createInspectionSchema)) input: CreateInspectionInput) {}
 * ```
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues.map(
          (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`,
        ),
      });
    }

    return result.data;
  }
}
