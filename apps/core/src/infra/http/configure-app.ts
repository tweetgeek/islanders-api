import { INestApplication } from '@nestjs/common';
import { configureApp as configurePlatformApp } from '@islanders/platform';
import type { Env } from '../config/env.js';

export function configureApp(app: INestApplication, env: Env): void {
  configurePlatformApp(app, {
    env,
    globalPrefix: 'api/v1',
    swagger: {
      title: 'Islanders API',
      description:
        'Backend gry Islanders. Wszystkie trasy poza /auth/* i /health wymagają Bearer JWT.',
      tags: ['health', 'auth', 'worlds', 'settlements', 'fleets'],
      path: 'api/docs',
    },
  });
}
