import { parseArgs } from 'node:util';
import { generateServiceClient } from '../service-clients/generate-service-client.js';

const { values } = parseArgs({ options: { world: { type: 'string' } } });
if (!values.world) {
  console.error('Użycie: npm run client:create -w apps/auth -- --world <slug>');
  process.exit(2);
}
try {
  const { clientId, secret, entry } = generateServiceClient(values.world);
  console.log(
    [
      `Core świata ${entry.worldSlug}: AUTH_CLIENT_ID=${clientId}`,
      `Core świata ${entry.worldSlug}: AUTH_CLIENT_SECRET=${secret}   (wyświetlany tylko teraz)`,
      '',
      'Wpis do SERVICE_CLIENTS w auth:',
      JSON.stringify(entry),
    ].join('\n'),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
