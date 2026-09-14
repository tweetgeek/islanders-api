import { createServer } from 'node:http';
import { closeServer, InternalHttpServer } from './internal-listener.js';

describe('closeServer', () => {
  it('toleruje podwójne zamknięcie tego samego serwera', async () => {
    const server = createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    await expect(closeServer(server)).resolves.toBeUndefined();
    // Drugie zamknięcie (np. przez test-app.ts po tym, jak Nest już zamknął serwer w cyklu życia
    // aplikacji) nie może rzucić — musi się rozwiązać, tak jak przy pierwszym zamknięciu.
    await expect(closeServer(server)).resolves.toBeUndefined();
  });
});

describe('InternalHttpServer', () => {
  it('bez podpiętego serwera beforeApplicationShutdown jest no-opem', async () => {
    const hook = new InternalHttpServer();
    await expect(hook.beforeApplicationShutdown()).resolves.toBeUndefined();
  });

  it('zamyka podpięty serwer w beforeApplicationShutdown', async () => {
    const server = createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const hook = new InternalHttpServer();
    hook.attach(server);
    await hook.beforeApplicationShutdown();
    expect(server.listening).toBe(false);
  });
});
