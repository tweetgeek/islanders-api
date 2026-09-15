import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { CliModule } from '../src/cli/cli.module.js';
import { WorldAlreadyInitializedError, WorldInitService } from '../src/world/world-init.service.js';
import { StatusChangeRejectedError, WorldStatusService } from '../src/world/world-status.service.js';
import { outbox, profiles } from '../src/infra/db/schema/index.js';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { createTestDatabase } from './support/test-db.js';

describe('world:init i zmiany statusu (e2e)', () => {
  let ctx: INestApplicationContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CliModule.forRoot({ DATABASE_URL: await createTestDatabase() })],
    }).compile();
    ctx = await moduleRef.init();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const input = { slug: 'world-cli', name: 'Świat CLI', seed: 42, width: 120, height: 80, windX: 0, windY: 0, isTest: false };

  it('init zakłada świat DRAFT; drugi init to błąd; zły slug i wymiary odrzucone', async () => {
    const init = ctx.get(WorldInitService);
    await expect(init.init({ ...input, slug: 'World CLI' })).rejects.toThrow(/slug/);
    await expect(init.init({ ...input, width: 0 })).rejects.toThrow(/width/);
    await expect(init.init({ ...input, seed: 2 ** 31 })).rejects.toThrow(/seed/);
    await expect(init.init({ ...input, name: '' })).rejects.toThrow(/name/);
    await expect(init.init({ ...input, name: 'x'.repeat(65) })).rejects.toThrow(/name/);
    await expect(init.init(input)).resolves.toMatchObject({ slug: 'world-cli', status: 'DRAFT' });
    await expect(init.init(input)).rejects.toBeInstanceOf(WorldAlreadyInitializedError);
  });

  it('naturalne przejścia bez --force, inne tylko z --force, DRAFT przy profilach zablokowany', async () => {
    const status = ctx.get(WorldStatusService);
    await expect(status.change('OPEN', { force: false })).resolves.toEqual({
      slug: 'world-cli',
      from: 'DRAFT',
      to: 'OPEN',
      forced: false,
    });
    const rows = await ctx.get<Db>(DB).select().from(outbox);
    expect(rows.map((r) => r.payload)).toContainEqual(
      expect.objectContaining({ type: 'WorldStatusChanged', status: 'OPEN', worldSlug: 'world-cli' }),
    );
    await expect(status.change('OPEN', { force: true })).rejects.toMatchObject({ reason: 'SAME_STATUS' });
    expect(await ctx.get<Db>(DB).select().from(outbox)).toHaveLength(rows.length);
    await expect(status.change('ENDED', { force: false })).rejects.toBeInstanceOf(StatusChangeRejectedError);
    await expect(status.change('CLOSED', { force: false })).resolves.toMatchObject({ to: 'CLOSED', forced: false });
    await expect(status.change('OPEN', { force: true })).resolves.toMatchObject({ to: 'OPEN', forced: true });
    await ctx.get<Db>(DB).insert(profiles).values({ playerId: '00000000-0000-4000-8000-0000000000aa', nickname: 'ktos' });
    await expect(status.change('DRAFT', { force: true })).rejects.toMatchObject({ reason: 'DRAFT_WITH_PROFILES' });
  });
});
