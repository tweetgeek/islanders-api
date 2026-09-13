import { randomUUID } from 'node:crypto';
import {
  AUDIENCE,
  eventBatchSchema,
  serviceClaimsSchema,
  serviceSubject,
  slugFromServiceSubject,
  worldRegistrationSchema,
  worldSlugSchema,
  worldsAccessClaimsSchema,
} from './index.js';

const now = Math.floor(Date.parse('2026-09-13T12:00:00Z') / 1000);
const joined = (overrides: Record<string, unknown> = {}) => ({
  type: 'PlayerJoinedWorld',
  eventId: randomUUID(),
  worldSlug: 'world-1',
  occurredAt: '2026-09-13T12:00:00.000Z',
  playerId: randomUUID(),
  joinedAt: '2026-09-13T12:00:00.000Z',
  ...overrides,
});

describe('kontrakty', () => {
  it('slug: małe litery, cyfry i pojedyncze myślniki, 3–40 znaków', () => {
    for (const ok of ['world-1', 'world-2-test', 'abc']) {
      expect(worldSlugSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['World-1', 'w1', '-world', 'world--1', 'world-', 'a'.repeat(41), 'świat-1']) {
      expect(worldSlugSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('claimy gracza wymagają aud islanders-worlds, uuid w sub i co najmniej jednej roli', () => {
    const claims = {
      iss: 'https://users.islanders.online',
      aud: AUDIENCE.worlds,
      sub: randomUUID(),
      roles: ['player'],
      nickname: 'koralowy_kapitan',
      iat: now,
      exp: now + 900,
      jti: randomUUID(),
    };
    expect(worldsAccessClaimsSchema.safeParse(claims).success).toBe(true);
    expect(worldsAccessClaimsSchema.safeParse({ ...claims, aud: AUDIENCE.tools }).success).toBe(false);
    expect(worldsAccessClaimsSchema.safeParse({ ...claims, roles: [] }).success).toBe(false);
    expect(worldsAccessClaimsSchema.safeParse({ ...claims, roles: ['king'] }).success).toBe(false);
  });

  it('podmiot serwisowy koduje slug świata w obie strony', () => {
    const sub = serviceSubject('world-2-test');
    expect(sub).toBe('service:core:world-2-test');
    expect(slugFromServiceSubject(sub)).toBe('world-2-test');
    expect(
      serviceClaimsSchema.safeParse({
        iss: 'https://users.islanders.online',
        aud: AUDIENCE.internal,
        sub,
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      }).success,
    ).toBe(true);
  });

  it('rejestracja świata odrzuca nieznane pola i zły status', () => {
    const reg = {
      name: 'Świat 1',
      publicUrl: 'https://world-1.islanders.online',
      adminUrl: 'http://core-world-1:3001',
      status: 'OPEN',
      isTest: false,
    };
    expect(worldRegistrationSchema.safeParse(reg).success).toBe(true);
    expect(worldRegistrationSchema.safeParse({ ...reg, status: 'PAUSED' }).success).toBe(false);
    expect(worldRegistrationSchema.safeParse({ ...reg, extra: 1 }).success).toBe(false);
  });

  it('partia zdarzeń: 1–100, znany typ, poprawne pola typu', () => {
    expect(eventBatchSchema.safeParse({ events: [joined()] }).success).toBe(true);
    expect(eventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      eventBatchSchema.safeParse({ events: Array.from({ length: 101 }, () => joined()) }).success,
    ).toBe(false);
    expect(eventBatchSchema.safeParse({ events: [joined({ type: 'PlayerBanned' })] }).success).toBe(false);
    expect(eventBatchSchema.safeParse({ events: [joined({ playerId: 'nie-uuid' })] }).success).toBe(false);
  });
});
