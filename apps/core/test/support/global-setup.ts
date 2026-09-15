import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '@islanders/platform';

const TEMPLATE_DATABASE = 'core_template';

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

/**
 * Core obsługuje jeden świat na bazę, więc każda aplikacja testowa dostaje własną bazę.
 * Migracje biegną raz, na bazie-szablonie; kolejne bazy powstają przez `CREATE DATABASE … TEMPLATE`.
 */
export async function setup(project: TestProject): Promise<void> {
  pg = await new PostgreSqlContainer('postgres:17-alpine').start();
  const adminUrl = pg.getConnectionUri();
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE_DATABASE}"`);
  } finally {
    await admin.end();
  }
  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DATABASE}`;
  await runMigrations(templateUrl.toString(), path.resolve(process.cwd(), 'drizzle'));
  project.provide('pgAdminUrl', adminUrl);
  project.provide('templateDatabase', TEMPLATE_DATABASE);

  redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await pg?.stop();
  await redis?.stop();
}
