import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '@islanders/platform';
import { AuthClient, AuthUnavailableError, CONTRACT_ERROR_STATUSES } from '../auth-client/auth-client.js';
import { backoffDelayMs } from '../auth-client/backoff.js';
import type { Env } from '../infra/config/env.js';
import { runsBackgroundJobs } from '../infra/config/roles.js';
import { WorldSettingsRepository } from '../world/world-settings.repository.js';

/** Zgłasza świat do rejestru auth po starcie; ponawia w tle, nie blokując startu aplikacji. */
@Injectable()
export class WorldRegistrar implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorldRegistrar.name);
  private timer?: NodeJS.Timeout;
  private scheduled = false;
  private stopped = false;

  constructor(
    private readonly auth: AuthClient,
    private readonly worlds: WorldSettingsRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (!runsBackgroundJobs(this.env)) return;
    this.scheduled = true;
    this.schedule(0, 1);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  isScheduled(): boolean {
    return this.scheduled;
  }

  /** Nigdy nie odrzuca — błąd odczytu świata albo wywołania auth to `false`, nie wyjątek. */
  async registerOnce(): Promise<boolean> {
    let slug: string | undefined;
    try {
      const world = await this.worlds.get();
      slug = world.slug;
      const res = await this.auth.registerWorld(world.slug, {
        name: world.name,
        publicUrl: this.env.PUBLIC_URL,
        adminUrl: this.env.ADMIN_URL,
        status: world.status,
        isTest: world.isTest,
      });
      if (res.status === 204) return true;
      const message = `Zgłoszenie świata ${world.slug} odrzucone: HTTP ${res.status}`;
      if (CONTRACT_ERROR_STATUSES.has(res.status)) this.logger.error(message);
      else this.logger.warn(message);
    } catch (err) {
      const status = err instanceof AuthUnavailableError ? err.status : undefined;
      const who = slug ? `świata ${slug}` : 'świata';
      const message = `Zgłoszenie ${who} nieudane: ${err instanceof Error ? err.message : String(err)}`;
      if (status !== undefined && CONTRACT_ERROR_STATUSES.has(status)) this.logger.error(message);
      else this.logger.warn(message);
    }
    return false;
  }

  private schedule(delayMs: number, attempt: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.runAndReschedule(attempt);
    }, delayMs);
    this.timer.unref();
  }

  /** Osobna metoda, żeby `setTimeout` nigdy nie dostał odrzuconej obietnicy — nawet z błędu w `registerOnce`. */
  private async runAndReschedule(attempt: number): Promise<void> {
    let ok = false;
    try {
      ok = await this.registerOnce();
    } catch (err) {
      this.logger.error('Nieoczekiwany błąd zgłoszenia świata', err instanceof Error ? err.stack : String(err));
    }
    if (ok) return;
    this.schedule(backoffDelayMs(attempt, Math.random), attempt + 1);
  }
}
