import { z } from 'zod';
import { worldSlugSchema } from './slug.js';
import { worldStatusSchema } from './worlds.js';

export const MAX_EVENT_BATCH = 100;

const eventBase = {
  eventId: z.uuid(),
  worldSlug: worldSlugSchema,
  occurredAt: z.iso.datetime(),
};

export const worldStatusChangedSchema = z.object({
  ...eventBase,
  type: z.literal('WorldStatusChanged'),
  status: worldStatusSchema,
});

export const playerJoinedWorldSchema = z.object({
  ...eventBase,
  type: z.literal('PlayerJoinedWorld'),
  playerId: z.uuid(),
  joinedAt: z.iso.datetime(),
});

export const worldEventSchema = z.discriminatedUnion('type', [
  worldStatusChangedSchema,
  playerJoinedWorldSchema,
]);
export type WorldEvent = z.infer<typeof worldEventSchema>;

export const eventBatchSchema = z.object({
  events: z.array(worldEventSchema).min(1).max(MAX_EVENT_BATCH),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;
