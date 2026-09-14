import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '@islanders/platform';
import { AuthClient } from '../auth-client/auth-client.js';
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

  async registerOnce(): Promise<boolean> {
    const world = await this.worlds.get();
    try {
      const res = await this.auth.registerWorld(world.slug, {
        name: world.name,
        publicUrl: this.env.PUBLIC_URL,
        adminUrl: this.env.ADMIN_URL,
        status: world.status,
        isTest: world.isTest,
      });
      if (res.status === 204) return true;
      this.logger.warn(`Zgłoszenie świata ${world.slug} odrzucone: HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`Zgłoszenie świata ${world.slug} nieudane: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  private schedule(delayMs: number, attempt: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      if (await this.registerOnce()) return;
      this.schedule(backoffDelayMs(attempt, Math.random), attempt + 1);
    }, delayMs);
    this.timer.unref();
  }
}
