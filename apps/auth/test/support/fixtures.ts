import { randomUUID } from 'node:crypto';
import type { WorldRegistration } from '@islanders/contracts';
import type { TestApp } from './test-app.js';
import { testServiceClients } from './service-clients.js';

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

type TestClient = (typeof testServiceClients)[keyof typeof testServiceClients];

export async function serviceToken(t: TestApp, client: TestClient): Promise<string> {
  const res = await t
    .internalHttp()
    .post('/internal/v1/token')
    .send({ clientId: client.clientId, clientSecret: client.secret })
    .expect(200);
  return res.body.accessToken;
}

export async function registerWorld(
  t: TestApp,
  client: TestClient,
  overrides: Partial<WorldRegistration> = {},
): Promise<void> {
  const slug = client.entry.worldSlug;
  await t
    .internalHttp()
    .put(`/internal/v1/worlds/${slug}`)
    .set('Authorization', bearer(await serviceToken(t, client)))
    .send({
      name: `Świat ${slug}`,
      publicUrl: `https://${slug}.islanders.test`,
      adminUrl: `http://${slug}:3001`,
      status: 'OPEN',
      isTest: slug.endsWith('-test'),
      ...overrides,
    })
    .expect(204);
}
