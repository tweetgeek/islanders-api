import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository.js';

/** Zapis zdarzeń potrzebny aplikacji i komendom CLI; wysyłka żyje osobno (OutboxDispatchModule). */
@Global()
@Module({ providers: [OutboxRepository], exports: [OutboxRepository] })
export class OutboxRepositoryModule {}
