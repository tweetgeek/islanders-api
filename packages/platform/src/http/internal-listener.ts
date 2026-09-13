import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
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

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
