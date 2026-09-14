import { createLocalJWKSet, jwtVerify } from 'jose';
import { registerPlayer } from './support/fixtures.js';
import { keysEnv, testSigningKeys } from './support/keys.js';
import { createTestApp } from './support/test-app.js';

describe('auth: rotacja kluczy podpisu (e2e)', () => {
  it('token starego klucza przechodzi, dopóki klucz jest retiring, a po usunięciu — nie', async () => {
    const { active: k1, other: k2 } = testSigningKeys;

    const before = await createTestApp({ env: { JWT_SIGNING_KEYS: keysEnv(k1) } });
    const player = await registerPlayer(before);
    await before.close();

    const during = await createTestApp({
      env: { JWT_SIGNING_KEYS: keysEnv({ ...k2, status: 'active' }, { ...k1, status: 'retiring' }) },
    });
    try {
      const jwks = (await during.publicHttp().get('/.well-known/jwks.json').expect(200)).body;
      expect(jwks.keys.map((k: { kid: string }) => k.kid).sort()).toEqual([k1.kid, k2.kid].sort());
      await expect(
        jwtVerify(player.accessToken, createLocalJWKSet(jwks), {
          audience: 'islanders-worlds',
          issuer: 'https://users.islanders.test',
        }),
      ).resolves.toBeDefined();
      const fresh = await during
        .publicHttp()
        .post('/v1/auth/login')
        .send({ email: player.email, password: player.password })
        .expect(200);
      const header = JSON.parse(Buffer.from(fresh.body.accessToken.split('.')[0], 'base64url').toString());
      expect(header.kid).toBe(k2.kid);
    } finally {
      await during.close();
    }

    const after = await createTestApp({ env: { JWT_SIGNING_KEYS: keysEnv({ ...k2, status: 'active' }) } });
    try {
      const jwks = (await after.publicHttp().get('/.well-known/jwks.json').expect(200)).body;
      await expect(
        jwtVerify(player.accessToken, createLocalJWKSet(jwks), {
          audience: 'islanders-worlds',
          issuer: 'https://users.islanders.test',
        }),
      ).rejects.toThrow();
    } finally {
      await after.close();
    }
  });
});
