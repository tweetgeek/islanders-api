import { Module } from '@nestjs/common';
import { ProfileGuard } from './profile.guard.js';
import { ProfilesRepository } from './profiles.repository.js';

/** Wydzielony moduł profili rozcina dawny cykl WorldsModule ⇄ SettlementsModule (spec A §15.2). */
@Module({
  providers: [ProfilesRepository, ProfileGuard],
  exports: [ProfilesRepository, ProfileGuard],
})
export class ProfilesModule {}
