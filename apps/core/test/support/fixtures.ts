import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { WorldsService } from '../../src/modules/worlds/worlds.service.js';
import type { WorldRow } from '../../src/modules/worlds/worlds.repository.js';

export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export interface RegisteredPlayer {
  playerId: number;
  nickname: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Rejestruje świeże konto z unikalnym e-mailem i pseudonimem. */
export async function registerPlayer(
  app: INestApplication,
  overrides: Partial<{
    email: string;
    nickname: string;
    password: string;
  }> = {},
): Promise<RegisteredPlayer> {
  const suffix = uniqueSuffix();
  const body = {
    email: overrides.email ?? `p-${suffix}@test.local`,
    nickname: overrides.nickname ?? `p_${suffix}`,
    password: overrides.password ?? 'haslo-testowe-123',
  };
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(body)
    .expect(201);
  return { ...res.body, email: body.email, password: body.password };
}

/** Tworzy świat tak samo jak `npm run world:create`; domyślnie seed 1337, 200×200, wiatr (0.3, -0.1). */
export async function createWorld(
  app: INestApplication,
  overrides: Partial<{
    seed: number;
    width: number;
    height: number;
    windX: number;
    windY: number;
    status: 'OPEN' | 'CLOSED' | 'ENDED';
  }> = {},
): Promise<WorldRow> {
  return app.get(WorldsService).create({
    seed: 1337,
    width: 200,
    height: 200,
    windX: 0.3,
    windY: -0.1,
    ...overrides,
  });
}

/** POST /worlds/:id/join; zwraca ciało odpowiedzi (własna osada domowa + serverTime). */
export async function joinWorld(
  app: INestApplication,
  accessToken: string,
  worldId: number,
  name?: string,
) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/worlds/${worldId}/join`)
    .set('Authorization', bearer(accessToken))
    .send(name === undefined ? {} : { name })
    .expect(201);
  return res.body as Record<string, unknown> & { x: number; y: number };
}
