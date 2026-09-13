import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { WorldEvent } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, DB, isForeignKeyViolation } from '@islanders/platform';
import type { AuthDb, AuthDbClient } from '../db/db.js';
import { processedEvents, profiles } from '../db/schema/index.js';
import { WorldsRepository } from '../worlds/worlds.repository.js';

/** Punkt zapisu wewnątrz transakcji zdarzenia — błąd klucza obcego cofa tylko zastosowanie, nie wpis o przetworzeniu. */
class UnknownPlayer extends Error {}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly worlds: WorldsRepository,
    @Inject(DB) private readonly db: AuthDb,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Co najmniej raz, w kolejności nadania. Każde zdarzenie w osobnej transakcji razem z wpisem
   * w `processed_events`, więc powtórzona partia pomija już zastosowane zdarzenia.
   */
  async ingest(
    serviceWorld: string,
    events: WorldEvent[],
  ): Promise<{ accepted: number; duplicates: number }> {
    if (events.some((e) => e.worldSlug !== serviceWorld)) {
      throw new ForbiddenException('Partia zawiera zdarzenia innego świata');
    }
    if (!(await this.worlds.find(serviceWorld))) {
      throw new ConflictException('Świat nie jest zgłoszony w rejestrze');
    }
    let accepted = 0;
    let duplicates = 0;
    for (const event of events) {
      const applied = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(processedEvents)
          .values({
            eventId: event.eventId,
            worldSlug: event.worldSlug,
            type: event.type,
            receivedAt: this.clock.now(),
          })
          .onConflictDoNothing()
          .returning({ eventId: processedEvents.eventId });
        if (inserted.length === 0) return false;
        try {
          await tx.transaction((sp) => this.apply(sp, event));
        } catch (err) {
          if (!(err instanceof UnknownPlayer)) throw err;
          this.logger.warn(
            `Zdarzenie ${event.eventId} (${event.type}) dotyczy nieznanego konta, pominięte`,
          );
        }
        return true;
      });
      if (applied) accepted += 1;
      else duplicates += 1;
    }
    return { accepted, duplicates };
  }

  private async apply(tx: AuthDbClient, event: WorldEvent): Promise<void> {
    switch (event.type) {
      case 'WorldStatusChanged':
        await this.worlds.setStatus(
          tx,
          event.worldSlug,
          event.status,
          this.clock.now(),
        );
        return;
      case 'PlayerJoinedWorld':
        try {
          await tx
            .insert(profiles)
            .values({
              playerId: event.playerId,
              worldSlug: event.worldSlug,
              joinedAt: new Date(event.joinedAt),
            })
            .onConflictDoUpdate({
              target: [profiles.playerId, profiles.worldSlug],
              set: { joinedAt: new Date(event.joinedAt) },
            });
        } catch (err) {
          if (isForeignKeyViolation(err)) throw new UnknownPlayer();
          throw err;
        }
        return;
    }
  }
}
