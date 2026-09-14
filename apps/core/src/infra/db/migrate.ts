import path from 'node:path';
import { runMigrations as run } from '@islanders/platform';

/** Migracje core leżą w `apps/core/drizzle`; skrypty i testy uruchamiają się z `apps/core`. */
export function runMigrations(
  url: string,
  migrationsFolder: string = path.resolve(process.cwd(), 'drizzle'),
): Promise<void> {
  return run(url, migrationsFolder);
}
