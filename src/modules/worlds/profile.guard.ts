import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ProfilesRepository, type ProfileRow } from './profiles.repository.js';
import { WorldsRepository, type WorldRow } from './worlds.repository.js';

export interface WorldRequest extends AuthenticatedRequest {
  world: WorldRow;
  profile: ProfileRow;
}

/** Wymaga profilu gracza na świecie z `:id`. Nie sprawdza statusu świata — odczyt działa na każdym. */
@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(
    private readonly worlds: WorldsRepository,
    private readonly profiles: ProfilesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorldRequest>();
    const worldId = Number(req.params.id);
    if (!Number.isInteger(worldId) || worldId <= 0) {
      throw new NotFoundException('Świat nie istnieje');
    }
    const world = await this.worlds.findById(worldId);
    if (!world) {
      throw new NotFoundException('Świat nie istnieje');
    }
    const profile = await this.profiles.find(worldId, req.playerId);
    if (!profile) {
      throw new ForbiddenException('Nie masz profilu na tym świecie');
    }
    req.world = world;
    req.profile = profile;
    return true;
  }
}
