import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { ENV } from '../config/config.module.js';

export const DB = Symbol('DB');
export const PG_CLIENT = Symbol('PG_CLIENT');

@Injectable()
class DbShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({})
export class DbModule {
  /** Schemat podaje aplikacja; typ `Db` definiuje aplikacja jako `PostgresJsDatabase<typeof schema>`. */
  static forRoot(schema: Record<string, unknown>): DynamicModule {
    return {
      module: DbModule,
      providers: [
        {
          provide: PG_CLIENT,
          inject: [ENV],
          useFactory: (env: { DATABASE_URL: string }): Sql =>
            postgres(env.DATABASE_URL, { max: 10 }),
        },
        {
          provide: DB,
          inject: [PG_CLIENT],
          useFactory: (client: Sql) => drizzle(client, { schema }),
        },
        DbShutdown,
      ],
      exports: [DB, PG_CLIENT],
    };
  }
}
