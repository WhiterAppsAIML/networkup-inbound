import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RateLimitScheduler } from './rate-limit.scheduler';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [RateLimitScheduler],
  exports: [RateLimitScheduler],
})
export class SchedulerModule {}