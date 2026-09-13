import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { WorldProbe } from './world-probe.js';

@Injectable()
export class WorldProbeScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorldProbeScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly probe: WorldProbe,
    @Inject(ENV) private readonly env: AuthEnv,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.WORLD_PROBE_INTERVAL === 0) return;
    this.timer = setInterval(() => void this.tick(), this.env.WORLD_PROBE_INTERVAL * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.probe.probeOnce();
    } catch (err) {
      this.logger.error('Sonda światów nie powiodła się', err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }
}
