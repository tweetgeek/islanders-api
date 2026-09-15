import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import type { CoreRequest } from '../access/player-request.js';

/** Zapisy tylko na OPEN i CLOSED; DRAFT jest niegotowy, ENDED tylko do odczytu. Zakładać po ProfileGuard. */
@Injectable()
export class WorldWritableGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<CoreRequest>();
    if (!req.world) {
      throw new Error('WorldWritableGuard wymaga PlayerTokenGuard i ProfileGuard przed sobą');
    }
    if (req.world.status === 'ENDED') {
      throw new ConflictException('Runda zakończona, świat jest tylko do odczytu');
    }
    if (req.world.status === 'DRAFT') {
      throw new ConflictException('Świat jest jeszcze przygotowywany');
    }
    return true;
  }
}
