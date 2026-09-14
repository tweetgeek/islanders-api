import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Injectable, type BeforeApplicationShutdown, type INestApplication } from '@nestjs/common';
import { INTERNAL_REQUEST } from './port-scope.js';

/** Drugi serwer HTTP na tej samej instancji Express; wywołać po `app.listen`. */
export async function listenInternal(
  app: INestApplication,
  port: number,
  host?: string,
): Promise<Server> {
  const handler = app.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;
  const server = createServer((req, res) => {
    (req as unknown as Record<symbol, unknown>)[INTERNAL_REQUEST] = true;
    handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

/**
 * Zamyka serwer. Toleruje wywołanie na serwerze już zamkniętym (kod błędu `ERR_SERVER_NOT_RUNNING`)
 * i po prostu się rozwiązuje — dzięki temu `InternalHttpServer.beforeApplicationShutdown` i
 * ręczne zamknięcie w testach e2e mogą zamknąć ten sam serwer, nie wywracając się na wyścigu.
 */
export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => {
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(err);
        return;
      }
      resolve();
    }),
  );
}

/**
 * Trzyma referencję do drugiego serwera HTTP (wewnętrznego) i zamyka go w cyklu życia Nest —
 * w `beforeApplicationShutdown`, czyli zanim providery (DB, Redis) zamkną się w
 * `onApplicationShutdown`. Referencję ustawia się po `listenInternal` (main.ts, testy e2e);
 * bez wywołania `attach` hook jest no-opem.
 */
@Injectable()
export class InternalHttpServer implements BeforeApplicationShutdown {
  private server?: Server;

  attach(server: Server): void {
    this.server = server;
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.server) {
      await closeServer(this.server);
    }
  }
}
