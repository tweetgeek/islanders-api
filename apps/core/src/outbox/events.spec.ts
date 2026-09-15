import { worldEventSchema } from '@islanders/contracts';
import { playerJoinedWorldEvent, worldStatusChangedEvent } from './events.js';

describe('zdarzenia dla auth', () => {
  const at = new Date('2026-09-14T12:00:00.000Z');

  it('PlayerJoinedWorld spełnia kontrakt', () => {
    const e = playerJoinedWorldEvent('world-1', '00000000-0000-4000-8000-000000000001', at);
    expect(worldEventSchema.parse(e)).toMatchObject({
      type: 'PlayerJoinedWorld', worldSlug: 'world-1', joinedAt: at.toISOString(), occurredAt: at.toISOString(),
    });
  });

  it('WorldStatusChanged spełnia kontrakt, każde zdarzenie ma własny eventId', () => {
    const a = worldStatusChangedEvent('world-1', 'OPEN', at);
    const b = worldStatusChangedEvent('world-1', 'OPEN', at);
    expect(worldEventSchema.parse(a)).toMatchObject({ type: 'WorldStatusChanged', status: 'OPEN' });
    expect(a.eventId).not.toBe(b.eventId);
  });
});
