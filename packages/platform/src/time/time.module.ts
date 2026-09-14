import { Global, Module } from '@nestjs/common';
import { systemClock } from '@islanders/domain/time';

export const CLOCK = Symbol('CLOCK');

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class TimeModule {}
