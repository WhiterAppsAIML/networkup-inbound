import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { BaseWorker } from './base.worker';
import { QueueName } from '../queue/queue.module';
import { EngagementScannerService } from './engagement-scanner.service';

interface ScanJobData {
  automationId: string;
  postUrl: string;
}

@Injectable()
export class EngagementScannerWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    prisma: PrismaService,
    private readonly scannerService: EngagementScannerService,
  ) {
    super(QUEUE_NAMES.ENGAGEMENT_SCAN, 'scan', { prisma, queueService });
  }

  protected async process(job: Job<ScanJobData>): Promise<void> {
    const { automationId, postUrl } = job.data;
    const automation = await this.context.prisma.automation.findUnique({
      where: { id: automationId },
      include: { senderAccount: true },
    });

    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }
    if (automation.status !== 'ACTIVE') {
      this.logger.warn(`Automation ${automationId} not active, skipping scan`);
      return;
    }

    const engagers = await this.scannerService.scanPostEngagers(
      automation.senderAccountId,
      postUrl,
      automation.actionWords as string[],
    );

    for (const engager of engagers) {
      const existingLead = await this.context.prisma.lead.findFirst({
        where: {
          automationId,
          linkedinProfileUrl: engager.profileUrl,
        },
      });

      if (existingLead) continue;

      const lead = await this.context.prisma.lead.create({
        data: {
          workspaceId: automation.workspaceId,
          automationId,
          linkedinProfileUrl: engager.profileUrl,
          firstName: engager.firstName,
          lastName: engager.lastName,
          company: engager.company,
          engagementType: engager.engagementType,
          commentText: engager.commentText,
          connectionStatus: engager.connectionStatus,
          state: 'PENDING',
        },
      });

      await this.context.prisma.leadEvent.create({
        data: {
          workspaceId: automation.workspaceId,
          leadId: lead.id,
          eventType: 'ENGAGEMENT_DETECTED',
          metadata: {
            engagementType: engager.engagementType,
            commentText: engager.commentText,
            matchedActionWords: engager.matchedActionWords,
          } as any,
        },
      });

      if (engager.connectionStatus === 'CONNECTED') {
        await this.context.queueService.addMessageJob(lead.id, automation.senderAccountId);
      } else {
        await this.context.queueService.addConnectJob(lead.id, automation.senderAccountId);
      }
    }

    this.logger.log(`Scan completed for automation ${automationId}: ${engagers.length} new leads`);
  }
}