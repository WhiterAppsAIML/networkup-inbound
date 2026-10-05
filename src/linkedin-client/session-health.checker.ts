import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LinkedInHttpClient } from './linkedin-http.client';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class SessionHealthChecker {
  private readonly logger = new Logger(SessionHealthChecker.name);

  constructor(
    private readonly linkedinClient: LinkedInHttpClient,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkAllSessions(): Promise<void> {
    const senders = await this.prisma.senderAccount.findMany({
      where: { status: { not: 'RESTRICTED' } },
      select: { id: true },
    });

    for (const sender of senders) {
      await this.checkSession(sender.id);
    }
  }

  async checkSession(senderAccountId: string): Promise<boolean> {
    try {
      await this.linkedinClient.getProfile(senderAccountId);
      await this.prisma.senderAccount.update({
        where: { id: senderAccountId },
        data: { lastHealthCheck: new Date(), status: 'HEALTHY' },
      });
      return true;
} catch (error: any) {
        this.logger.warn(`Session check failed for ${senderAccountId}: ${error.message}`);
      await this.prisma.senderAccount.update({
        where: { id: senderAccountId },
        data: { lastHealthCheck: new Date(), status: 'RESTRICTED' },
      });
      this.linkedinClient.invalidateClient(senderAccountId);
      return false;
    }
  }

  async forceCheck(senderAccountId: string): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.linkedinClient.getProfile(senderAccountId);
      await this.prisma.senderAccount.update({
        where: { id: senderAccountId },
        data: { lastHealthCheck: new Date(), status: 'HEALTHY' },
      });
      return { healthy: true };
    } catch (error) {
      await this.prisma.senderAccount.update({
        where: { id: senderAccountId },
        data: { lastHealthCheck: new Date(), status: 'RESTRICTED' },
      });
      this.linkedinClient.invalidateClient(senderAccountId);
      return { healthy: false, error: (error as Error).message };
    }
  }
}