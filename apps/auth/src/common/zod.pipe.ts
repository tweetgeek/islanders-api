import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Ciała tras wewnętrznych walidujemy schematami z @islanders/contracts, nie DTO class-validator. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      });
    }
    return result.data;
  }
}
