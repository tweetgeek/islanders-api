import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import * as schema from './schema/index.js';

export const DB = Symbol('DB');
export const PG_CLIENT = Symbol('PG_CLIENT');

export type Db = PostgresJsDatabase<typeof schema>;
/** Baza albo transakcja — repozytoria przyjmują oba, żeby dało się je składać w jedną transakcję. */
export type DbClient = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

@Injectable()
class DbShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): Sql => postgres(env.DATABASE_URL, { max: 10 }),
    },
    {
      provide: DB,
      inject: [PG_CLIENT],
      useFactory: (client: Sql): Db => drizzle(client, { schema }),
    },
    DbShutdown,
  ],
  exports: [DB, PG_CLIENT],
})
export class DbModule {}
