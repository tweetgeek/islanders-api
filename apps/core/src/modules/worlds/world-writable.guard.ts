import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { WorldRequest } from './profile.guard.js';

/** Zapisy tylko na OPEN i CLOSED; ENDED jest do odczytu. Zakładać po ProfileGuard: @UseGuards(ProfileGuard, WorldWritableGuard). */
@Injectable()
export class WorldWritableGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Partial<WorldRequest>>();
    if (!req.world) {
      throw new Error('WorldWritableGuard wymaga ProfileGuard przed sobą');
    }
    if (req.world.status === 'ENDED') {
      throw new ConflictException(
        'Runda zakończona, świat jest tylko do odczytu',
      );
    }
    return true;
  }
}
