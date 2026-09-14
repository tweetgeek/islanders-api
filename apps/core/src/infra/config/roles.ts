export type CoreRole = 'all' | 'api' | 'worker';
type WithRole = { CORE_ROLE: CoreRole };

/** `worker` nie nasłuchuje na porcie publicznym i nie wystawia API admina — tylko `/health/*`. */
export const servesPublicApi = (env: WithRole): boolean => env.CORE_ROLE !== 'worker';
export const servesAdminApi = (env: WithRole): boolean => env.CORE_ROLE !== 'worker';
/** Zgłoszenie świata i wysyłacz outboxa. */
export const runsBackgroundJobs = (env: WithRole): boolean => env.CORE_ROLE !== 'api';
