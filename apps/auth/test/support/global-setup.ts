import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '@islanders/platform';

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  postgres = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = postgres.getConnectionUri();
  project.provide('databaseUrl', url);
  await runMigrations(url, path.resolve(process.cwd(), 'drizzle'));

  redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await postgres?.stop();
  await redis?.stop();
}
