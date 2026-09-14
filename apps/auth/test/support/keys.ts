import { generateSigningKeyEntry } from '../../src/keys/generate-signing-key.js';
import type { SigningKeyEntry } from '../../src/keys/signing-keys.js';

/** Generowane raz na proces testów; `other` służy do testów rotacji. */
export const testSigningKeys = {
  active: await generateSigningKeyEntry(new Date('2026-09-01T00:00:00Z')),
  other: await generateSigningKeyEntry(new Date('2026-09-02T00:00:00Z')),
};

export function keysEnv(...entries: SigningKeyEntry[]): string {
  return JSON.stringify(entries);
}
