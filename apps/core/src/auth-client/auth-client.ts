import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { EventBatch, WorldRegistration } from '@islanders/contracts';
import { ENV } from '@islanders/platform';
import type { Env } from '../infra/config/env.js';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

const CALL_TIMEOUT_MS = 2_000;
const TOKEN_RENEW_BEFORE_MS = 60_000;

export interface AuthResponse {
  status: number;
  body: unknown;
}

export class AuthUnavailableError extends Error {
  constructor(message: string) {
    super(`Usługa kont niedostępna: ${message}`);
    this.name = 'AuthUnavailableError';
  }
}

const tokenSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() });

/**
 * Wywołania wewnętrznego API auth po sieci wewnętrznej (ADR 0007): timeout 2 s, token serwisowy
 * trzymany w pamięci, circuit breaker (5 błędów → 30 s przerwy → jedno żądanie próbne).
 */
@Injectable()
export class AuthClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly breaker = new CircuitBreaker({ threshold: 5, openMs: 30_000, now: () => Date.now() });

  constructor(@Inject(ENV) private readonly env: Env) {}

  registerWorld(slug: string, registration: WorldRegistration): Promise<AuthResponse> {
    return this.authorized('PUT', `/internal/v1/worlds/${slug}`, registration);
  }

  sendEvents(batch: EventBatch): Promise<AuthResponse> {
    return this.authorized('POST', '/internal/v1/events', batch);
  }

  private async authorized(method: string, path: string, body: unknown): Promise<AuthResponse> {
    const res = await this.call(method, path, body, await this.serviceToken());
    if (res.status !== 401) return res;
    // Token mógł zostać unieważniony rotacją kluczy w auth — jedna próba z nowym.
    this.token = null;
    return this.call(method, path, body, await this.serviceToken());
  }

  private async serviceToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_RENEW_BEFORE_MS > Date.now()) {
      return this.token.value;
    }
    const res = await this.call('POST', '/internal/v1/token', {
      clientId: this.env.AUTH_CLIENT_ID,
      clientSecret: this.env.AUTH_CLIENT_SECRET,
    });
    if (res.status !== 200) {
      throw new AuthUnavailableError(`token serwisowy: HTTP ${res.status}`);
    }
    const parsed = tokenSchema.parse(res.body);
    this.token = { value: parsed.accessToken, expiresAt: Date.parse(parsed.expiresAt) };
    return parsed.accessToken;
  }

  private async call(method: string, path: string, body: unknown, token?: string): Promise<AuthResponse> {
    if (!this.breaker.canRequest()) throw new CircuitOpenError();
    let res: Response;
    try {
      res = await fetch(new URL(path, this.env.AUTH_INTERNAL_URL), {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (err) {
      this.breaker.recordFailure();
      throw new AuthUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (res.status >= 500) this.breaker.recordFailure();
    else this.breaker.recordSuccess();
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }
}
