import { RESOURCES, type Resources, emptyResources } from '../rules/index.js';

/**
 * Leniwa ewaluacja: clamp(stored + rate * hours, 0, capacity) dla każdego zasobu.
 * Identyczna z `Settlement.current_resources(now)` klienta; `now` zawsze jako argument.
 */
export function currentResources(
  stored: Resources,
  ratePerHour: Resources,
  lastSyncAt: Date,
  now: Date,
  capacity: number,
): Resources {
  const hours = Math.max(now.getTime() - lastSyncAt.getTime(), 0) / 3_600_000;
  const out = emptyResources();
  for (const r of RESOURCES) {
    const value = stored[r] + ratePerHour[r] * hours;
    out[r] = Math.min(Math.max(value, 0), capacity);
  }
  return out;
}
