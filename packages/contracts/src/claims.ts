import { z } from 'zod';

export const AUDIENCE = {
  worlds: 'islanders-worlds',
  tools: 'islanders-tools',
  internal: 'islanders-internal',
} as const;

export const ROLES = ['player', 'tester', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

const registeredClaims = {
  iss: z.url(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.uuid(),
};

export const worldsAccessClaimsSchema = z.object({
  ...registeredClaims,
  aud: z.literal(AUDIENCE.worlds),
  sub: z.uuid(),
  roles: z.array(roleSchema).min(1),
  nickname: z.string().min(3).max(20),
});
export type WorldsAccessClaims = z.infer<typeof worldsAccessClaimsSchema>;

export const toolsClaimsSchema = z.object({
  ...registeredClaims,
  aud: z.literal(AUDIENCE.tools),
  sub: z.uuid(),
  roles: z.array(roleSchema).min(1),
});
export type ToolsClaims = z.infer<typeof toolsClaimsSchema>;

const SERVICE_PREFIX = 'service:core:';

export const serviceClaimsSchema = z.object({
  ...registeredClaims,
  aud: z.literal(AUDIENCE.internal),
  sub: z.string().regex(/^service:core:[a-z0-9]+(-[a-z0-9]+)*$/),
});
export type ServiceClaims = z.infer<typeof serviceClaimsSchema>;

export function serviceSubject(slug: string): string {
  return `${SERVICE_PREFIX}${slug}`;
}

export function slugFromServiceSubject(sub: string): string {
  return sub.slice(SERVICE_PREFIX.length);
}
