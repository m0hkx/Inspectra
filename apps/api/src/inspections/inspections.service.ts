import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateInspectionInput, Inspection } from '@inspectra/shared';

/**
 * In-memory store so the scaffold runs with no database.
 * Replace the Map with a repository (Prisma/Drizzle/TypeORM) when persisting.
 */
@Injectable()
export class InspectionsService {
  private readonly inspections = new Map<string, Inspection>();

  findAll(): Inspection[] {
    return [...this.inspections.values()];
  }

  findOne(id: string): Inspection {
    const inspection = this.inspections.get(id);

    if (!inspection) {
      throw new NotFoundException(`Inspection "${id}" was not found`);
    }

    return inspection;
  }

  create(input: CreateInspectionInput): Inspection {
    const inspection: Inspection = {
      ...input,
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.inspections.set(inspection.id, inspection);

    return inspection;
  }
}
