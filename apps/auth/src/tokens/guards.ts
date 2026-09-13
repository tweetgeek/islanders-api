import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { slugFromServiceSubject, type Role } from '@islanders/contracts';
import { TokenVerifier } from './token-verifier.js';

export interface PlayerPrincipal {
  id: string;
  roles: Role[];
}

interface AuthRequest {
  headers: { authorization?: string };
  player?: PlayerPrincipal;
  serviceWorldSlug?: string;
  rateLimitSubject?: string;
}

function bearerToken(req: AuthRequest): string {
  // RFC 7235: schemat uwierzytelnienia jest nieczuły na wielkość znaków.
  const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) throw new UnauthorizedException('Brak tokenu');
  return token;
}

/** Token gracza (`aud: islanders-worlds`). Stawiać PRZED RateLimitGuard w `@UseGuards`. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const claims = await this.verifier.verify(bearerToken(req), 'worlds');
    req.player = { id: claims.sub, roles: claims.roles };
    req.rateLimitSubject = `player:${claims.sub}`;
    return true;
  }
}

/** Token serwisowy świata (`aud: islanders-internal`). */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const claims = await this.verifier.verify(bearerToken(req), 'internal');
    req.serviceWorldSlug = slugFromServiceSubject(claims.sub);
    return true;
  }
}

export const CurrentPlayer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlayerPrincipal =>
    ctx.switchToHttp().getRequest<AuthRequest>().player!,
);

export const CurrentServiceWorld = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AuthRequest>().serviceWorldSlug!,
);
