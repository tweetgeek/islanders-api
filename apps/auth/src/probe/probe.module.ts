import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { WorldProbe } from './world-probe.js';
import { WorldProbeScheduler } from './world-probe.scheduler.js';

@Module({
  imports: [WorldsModule],
  providers: [WorldProbe, WorldProbeScheduler],
})
export class ProbeModule {}
