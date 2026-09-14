import { randomUUID } from 'node:crypto';
import type { WorldEvent, WorldStatus } from '@islanders/contracts';

export function playerJoinedWorldEvent(slug: string, playerId: string, joinedAt: Date): WorldEvent {
  return {
    type: 'PlayerJoinedWorld',
    eventId: randomUUID(),
    worldSlug: slug,
    occurredAt: joinedAt.toISOString(),
    playerId,
    joinedAt: joinedAt.toISOString(),
  };
}

export function worldStatusChangedEvent(slug: string, status: WorldStatus, at: Date): WorldEvent {
  return {
    type: 'WorldStatusChanged',
    eventId: randomUUID(),
    worldSlug: slug,
    occurredAt: at.toISOString(),
    status,
  };
}
