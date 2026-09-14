import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Express } from 'express';
import type { Clock } from '@islanders/domain/time';
import { ipRateLimitMiddleware } from '../rate-limit/ip-rate-limit.middleware.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { setupSwagger, type SwaggerOptions } from '../swagger/setup-swagger.js';
import { CLOCK } from '../time/time.module.js';
import { serverTimeMiddleware } from './server-time.middleware.js';

export interface ConfigureAppOptions {
  env: { SWAGGER_ENABLED: boolean; TRUST_PROXY: boolean | number | string; RATE_LIMIT_IP_PER_MINUTE: number };
  /** Brak = bez globalnego prefiksu (kontrolery deklarują pełne ścieżki). */
  globalPrefix?: string;
  swagger: SwaggerOptions;
}

/**
 * Jedno miejsce konfiguracji aplikacji HTTP, wspólne dla main.ts i testów e2e,
 * żeby testy biły w dokładnie tę samą aplikację, która idzie na produkcję.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  // Express 5 domyślnie routuje bez uwzględniania wielkości liter — bez tego ustawienia
  // `POST /INTERNAL/v1/token` trafiłby w ten sam handler co `/internal/v1/token`, omijając
  // middleware zakresu portu. Celowo NIE włączamy `strict routing` — zmieniłoby to zachowanie
  // istniejących tras core przy końcowym ukośniku.
  (app.getHttpAdapter().getInstance() as Express).set('case sensitive routing', true);
  if (options.env.TRUST_PROXY !== false) {
    // `HttpServer.getInstance()` w typach @nestjs/common nie przyjmuje parametru typu
    // (w przeciwieństwie do przykładu ze specyfikacji) — rzutowanie zamiast argumentu generycznego.
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', options.env.TRUST_PROXY);
  }
  app.use(serverTimeMiddleware(app.get<Clock>(CLOCK)));
  app.use(ipRateLimitMiddleware(app.get(RateLimiter), options.env.RATE_LIMIT_IP_PER_MINUTE));
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
