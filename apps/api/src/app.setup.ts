import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HTTP surface shared by `main.ts` and the e2e suite, so tests exercise exactly
 * the same prefix/CORS/pipes configuration as the deployed application.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000',
    credentials: true,
  });

  return app;
}
