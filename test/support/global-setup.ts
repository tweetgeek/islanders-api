import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/infra/db/migrate.js';

let container: StartedPostgreSqlContainer | undefined;

/** Jeden kontener Postgresa na cały przebieg e2e; adres trafia do testów przez inject('databaseUrl'). */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  project.provide('databaseUrl', url);
  process.env.DATABASE_URL = url;
  await runMigrations(url);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
