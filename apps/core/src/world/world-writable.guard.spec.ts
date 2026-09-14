import { ConflictException, ExecutionContext } from '@nestjs/common';
import { WorldWritableGuard } from './world-writable.guard.js';

function contextWithWorld(status: string | undefined): ExecutionContext {
  const req = status === undefined ? {} : { world: { status } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('WorldWritableGuard', () => {
  const guard = new WorldWritableGuard();

  it('przepuszcza OPEN i CLOSED', () => {
    expect(guard.canActivate(contextWithWorld('OPEN'))).toBe(true);
    expect(guard.canActivate(contextWithWorld('CLOSED'))).toBe(true);
  });

  it('DRAFT i ENDED -> 409', () => {
    expect(() => guard.canActivate(contextWithWorld('ENDED'))).toThrow(ConflictException);
    expect(() => guard.canActivate(contextWithWorld('DRAFT'))).toThrow(ConflictException);
  });

  it('bez strażników przed sobą zgłasza błąd programisty, nie 409', () => {
    expect(() => guard.canActivate(contextWithWorld(undefined))).toThrow(/PlayerTokenGuard/);
  });
});
