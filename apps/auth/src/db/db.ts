import { DbModule } from '@islanders/platform';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export { DB, PG_CLIENT } from '@islanders/platform';

export type AuthDb = PostgresJsDatabase<typeof schema>;
/** Baza albo transakcja. */
export type AuthDbClient = AuthDb | Parameters<Parameters<AuthDb['transaction']>[0]>[0];

export const AuthDbModule = DbModule.forRoot(schema);
