import { randomUUID } from 'node:crypto';
import type { TestApp } from './test-app.js';

export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export interface RegisteredPlayer {
  playerId: string;
  nickname: string;
  roles: string[];
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerPlayer(
  t: TestApp,
  overrides: Partial<{ email: string; nickname: string; password: string }> = {},
): Promise<RegisteredPlayer> {
  const suffix = uniqueSuffix();
  const body = {
    email: overrides.email ?? `a-${suffix}@test.local`,
    nickname: overrides.nickname ?? `a_${suffix}`,
    password: overrides.password ?? 'haslo-testowe-123',
  };
  const res = await t.publicHttp().post('/v1/auth/register').send(body).expect(201);
  return { ...res.body, email: body.email, password: body.password };
}
