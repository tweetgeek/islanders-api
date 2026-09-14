import type { WorldStatus } from '@islanders/contracts';
import { profiles, worldSettings } from '../../src/infra/db/schema/index.js';
import type { TestApp } from './test-app.js';
import { type TestPlayer, bearer } from './tokens.js';

/** POST /v1/join; zwraca ciało odpowiedzi (własna osada domowa + serverTime). */
export async function joinWorld(t: TestApp, player: TestPlayer, name?: string) {
  const res = await t
    .http()
    .post('/v1/join')
    .set('Authorization', bearer(player.token))
    .send(name === undefined ? {} : { name })
    .expect(201);
  return res.body as Record<string, unknown> & { x: number; y: number };
}

export async function setWorldStatus(t: TestApp, status: WorldStatus): Promise<void> {
  await t.db.update(worldSettings).set({ status });
}

/** Profil bez osady — do scenariuszy „profil istnieje, osady brak”. */
export async function insertProfile(
  t: TestApp,
  player: TestPlayer,
  home: { x: number; y: number } | null = null,
): Promise<void> {
  await t.db.insert(profiles).values({
    playerId: player.id,
    nickname: player.nickname,
    homeX: home?.x ?? null,
    homeY: home?.y ?? null,
  });
}
