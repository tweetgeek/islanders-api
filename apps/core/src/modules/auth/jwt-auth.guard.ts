import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';

export interface AuthenticatedRequest extends Request {
  playerId: number;
  rateLimitSubject?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // RFC 7235: schemat uwierzytelnienia jest nieczuły na wielkość znaków.
    const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedException('Brak tokenu');
    }
    let payload: { sub?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
    } catch {
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
    // Bez tego token bez `sub` dałby `Number(undefined)`, czyli NaN, i przeszedłby dalej
    // jako identyfikator gracza. Identyfikatory to dodatnie liczby całkowite (serial).
    const playerId = Number(payload.sub);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) {
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
    req.playerId = playerId;
    req.rateLimitSubject = String(playerId);
    return true;
  }
}
