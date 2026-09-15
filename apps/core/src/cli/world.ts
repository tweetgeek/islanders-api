import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import type { WorldStatus } from '@islanders/contracts';
import { OutboxRepository } from '../outbox/outbox.repository.js';
import { WorldInitService } from '../world/world-init.service.js';
import { WorldSettingsRepository } from '../world/world-settings.repository.js';
import { WorldStatusService } from '../world/world-status.service.js';
import { CliModule } from './cli.module.js';

const USAGE = `Użycie:
  npm run world:init -w apps/core -- --slug <s> --name <n> --seed <int> --width <int> --height <int> [--wind x,y] [--test]
  npm run world:open|world:close|world:end -w apps/core -- [--force]
  npm run world:status -w apps/core`;

const TARGETS: Record<string, WorldStatus> = { open: 'OPEN', close: 'CLOSED', end: 'ENDED' };

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    seed: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    wind: { type: 'string', default: '0,0' },
    test: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const databaseUrl = z.string().regex(/^postgres(ql)?:\/\//).safeParse(process.env.DATABASE_URL);
if (!databaseUrl.success || !['init', 'open', 'close', 'end', 'status'].includes(command ?? '')) {
  console.error(databaseUrl.success ? USAGE : 'Brak poprawnego DATABASE_URL');
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(CliModule.forRoot({ DATABASE_URL: databaseUrl.data }), {
  logger: ['error', 'warn'],
});
try {
  if (command === 'init') {
    const [windX, windY] = values.wind!.split(',').map(Number);
    const world = await app.get(WorldInitService).init({
      slug: values.slug ?? '',
      name: values.name ?? '',
      seed: Number(values.seed),
      width: Number(values.width),
      height: Number(values.height),
      windX,
      windY,
      isTest: values.test ?? false,
    });
    console.log(`Świat ${world.slug} założony w statusie ${world.status}.`);
  } else if (command === 'status') {
    const world = await app.get(WorldSettingsRepository).get();
    console.log(JSON.stringify(world, null, 2));
    const stats = await app.get(OutboxRepository).stats();
    console.log(`Outbox: ${stats.pending} niewysłanych, najstarsze: ${stats.oldestPendingAt?.toISOString() ?? '—'}`);
  } else {
    const result = await app.get(WorldStatusService).change(TARGETS[command!], { force: values.force ?? false });
    if (result.forced) {
      console.warn(`UWAGA: wymuszone przejście ${result.slug}: ${result.from} → ${result.to}.`);
    }
    console.log(`Świat ${result.slug}: ${result.from} → ${result.to}.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await app.close();
}
