import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { healthResponseSchema, inspectionSchema } from '@inspectra/shared';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('Inspectra API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health returns the shared health contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    const parsed = healthResponseSchema.safeParse(response.body);

    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('POST /api/inspections rejects a payload that fails the shared schema', async () => {
    await request(app.getHttpServer())
      .post('/api/inspections')
      .send({ name: 'Broken', target: 'not-a-url' })
      .expect(400);
  });

  it('POST /api/inspections stores a valid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inspections')
      .send({ name: 'Homepage availability', target: 'https://example.com' })
      .expect(201);

    expect(inspectionSchema.safeParse(response.body).success).toBe(true);
  });

  it('GET /api/inspections/:id returns 404 for an unknown id', async () => {
    await request(app.getHttpServer()).get('/api/inspections/unknown-id').expect(404);
  });
});
