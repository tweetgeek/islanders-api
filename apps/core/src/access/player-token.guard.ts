import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Role } from '@islanders/contracts';
import { INTERNAL_REQUEST } from '@islanders/platform';
import { WorldSettingsRepository } from '../world/world-settings.repository.js';
import type { CoreRequest } from './player-request.js';
import { TokenVerifier } from './token-verifier.js';

const PRIVILEGED: Role[] = ['tester', 'admin'];

/**
 * Globalny strażnik tras gracza. Żądania portu wewnętrznego pomija — tam obowiązuje ToolsTokenGuard.
 * DRAFT jest niewidoczny dla graczy poza testerami (404), świat testowy wymaga roli testera (403).
 */
@Injectable()
export class PlayerTokenGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly worlds: WorldSettingsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CoreRequest>();
    if ((req as unknown as Record<symbol, unknown>)[INTERNAL_REQUEST] === true) return true;
    // RFC 7235: schemat uwierzytelnienia jest nieczuły na wielkość znaków.
    const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Brak tokenu');
    const claims = await this.verifier.verify(token, 'worlds');
    const world = await this.worlds.get();
    const privileged = claims.roles.some((r) => PRIVILEGED.includes(r));
    if (world.status === 'DRAFT' && !privileged) {
      throw new NotFoundException('Świat nie istnieje');
    }
    if (world.isTest && !privileged) {
      throw new ForbiddenException('Świat testowy jest dostępny tylko dla testerów');
    }
    req.player = { id: claims.sub, roles: claims.roles, nickname: claims.nickname };
    req.world = world;
    req.rateLimitSubject = `player:${claims.sub}`;
    return true;
  }
}
