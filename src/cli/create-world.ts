import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { parseEnv } from '../infra/config/env.js';
import { WorldsService } from '../modules/worlds/worlds.service.js';

const { values } = parseArgs({
  options: {
    seed: { type: 'string' },
    width: { type: 'string', default: '200' },
    height: { type: 'string', default: '200' },
    wind: { type: 'string', default: '0,0' },
  },
});

if (values.seed === undefined) {
  console.error(
    'Użycie: npm run world:create -- --seed 1337 [--width 200] [--height 200] [--wind 0.3,-0.1]',
  );
  process.exit(2);
}
const [windX, windY] = values.wind.split(',').map(Number);
if (!Number.isFinite(windX) || !Number.isFinite(windY)) {
  console.error(
    '--wind oczekuje dwóch liczb rozdzielonych przecinkiem, np. 0.3,-0.1',
  );
  process.exit(2);
}

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
const context = await NestFactory.createApplicationContext(
  AppModule.forRoot(env),
  { logger: ['error'] },
);
try {
  const world = await context.get(WorldsService).create({
    seed: Number(values.seed),
    width: Number(values.width),
    height: Number(values.height),
    windX,
    windY,
  });
  console.log(
    `Utworzono świat id=${world.id} seed=${world.seed} ${world.width}x${world.height} wiatr=(${world.windX}, ${world.windY})`,
  );
} finally {
  await context.close();
}
