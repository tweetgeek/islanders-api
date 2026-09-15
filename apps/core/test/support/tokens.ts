import { randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { AUDIENCE, type Role } from '@islanders/contracts';

export const TEST_ISSUER = 'https://users.islanders.test';

async function makeKeys(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA', use: 'sig' };
  return { kid, privateKey, publicJwk };
}

/** Klucz „auth” dla wszystkich testów procesu; `otherTestKeys` symuluje rotację i nieznany `kid`. */
export const testKeys = await makeKeys('test-key-1');
export const otherTestKeys = await makeKeys('test-key-2');

export interface TestPlayer {
  id: string;
  nickname: string;
  roles: Role[];
  token: string;
}

export interface PlayerTokenOptions {
  id?: string;
  nickname?: string;
  roles?: Role[];
  audience?: string;
  issuer?: string;
  expiresInSeconds?: number;
  keys?: typeof testKeys;
  extraClaims?: Record<string, unknown>;
  omitSub?: boolean;
}

export async function signPlayerToken(options: PlayerTokenOptions = {}): Promise<TestPlayer> {
  const id = options.id ?? randomUUID();
  const nickname = options.nickname ?? `p_${id.replace(/-/g, '').slice(0, 10)}`;
  const roles = options.roles ?? ['player'];
  const keys = options.keys ?? testKeys;
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT({ roles, nickname, ...options.extraClaims })
    .setProtectedHeader({ alg: 'EdDSA', kid: keys.kid, typ: 'JWT' })
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? AUDIENCE.worlds)
    .setIssuedAt(now)
    .setExpirationTime(now + (options.expiresInSeconds ?? 900))
    .setJti(randomUUID());
  if (!options.omitSub) jwt = jwt.setSubject(id);
  return { id, nickname, roles, token: await jwt.sign(keys.privateKey) };
}

export async function signToolsToken(options: { roles?: Role[]; sub?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles: options.roles ?? ['player', 'admin'] })
    .setProtectedHeader({ alg: 'EdDSA', kid: testKeys.kid, typ: 'JWT' })
    .setIssuer(TEST_ISSUER)
    .setAudience(AUDIENCE.tools)
    .setSubject(options.sub ?? randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(testKeys.privateKey);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}
