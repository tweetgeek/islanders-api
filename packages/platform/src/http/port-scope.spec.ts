import { INTERNAL_REQUEST, portScopeMiddleware } from './port-scope.js';

function run(path: string, internal: boolean) {
  const mw = portScopeMiddleware({
    internalPrefixes: ['/internal', '/health'],
    sharedPaths: ['/.well-known/jwks.json'],
  });
  let status = 0;
  let nextCalled = false;
  const req = { path, method: 'GET', [INTERNAL_REQUEST]: internal } as never;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as never;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { status, nextCalled };
}

describe('portScopeMiddleware', () => {
  it('trasa wewnętrzna na porcie publicznym -> 404', () => {
    expect(run('/internal/v1/token', false)).toEqual({ status: 404, nextCalled: false });
    expect(run('/health/ready', false)).toEqual({ status: 404, nextCalled: false });
  });
  it('trasa publiczna na porcie wewnętrznym -> 404', () => {
    expect(run('/v1/auth/login', true)).toEqual({ status: 404, nextCalled: false });
  });
  it('trasy właściwe dla portu i ścieżki wspólne przechodzą', () => {
    expect(run('/v1/auth/login', false).nextCalled).toBe(true);
    expect(run('/internal/v1/token', true).nextCalled).toBe(true);
    expect(run('/.well-known/jwks.json', false).nextCalled).toBe(true);
    expect(run('/.well-known/jwks.json', true).nextCalled).toBe(true);
  });
  it('prefiks dopasowuje całe segmenty, nie początek słowa', () => {
    expect(run('/internals', false).nextCalled).toBe(true);
  });
});
