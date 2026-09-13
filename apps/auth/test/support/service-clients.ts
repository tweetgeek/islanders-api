import { createHash } from 'node:crypto';

function client(worldSlug: string) {
  const clientId = `core-${worldSlug}`;
  const secret = `sekret-testowy-${worldSlug}-0123456789abcdefghij`;
  return {
    clientId,
    secret,
    entry: { clientId, secretSha256: createHash('sha256').update(secret).digest('hex'), worldSlug },
  };
}

export const testServiceClients = {
  world1: client('world-1'),
  world2: client('world-2'),
  world2Test: client('world-2-test'),
  // world-9: żaden test nie wolno mu zarejestrować w rejestrze — zadanie 10 używa go
  // do przypadku „świat nieznany rejestrowi → 409". Vitest nie gwarantuje kolejności
  // plików e2e i wszystkie pliki dzielą jedną bazę.
  unregistered: client('world-9'),
};

export function serviceClientsEnv(): string {
  return JSON.stringify(Object.values(testServiceClients).map((c) => c.entry));
}
