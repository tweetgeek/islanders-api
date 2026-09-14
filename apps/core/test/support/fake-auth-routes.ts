import { eventBatchSchema, worldRegistrationSchema, type EventBatch, type WorldRegistration } from '@islanders/contracts';
import type { FakeAuth } from './fake-auth.js';

export interface AuthRouteOptions {
  tokenStatus?: number;
  worldsStatus?: number;
  eventsStatus?: number;
}

export interface AuthRouteState {
  tokenRequests: number;
  registrations: { slug: string; body: WorldRegistration }[];
  batches: EventBatch[];
  set(options: AuthRouteOptions): void;
}

/**
 * Wewnętrzne trasy auth: token serwisowy, rejestr, zdarzenia. Ciała walidowane schematami z
 * @islanders/contracts — ten sam kontrakt, który sprawdza prawdziwe auth (test kontraktowy).
 */
export function installAuthRoutes(fakeAuth: FakeAuth, initial: AuthRouteOptions = {}): AuthRouteState {
  let options = { tokenStatus: 200, worldsStatus: 204, eventsStatus: 200, ...initial };
  const state: AuthRouteState = {
    tokenRequests: 0,
    registrations: [],
    batches: [],
    set: (next) => {
      options = { ...options, ...next };
    },
  };
  const json = (res: import('node:http').ServerResponse, status: number, body?: unknown) =>
    res.writeHead(status, { 'content-type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));

  fakeAuth.addRoute((req, res) => {
    if (req.method !== 'POST' || req.path !== '/internal/v1/token') return false;
    state.tokenRequests += 1;
    if (options.tokenStatus !== 200) return json(res, options.tokenStatus, { statusCode: options.tokenStatus }), true;
    json(res, 200, { accessToken: 'token-serwisowy-testowy', expiresAt: new Date(Date.now() + 300_000).toISOString() });
    return true;
  });
  fakeAuth.addRoute((req, res) => {
    const match = /^\/internal\/v1\/worlds\/([a-z0-9-]+)$/.exec(req.path);
    if (req.method !== 'PUT' || !match) return false;
    const parsed = worldRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return json(res, 400, { statusCode: 400 }), true;
    state.registrations.push({ slug: match[1], body: parsed.data });
    json(res, options.worldsStatus);
    return true;
  });
  fakeAuth.addRoute((req, res) => {
    if (req.method !== 'POST' || req.path !== '/internal/v1/events') return false;
    const parsed = eventBatchSchema.safeParse(req.body);
    if (!parsed.success) return json(res, 400, { statusCode: 400 }), true;
    if (options.eventsStatus === 200) state.batches.push(parsed.data);
    json(res, options.eventsStatus, { accepted: parsed.data.events.length, duplicates: 0 });
    return true;
  });
  return state;
}
