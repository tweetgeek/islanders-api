import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/infra/db/migrate.js';

let container: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

/**
 * Jeden kontener Postgresa i jeden kontener Redisa na cały przebieg e2e; adresy trafiają
 * do testów przez inject('databaseUrl') i inject('redisUrl').
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  project.provide('databaseUrl', url);
  process.env.DATABASE_URL = url;
  await runMigrations(url);

  redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await container?.stop();
  await redis?.stop();
}
