import { existsSync } from 'node:fs';
import { parseEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
await runMigrations(env.DATABASE_URL);
console.log('Migracje zastosowane.');
