import { existsSync } from 'node:fs';
import path from 'node:path';
import { runMigrations } from '@islanders/platform';
import { parseAuthEnv } from '../config/env.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseAuthEnv(process.env);
await runMigrations(env.DATABASE_URL, path.resolve(process.cwd(), 'drizzle'));
console.log('Migracje auth zastosowane.');
