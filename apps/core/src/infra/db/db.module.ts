import { DbModule as PlatformDbModule } from '@islanders/platform';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export { DB, PG_CLIENT } from '@islanders/platform';

export type Db = PostgresJsDatabase<typeof schema>;
/** Baza albo transakcja — repozytoria przyjmują oba, żeby dało się je składać w jedną transakcję. */
export type DbClient = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export const DbModule = PlatformDbModule.forRoot(schema);
