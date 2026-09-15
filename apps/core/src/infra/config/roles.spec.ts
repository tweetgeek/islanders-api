import { runsBackgroundJobs, servesAdminApi, servesPublicApi } from './roles.js';

describe('role procesu core', () => {
  it.each([
    ['all', true, true, true],
    ['api', true, true, false],
    ['worker', false, false, true],
  ] as const)('%s: publiczne=%s, admin=%s, tło=%s', (role, pub, admin, bg) => {
    const env = { CORE_ROLE: role };
    expect(servesPublicApi(env)).toBe(pub);
    expect(servesAdminApi(env)).toBe(admin);
    expect(runsBackgroundJobs(env)).toBe(bg);
  });
});
