import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { createClient } from 'redis';

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    return this.healthIndicatorService.check(key).attempt(async () => {
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.quit();
    });
  }
}