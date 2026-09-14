import type { INestApplication } from '@nestjs/common';
import { configureApp, portScopeMiddleware } from '@islanders/platform';
import type { Env } from './infra/config/env.js';

/** Konfiguracja wspólna dla main.ts i testów e2e. Wywołać przed `app.listen`. */
export function configureCoreApp(app: INestApplication, env: Env): void {
  configureApp(app, {
    env,
    swagger: {
      title: 'Islanders World',
      description: 'API jednego świata. Trasy gracza wymagają tokenu wydanego przez usługę auth.',
      tags: ['world', 'settlements', 'fleets'],
      path: 'docs',
    },
  });
  // Po configureApp: odpowiedź 404 z zakresu portu też niesie X-Server-Time.
  app.use(portScopeMiddleware({ internalPrefixes: ['/health', '/admin'], sharedPaths: [] }));
}
