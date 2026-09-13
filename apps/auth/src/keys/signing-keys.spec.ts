import { SignJWT, createLocalJWKSet, jwtVerify } from 'jose';
import { generateSigningKeyEntry } from './generate-signing-key.js';
import { loadSigningKeys, parseSigningKeys, publicJwks } from './signing-keys.js';

describe('klucze podpisu', () => {
  it('odrzuca zestaw bez klucza aktywnego i z dwoma aktywnymi', async () => {
    const a = await generateSigningKeyEntry();
    const b = await generateSigningKeyEntry();
    expect(() => parseSigningKeys([{ ...a, status: 'retiring' }])).toThrow(/dokładnie jeden aktywny/);
    expect(() => parseSigningKeys([a, b])).toThrow(/dokładnie jeden aktywny/);
    expect(() => parseSigningKeys([])).toThrow(/dokładnie jeden aktywny/);
  });

  it('odrzuca JWK bez części prywatnej, zły typ klucza i powtórzony kid', async () => {
    const a = await generateSigningKeyEntry();
    const { d: _d, ...publicOnly } = a.privateJwk;
    expect(() => parseSigningKeys([{ ...a, privateJwk: publicOnly }])).toThrow();
    expect(() => parseSigningKeys([{ ...a, privateJwk: { ...a.privateJwk, crv: 'P-256' } }])).toThrow();
    expect(() => parseSigningKeys([a, { ...a, status: 'retiring' }])).toThrow(/kid/);
  });

  it('JWKS zawiera wszystkie klucze bez części prywatnej', async () => {
    const a = await generateSigningKeyEntry();
    const b = { ...(await generateSigningKeyEntry()), status: 'retiring' as const };
    const jwks = publicJwks(parseSigningKeys([a, b]));
    expect(jwks.map((k) => k.kid).sort()).toEqual([a.kid, b.kid].sort());
    for (const k of jwks) {
      expect(k.d).toBeUndefined();
      expect(k).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    }
  });

  it('token podpisany kluczem aktywnym weryfikuje się przez JWKS', async () => {
    const keys = await loadSigningKeys([await generateSigningKeyEntry()]);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: keys.activeKid })
      .setIssuer('https://users.islanders.test')
      .setAudience('islanders-worlds')
      .setExpirationTime('5m')
      .sign(keys.activeKey);
    const { payload } = await jwtVerify(token, createLocalJWKSet(keys.jwks), {
      issuer: 'https://users.islanders.test',
      audience: 'islanders-worlds',
    });
    expect(payload.aud).toBe('islanders-worlds');
  });
});
