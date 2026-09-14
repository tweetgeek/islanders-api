import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import type { SigningKeyEntry } from './signing-keys.js';

/** Nowy aktywny wpis do JWT_SIGNING_KEYS. `kid` z datą ułatwia rotację ręczną. */
export async function generateSigningKeyEntry(now: Date = new Date()): Promise<SigningKeyEntry> {
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const jwk = await exportJWK(privateKey);
  const kid = `k-${now.toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
  return {
    kid,
    privateJwk: { ...jwk, kty: 'OKP', crv: 'Ed25519', x: jwk.x!, d: jwk.d! },
    status: 'active',
  };
}
