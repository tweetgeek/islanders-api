import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { JWK } from 'jose';
import { testKeys } from './tokens.js';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

export type FakeRoute = (req: RecordedRequest, res: ServerResponse) => boolean;

export interface FakeAuth {
  url: string;
  requests: RecordedRequest[];
  setJwks(jwks: { keys: JWK[] }): void;
  addRoute(route: FakeRoute): void;
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : undefined);
      } catch {
        resolve(text);
      }
    });
  });
}

/** Lokalny serwer udający usługę auth: JWKS oraz trasy dokładane przez testy (`addRoute`). */
export async function startFakeAuth(options: { jwks?: { keys: JWK[] } } = {}): Promise<FakeAuth> {
  let jwks = options.jwks ?? { keys: [testKeys.publicJwk] };
  const routes: FakeRoute[] = [];
  const requests: RecordedRequest[] = [];
  let port = 0;
  let server: Server | undefined;

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const recorded: RecordedRequest = {
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: req.headers,
      body: await readBody(req),
    };
    requests.push(recorded);
    if (recorded.method === 'GET' && recorded.path === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(jwks));
      return;
    }
    for (const route of routes) {
      if (route(recorded, res)) return;
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"statusCode":404}');
  };

  const listen = () =>
    new Promise<void>((resolve, reject) => {
      server = createServer((req, res) => void handler(req, res));
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        port = (server!.address() as AddressInfo).port;
        resolve();
      });
    });
  const shutdown = () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.closeAllConnections();
      server.close(() => resolve());
      server = undefined;
    });

  await listen();
  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    requests,
    setJwks: (next) => {
      jwks = next;
    },
    addRoute: (route) => routes.push(route),
    stop: shutdown,
    start: listen,
    close: shutdown,
  };
}
