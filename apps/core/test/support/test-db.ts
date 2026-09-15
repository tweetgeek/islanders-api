import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';

/** Nowa, zmigrowana baza sklonowana z szablonu; zwraca jej URL. Pliki e2e biegną sekwencyjnie. */
export async function createTestDatabase(): Promise<string> {
  const adminUrl = inject('pgAdminUrl');
  const name = `core_${randomUUID().replace(/-/g, '')}`;
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${inject('templateDatabase')}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
