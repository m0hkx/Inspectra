import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { inspectionSchema } from '@inspectra/shared';
import { InspectionsService } from './inspections.service';

describe('InspectionsService', () => {
  let service: InspectionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InspectionsService],
    }).compile();

    service = module.get<InspectionsService>(InspectionsService);
  });

  it('starts empty', () => {
    expect(service.findAll()).toEqual([]);
  });

  it('creates an inspection that satisfies the shared contract', () => {
    const created = service.create({ name: 'Homepage', target: 'https://example.com' });

    expect(created.status).toBe('pending');
    expect(inspectionSchema.safeParse(created).success).toBe(true);
    expect(service.findAll()).toHaveLength(1);
  });

  it('throws NotFoundException for an unknown id', () => {
    expect(() => service.findOne('does-not-exist')).toThrow(NotFoundException);
  });
});
