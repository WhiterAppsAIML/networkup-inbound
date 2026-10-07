import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class RateLimitScheduler {
  private readonly logger = new Logger(RateLimitScheduler.name);

  constructor(private readonly rateLimit: RateLimitService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyCounters(): Promise<void> {
    await this.rateLimit.resetDailyCounters();
    this.logger.log('Daily rate limit counters reset');
  }

  @Cron('0 0 * * 0')
  async resetWeeklyCounters(): Promise<void> {
    await this.rateLimit.resetWeeklyCounters();
    this.logger.log('Weekly rate limit counters reset');
  }
}