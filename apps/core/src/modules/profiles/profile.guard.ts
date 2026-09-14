import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { CoreRequest } from '../../access/player-request.js';
import { ProfilesRepository } from './profiles.repository.js';

/** Wymaga profilu gracza na tym świecie. Nie sprawdza statusu — odczyt działa na każdym widocznym świecie. */
@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(private readonly profiles: ProfilesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CoreRequest>();
    if (!req.player) {
      throw new Error('ProfileGuard wymaga PlayerTokenGuard przed sobą');
    }
    const profile = await this.profiles.find(req.player.id);
    if (!profile) {
      throw new ForbiddenException('Nie masz profilu na tym świecie');
    }
    req.profile = profile;
    return true;
  }
}
