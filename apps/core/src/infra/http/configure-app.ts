import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import type { Env } from '../config/env.js';
import { setupSwagger } from '../swagger/setup-swagger.js';
import { CLOCK } from '../time/time.module.js';
import { serverTimeMiddleware } from './server-time.middleware.js';

/**
 * Jedno miejsce konfiguracji aplikacji HTTP, wspólne dla main.ts i testów e2e,
 * żeby testy biły w dokładnie tę samą aplikację, która idzie na produkcję.
 */
export function configureApp(app: INestApplication, env: Env): void {
  app.use(serverTimeMiddleware(app.get<Clock>(CLOCK)));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  if (env.SWAGGER_ENABLED) {
    setupSwagger(app);
  }
}
