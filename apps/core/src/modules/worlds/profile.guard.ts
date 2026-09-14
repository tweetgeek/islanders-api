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
    // Tylko zapis czysto dziesiętny. `Number()` przepuszcza `0x10` i `1e3`, więc
    // `/worlds/0x10/state` rozwiązywałoby się na świat 16, podczas gdy `join` z
    // `ParseIntPipe` te same zapisy odrzuca — ten sam parametr tego samego zasobu
    // rozumiany dwojako. `isSafeInteger` odcina zapisy dłuższe niż zakres liczby.
    // `req.params` w Express 5 typuje wartość jako `string | string[]`.
    const raw = req.params.id;
    const worldId =
      typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(worldId) || worldId <= 0) {
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
