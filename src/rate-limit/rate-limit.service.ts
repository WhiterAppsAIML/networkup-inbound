import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface RateLimitConfig {
  dailyLimit: number;
  weeklyLimit: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly defaultConfig: RateLimitConfig = {
    dailyLimit: Number(process.env.RATE_LIMIT_DAILY) || 20,
    weeklyLimit: Number(process.env.RATE_LIMIT_DEFAULT_WEEKLY) || 80,
  };

  constructor(private readonly prisma: PrismaService) {}

  async checkAndIncrement(senderAccountId: string, config?: Partial<RateLimitConfig>): Promise<{ allowed: boolean; remaining: { daily: number; weekly: number } }> {
    const limits = { ...this.defaultConfig, ...config };
    const now = new Date();
    const weekStart = this.getWeekStart(now);

    const senderAccount = await this.prisma.senderAccount.findUnique({
      where: { id: senderAccountId },
      select: { dailyActionCount: true, weeklyActionCount: true, lastHealthCheck: true },
    });

    if (!senderAccount) {
      throw new Error(`SenderAccount ${senderAccountId} not found`);
    }

    const dailyUsed = senderAccount.dailyActionCount;
    const weeklyUsed = senderAccount.weeklyActionCount;

    const dailyRemaining = Math.max(0, limits.dailyLimit - dailyUsed);
    const weeklyRemaining = Math.max(0, limits.weeklyLimit - weeklyUsed);

    if (dailyRemaining === 0 || weeklyRemaining === 0) {
      return { allowed: false, remaining: { daily: dailyRemaining, weekly: weeklyRemaining } };
    }

    await this.prisma.senderAccount.update({
      where: { id: senderAccountId },
      data: {
        dailyActionCount: { increment: 1 },
        weeklyActionCount: { increment: 1 },
      },
    });

    return { allowed: true, remaining: { daily: dailyRemaining - 1, weekly: weeklyRemaining - 1 } };
  }

  async resetDailyCounters(): Promise<void> {
    await this.prisma.senderAccount.updateMany({
      data: { dailyActionCount: 0 },
    });
    this.logger.log('Daily rate limit counters reset');
  }

  async resetWeeklyCounters(): Promise<void> {
    await this.prisma.senderAccount.updateMany({
      data: { weeklyActionCount: 0 },
    });
    this.logger.log('Weekly rate limit counters reset');
  }

  async getUsage(senderAccountId: string): Promise<{ daily: number; weekly: number; dailyLimit: number; weeklyLimit: number }> {
    const senderAccount = await this.prisma.senderAccount.findUnique({
      where: { id: senderAccountId },
      select: { dailyActionCount: true, weeklyActionCount: true },
    });

    if (!senderAccount) {
      throw new Error(`SenderAccount ${senderAccountId} not found`);
    }

    return {
      daily: senderAccount.dailyActionCount,
      weekly: senderAccount.weeklyActionCount,
      dailyLimit: this.defaultConfig.dailyLimit,
      weeklyLimit: this.defaultConfig.weeklyLimit,
    };
  }

  async setStatus(senderAccountId: string, status: 'HEALTHY' | 'WARNING' | 'RESTRICTED'): Promise<void> {
    await this.prisma.senderAccount.update({
      where: { id: senderAccountId },
      data: { status: status as any },
    });
    this.logger.warn(`SenderAccount ${senderAccountId} status changed to ${status}`);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}