import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    return this.healthIndicatorService.check(key).attempt(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }
}