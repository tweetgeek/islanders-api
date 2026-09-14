import { generateServiceClient } from './generate-service-client.js';
import { ServiceClients, parseServiceClients } from './service-clients.js';

describe('klienci serwisowi', () => {
  it('wygenerowany klient uwierzytelnia się swoim sekretem i tylko nim', () => {
    const one = generateServiceClient('world-1');
    const two = generateServiceClient('world-2');
    const clients = new ServiceClients(parseServiceClients([one.entry, two.entry]));
    expect(clients.authenticate(one.clientId, one.secret)?.worldSlug).toBe('world-1');
    expect(clients.authenticate(one.clientId, two.secret)).toBeNull();
    expect(clients.authenticate('nieznany', one.secret)).toBeNull();
    expect(one.secret.length).toBeGreaterThanOrEqual(43);
    expect(one.entry.secretSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('odrzuca powtórzony clientId, zły slug i zły skrót', () => {
    const one = generateServiceClient('world-1');
    expect(() => parseServiceClients([one.entry, one.entry])).toThrow(/clientId/);
    expect(() => parseServiceClients([{ ...one.entry, worldSlug: 'World 1' }])).toThrow();
    expect(() => parseServiceClients([{ ...one.entry, secretSha256: 'abc' }])).toThrow();
  });
});
