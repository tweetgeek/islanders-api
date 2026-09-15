import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TokenVerifier } from './token-verifier.js';

/** API admina: token panelu (`aud: islanders-tools`) z rolą `admin`. */
@Injectable()
export class ToolsTokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Brak tokenu');
    const claims = await this.verifier.verify(token, 'tools');
    if (!claims.roles.includes('admin')) {
      throw new ForbiddenException('Wymagana rola admin');
    }
    return true;
  }
}
