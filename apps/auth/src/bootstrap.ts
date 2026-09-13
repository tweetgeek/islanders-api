import type { INestApplication } from '@nestjs/common';
import { configureApp, portScopeMiddleware } from '@islanders/platform';
import type { AuthEnv } from './config/env.js';

/** Konfiguracja wspólna dla main.ts i testów e2e. Wywołać przed `app.listen`. */
export function configureAuthApp(app: INestApplication, env: AuthEnv): void {
  // Najpierw nagłówek czasu i sufit po adresie (w configureApp), potem zakres portu —
  // odpowiedź 404 z zakresu portu też niesie X-Server-Time.
  configureApp(app, {
    env,
    swagger: {
      title: 'Islanders Auth',
      description: 'Konta, tokeny i rejestr światów. Trasy /internal/* tylko na porcie wewnętrznym.',
      tags: ['auth', 'worlds', 'internal', 'health'],
      path: 'docs',
    },
  });
  app.use(
    portScopeMiddleware({
      internalPrefixes: ['/internal', '/health'],
      sharedPaths: ['/.well-known/jwks.json'],
    }),
  );
}
