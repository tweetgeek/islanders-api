import type { Request } from 'express';
import type { Role } from '@islanders/contracts';
import type { ProfileRow } from '../modules/profiles/profiles.repository.js';
import type { WorldSettingsRow } from '../world/world-settings.repository.js';

export interface PlayerPrincipal {
  id: string;
  roles: Role[];
  nickname: string;
}

export interface CoreRequest extends Request {
  player?: PlayerPrincipal;
  world?: WorldSettingsRow;
  profile?: ProfileRow;
  rateLimitSubject?: string;
}
