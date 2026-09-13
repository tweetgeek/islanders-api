import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { worldSlugSchema } from '@islanders/contracts';

export const SERVICE_CLIENTS = Symbol('SERVICE_CLIENTS');

export const serviceClientEntrySchema = z.object({
  clientId: z.string().min(3).max(64),
  secretSha256: z.string().regex(/^[0-9a-f]{64}$/),
  worldSlug: worldSlugSchema,
});
export type ServiceClientEntry = z.infer<typeof serviceClientEntrySchema>;

export function parseServiceClients(entries: unknown[]): ServiceClientEntry[] {
  const parsed = z.array(serviceClientEntrySchema).parse(entries);
  if (new Set(parsed.map((e) => e.clientId)).size !== parsed.length) {
    throw new Error('SERVICE_CLIENTS: powtórzony clientId');
  }
  return parsed;
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text).digest();
}

/** Skrót, z którym porównujemy sekret nieznanego klienta, żeby czas odpowiedzi był ten sam. */
const DUMMY_HASH = sha256('atrapa-klienta-serwisowego');

/**
 * Sekret ma co najmniej 32 losowe bajty, więc SHA-256 wystarcza — argon2 chroni hasła
 * o niskiej entropii, a tu entropii jest pod dostatkiem.
 */
export class ServiceClients {
  private readonly byId: Map<string, ServiceClientEntry>;

  constructor(entries: ServiceClientEntry[]) {
    this.byId = new Map(entries.map((e) => [e.clientId, e]));
  }

  authenticate(clientId: string, secret: string): ServiceClientEntry | null {
    const entry = this.byId.get(clientId);
    const expected = entry ? Buffer.from(entry.secretSha256, 'hex') : DUMMY_HASH;
    const matches = timingSafeEqual(sha256(secret), expected);
    return entry && matches ? entry : null;
  }
}
