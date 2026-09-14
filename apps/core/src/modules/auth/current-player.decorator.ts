import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

/** Identyfikator gracza z tokenu; dostępny wyłącznie za JwtAuthGuard. */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().playerId,
);
