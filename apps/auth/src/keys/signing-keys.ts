import { importJWK, type JWK } from 'jose';
import { z } from 'zod';

export const SIGNING_KEYS = Symbol('SIGNING_KEYS');

export const signingKeyEntrySchema = z.object({
  kid: z.string().min(1).max(64),
  privateJwk: z.looseObject({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    x: z.string().min(1),
    d: z.string().min(1),
  }),
  status: z.enum(['active', 'retiring']),
});
export type SigningKeyEntry = z.infer<typeof signingKeyEntrySchema>;

export interface SigningKeys {
  activeKid: string;
  activeKey: CryptoKey;
  jwks: { keys: JWK[] };
}

/** Waliduje JWT_SIGNING_KEYS: dokładnie jeden aktywny klucz Ed25519, unikalne `kid`. */
export function parseSigningKeys(entries: unknown[]): SigningKeyEntry[] {
  const parsed = z.array(signingKeyEntrySchema).parse(entries);
  if (parsed.filter((e) => e.status === 'active').length !== 1) {
    throw new Error('JWT_SIGNING_KEYS: wymagany dokładnie jeden aktywny klucz');
  }
  if (new Set(parsed.map((e) => e.kid)).size !== parsed.length) {
    throw new Error('JWT_SIGNING_KEYS: powtórzony kid');
  }
  return parsed;
}

/** Klucz wycofywany zostaje w JWKS, dopóki mogą żyć podpisane nim tokeny. */
export function publicJwks(entries: SigningKeyEntry[]): JWK[] {
  return entries.map(({ kid, privateJwk }) => ({
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  }));
}

export async function loadSigningKeys(entries: unknown[]): Promise<SigningKeys> {
  const parsed = parseSigningKeys(entries);
  const active = parsed.find((e) => e.status === 'active')!;
  const activeKey = (await importJWK(active.privateJwk as JWK, 'EdDSA')) as CryptoKey;
  return { activeKid: active.kid, activeKey, jwks: { keys: publicJwks(parsed) } };
}
