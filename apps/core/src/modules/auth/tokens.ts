import { createHash, randomBytes } from 'node:crypto';

/** Zrotowany token jest akceptowany jeszcze przez 60 s, bo na telefonie odpowiedź z nową parą regularnie ginie. */
export const REFRESH_GRACE_MS = 60_000;

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** W bazie leży wyłącznie ten hasz; sam token widzi tylko klient. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
