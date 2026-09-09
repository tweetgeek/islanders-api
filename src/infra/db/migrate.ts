import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Uruchamia migracje z katalogu `drizzle/` na wskazanej bazie i zamyka połączenie. */
export async function runMigrations(
  url: string,
  migrationsFolder: string = path.resolve(process.cwd(), 'drizzle'),
): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
