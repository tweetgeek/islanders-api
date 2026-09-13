import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import { setupSwagger, type SwaggerOptions } from '../swagger/setup-swagger.js';
import { CLOCK } from '../time/time.module.js';
import { serverTimeMiddleware } from './server-time.middleware.js';

export interface ConfigureAppOptions {
  env: { SWAGGER_ENABLED: boolean };
  /** Brak = bez globalnego prefiksu (kontrolery deklarują pełne ścieżki). */
  globalPrefix?: string;
  swagger: SwaggerOptions;
}

/**
 * Jedno miejsce konfiguracji aplikacji HTTP, wspólne dla main.ts i testów e2e,
 * żeby testy biły w dokładnie tę samą aplikację, która idzie na produkcję.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  app.use(serverTimeMiddleware(app.get<Clock>(CLOCK)));
  if (options.globalPrefix) {
    app.setGlobalPrefix(options.globalPrefix);
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  if (options.env.SWAGGER_ENABLED) {
    setupSwagger(app, options.swagger);
  }
}
