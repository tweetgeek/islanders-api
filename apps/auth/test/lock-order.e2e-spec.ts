import postgres, { type Sql } from 'postgres';
import type { Response } from 'supertest';
import { inject } from 'vitest';
import { PlayersAdmin } from '../src/players/players-admin.js';
import { hashRefreshToken } from '../src/players/refresh-tokens.js';
import { registerPlayer } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * Odtwarza wyścig między `AuthService.refresh` a `PlayersAdmin.setPassword`/`disable`:
 * obie transakcje blokują wiersz gracza i wiersze refresh tokenów tego gracza, więc przy
 * niespójnej kolejności blokad (refresh: token → gracz; admin: gracz → token) Postgres
 * wykrywa cykl i ubija jedną z transakcji błędem 40P01, co bez obsługi wychodzi jako 500.
 */
describe('auth: kolejność blokad refresh vs players-admin (e2e)', () => {
  let t: TestApp;
  let admin: PlayersAdmin;
  let sql: Sql;

  beforeAll(async () => {
    t = await createTestApp();
    admin = t.app.get(PlayersAdmin);
    sql = postgres(inject('databaseUrl'), { max: 5 });
  });
  afterAll(async () => {
    await sql.end();
    await t.close();
  });

  /**
   * Czeka, aż przynajmniej jedna inna sesja ugrzęźnie na blokadzie wiersza — potwierdza, że
   * `setPassword` zdążyło już dobiec do `revokeAllForPlayer` (a nie utknąć wcześniej np. na
   * hashowaniu argon2 hasła). Odpytuje `pg_stat_activity` na tym samym zarezerwowanym
   * połączeniu, które trzyma blokadę wiersza refresh tokenu.
   */
  async function waitForAnyBlockedSession(reserved: Awaited<ReturnType<Sql['reserve']>>): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const [{ n }] = await reserved<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()
      `;
      if (n >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Nie doczekano się żadnej zablokowanej sesji');
  }

  it(
    'równoległe refresh i setPassword nie kończą się deadlockiem/5xx',
    async () => {
      for (let i = 0; i < 3; i++) {
        const a = await registerPlayer(t);
        const reserved = await sql.reserve();
        try {
          await reserved`BEGIN`;
          // Trzymamy blokadę na wierszu refresh tokenu, dopóki obie operacje poniżej nie zaczną
          // na niej czekać — dopiero wtedy zwalniamy, żeby obie ruszyły "w tym samym momencie"
          // i musiały się rozstrzygnąć względem siebie w kolejności blokad z produkcyjnego kodu.
          await reserved`
            SELECT * FROM refresh_tokens
            WHERE token_hash = ${hashRefreshToken(a.refreshToken)}
            FOR UPDATE
          `;

          // supertest/superagent nie wysyła żądania, dopóki nie wywoła się `.then()`/`.end()` —
          // przy zwykłym `await` na końcu żądanie ruszyłoby dopiero po zwolnieniu blokady poniżej,
          // więc wymuszamy start od razu przez callbackowe `.end()`.
          const refreshPromise = new Promise<Response>((resolve, reject) => {
            t.publicHttp()
              .post('/v1/auth/refresh')
              .send({ refreshToken: a.refreshToken })
              .end((err, res) => (err ? reject(err) : resolve(res)));
          });
          const setPasswordPromise = admin.setPassword(a.email, 'kolejne-haslo-999').then(
            () => ({ ok: true as const }),
            (err: unknown) => ({ ok: false as const, err }),
          );

          // Poczekaj, aż setPassword na pewno dotrze do `revokeAllForPlayer` i zablokuje się na
          // wierszu tokenu, plus mały zapas na to, żeby refresh też zdążył zapytać o ten wiersz —
          // jego pierwsza instrukcja w transakcji to właśnie blokada tego samego wiersza, więc jest
          // praktycznie natychmiastowa.
          await waitForAnyBlockedSession(reserved);
          await new Promise((resolve) => setTimeout(resolve, 100));
          await reserved`COMMIT`;

          const [refreshRes, setPasswordOutcome] = await Promise.all([refreshPromise, setPasswordPromise]);

          expect(
            refreshRes.status,
            `refresh zwrócił ${refreshRes.status}: ${JSON.stringify(refreshRes.body)}`,
          ).toBeLessThan(500);
          if (!setPasswordOutcome.ok) {
            throw setPasswordOutcome.err;
          }
        } finally {
          await reserved.release();
        }
      }
    },
    60_000,
  );
});
