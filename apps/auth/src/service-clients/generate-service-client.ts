import { createHash, randomBytes } from 'node:crypto';
import { worldSlugSchema } from '@islanders/contracts';
import type { ServiceClientEntry } from './service-clients.js';

export function generateServiceClient(worldSlug: string): {
  clientId: string;
  secret: string;
  entry: ServiceClientEntry;
} {
  const slug = worldSlugSchema.parse(worldSlug);
  const clientId = `core-${slug}`;
  const secret = randomBytes(32).toString('base64url');
  const secretSha256 = createHash('sha256').update(secret).digest('hex');
  return { clientId, secret, entry: { clientId, secretSha256, worldSlug: slug } };
}
