import { parseArgs } from 'node:util';
import type { Role } from '@islanders/contracts';
import { PlayersAdmin } from '../players/players-admin.js';
import { withCliContext } from './cli-context.js';

const USAGE = `Użycie:
  npm run player:roles -w apps/auth -- --email <e> [--add <rola>]... [--remove <rola>]...
  npm run player:set-password -w apps/auth -- --email <e>     (hasło ze stdin)
  npm run player:disable -w apps/auth -- --email <e>
  npm run player:enable -w apps/auth -- --email <e>`;

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    email: { type: 'string' },
    add: { type: 'string', multiple: true, default: [] },
    remove: { type: 'string', multiple: true, default: [] },
  },
});

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

if (!values.email || !['roles', 'set-password', 'disable', 'enable'].includes(command ?? '')) {
  console.error(USAGE);
  process.exit(2);
}
const email = values.email;

try {
  await withCliContext(async (app) => {
    const admin = app.get(PlayersAdmin);
    switch (command) {
      case 'roles':
        console.log(`Role: ${(await admin.changeRoles(email, values.add as Role[], values.remove as Role[])).join(', ')}`);
        break;
      case 'set-password':
        await admin.setPassword(email, await readStdin());
        console.log('Hasło zmienione, sesje unieważnione.');
        break;
      case 'disable':
        await admin.disable(email);
        console.log('Konto zablokowane, sesje unieważnione.');
        break;
      case 'enable':
        await admin.enable(email);
        console.log('Konto odblokowane.');
        break;
    }
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
