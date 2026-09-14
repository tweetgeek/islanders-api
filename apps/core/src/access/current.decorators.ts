import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ProfileRow } from '../modules/profiles/profiles.repository.js';
import type { WorldSettingsRow } from '../world/world-settings.repository.js';
import type { CoreRequest, PlayerPrincipal } from './player-request.js';

const request = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<CoreRequest>();

export const CurrentPlayer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlayerPrincipal => request(ctx).player!,
);
export const CurrentWorld = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorldSettingsRow => request(ctx).world!,
);
export const CurrentProfile = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ProfileRow => request(ctx).profile!,
);
