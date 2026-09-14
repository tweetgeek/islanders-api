import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createLocalJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { ENV, REDIS, type RedisClient, withTimeout } from '@islanders/platform';
import type { Env } from '../infra/config/env.js';
import { RefreshGate } from './refresh-gate.js';

export const JWKS_CACHE_TTL_SECONDS = 604_800;
export const JWKS_REFRESH_GATE_MS = 30_000;
const REFRESH_INTERVAL_MS = 3_600_000;
const FETCH_TIMEOUT_MS = 2_000;
const REDIS_TIMEOUT_MS = 500;

const jwksSchema = z.object({
  keys: z.array(z.looseObject({ kty: z.string(), kid: z.string() })).min(1),
});

/** Klucz Redisa świata; slug w kluczu chroni przed pomyłką, gdy dwa światy dzielą instancję Redisa. */
export function jwksCacheKey(slug: string): string {
  return `auth:jwks:${slug}`;
}

/**
 * Klucze publiczne auth w pamięci procesu i w Redisie świata. Świeża replika bez dostępu do auth
 * weryfikuje tokeny kluczami z Redisa (etap 2 spec §4.1).
 */
@Injectable()
export class JwksProvider implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JwksProvider.name);
  private readonly gate = new RefreshGate(JWKS_REFRESH_GATE_MS, () => Date.now());
  private keySet: JWTVerifyGetKey | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.loadFromCache();
    if (this.keySet) {
      void this.refresh();
    } else {
      await this.refresh();
    }
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  current(): JWTVerifyGetKey | null {
    return this.keySet;
  }

  /** Odświeżenie wywołane nieznanym `kid` albo brakiem kluczy — nie częściej niż raz na 30 s. */
  async refreshAfterUnknownKid(): Promise<boolean> {
    if (!this.gate.tryAcquire()) return false;
    return this.refresh();
  }

  async refresh(): Promise<boolean> {
    let jwks: z.infer<typeof jwksSchema>;
    try {
      const res = await fetch(new URL('/.well-known/jwks.json', this.env.AUTH_INTERNAL_URL), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      jwks = jwksSchema.parse(await res.json());
    } catch (err) {
      this.logger.warn(`Nie udało się pobrać JWKS z auth: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.use(jwks);
    try {
      await withTimeout(
        this.redis.set(jwksCacheKey(this.env.WORLD_SLUG), JSON.stringify(jwks), 'EX', JWKS_CACHE_TTL_SECONDS),
        REDIS_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.warn(`Nie udało się zapisać JWKS w Redisie: ${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  }

  private async loadFromCache(): Promise<void> {
    try {
      const raw = await withTimeout(this.redis.get(jwksCacheKey(this.env.WORLD_SLUG)), REDIS_TIMEOUT_MS);
      if (raw) this.use(jwksSchema.parse(JSON.parse(raw)));
    } catch (err) {
      this.logger.warn(`Nie udało się odczytać JWKS z Redisa: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private use(jwks: z.infer<typeof jwksSchema>): void {
    this.keySet = createLocalJWKSet(jwks as unknown as JSONWebKeySet);
  }
}
