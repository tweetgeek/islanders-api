import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

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
