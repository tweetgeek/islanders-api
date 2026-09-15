import { isNaturalTransition, planStatusChange } from './world-status.js';

describe('przejścia statusu świata', () => {
  it('naturalny porządek nie wymaga --force', () => {
    expect(planStatusChange({ from: 'DRAFT', to: 'OPEN', force: false, profileCount: 0 })).toEqual({ ok: true, forced: false });
    expect(planStatusChange({ from: 'OPEN', to: 'CLOSED', force: false, profileCount: 5 })).toEqual({ ok: true, forced: false });
    expect(planStatusChange({ from: 'CLOSED', to: 'ENDED', force: false, profileCount: 5 })).toEqual({ ok: true, forced: false });
    expect(isNaturalTransition('DRAFT', 'CLOSED')).toBe(false);
  });

  it('każde inne przejście wymaga --force', () => {
    expect(planStatusChange({ from: 'CLOSED', to: 'OPEN', force: false, profileCount: 1 })).toEqual({ ok: false, reason: 'NEEDS_FORCE' });
    expect(planStatusChange({ from: 'CLOSED', to: 'OPEN', force: true, profileCount: 1 })).toEqual({ ok: true, forced: true });
    expect(planStatusChange({ from: 'DRAFT', to: 'ENDED', force: true, profileCount: 0 })).toEqual({ ok: true, forced: true });
    expect(planStatusChange({ from: 'ENDED', to: 'CLOSED', force: true, profileCount: 3 })).toEqual({ ok: true, forced: true });
  });

  it('ten sam status to błąd niezależnie od --force', () => {
    expect(planStatusChange({ from: 'OPEN', to: 'OPEN', force: true, profileCount: 0 })).toEqual({ ok: false, reason: 'SAME_STATUS' });
  });

  it('powrót do DRAFT przy istniejących profilach jest zabroniony także z --force', () => {
    expect(planStatusChange({ from: 'OPEN', to: 'DRAFT', force: true, profileCount: 1 })).toEqual({ ok: false, reason: 'DRAFT_WITH_PROFILES' });
    expect(planStatusChange({ from: 'OPEN', to: 'DRAFT', force: true, profileCount: 0 })).toEqual({ ok: true, forced: true });
    expect(planStatusChange({ from: 'OPEN', to: 'DRAFT', force: false, profileCount: 0 })).toEqual({ ok: false, reason: 'NEEDS_FORCE' });
  });
});
