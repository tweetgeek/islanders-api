import { existsSync } from 'node:fs';
import { z } from 'zod';
import { runMigrations } from './migrate.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const url = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL musi zaczynać się od postgres://')
  .parse(process.env.DATABASE_URL);
await runMigrations(url);
console.log('Migracje core zastosowane.');
