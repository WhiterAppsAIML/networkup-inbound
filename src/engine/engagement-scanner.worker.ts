import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { BaseWorker } from './base.worker';
import { QueueName } from '../queue/queue.module';
import { EngagementScannerService } from './engagement-scanner.service';
<<<<<<< HEAD
import { LeadScoreClient } from '../ai/lead-score.client';
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b

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
<<<<<<< HEAD
    private readonly leadScoreClient: LeadScoreClient,
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
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

<<<<<<< HEAD
    // Normalize actionWords to string[] for the lead score client
    const normalizedActionWords: string[] = automation.actionWords
      ? (Array.isArray(automation.actionWords)
          ? automation.actionWords.map((aw: any) => String(aw))
          : automation.actionWords ? [String(automation.actionWords)] : [])
      : [];

=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
    for (const engager of engagers) {
      const existingLead = await this.context.prisma.lead.findFirst({
        where: {
          automationId,
          linkedinProfileUrl: engager.profileUrl,
        },
      });

      if (existingLead) continue;

<<<<<<< HEAD
      // Safely get commentText (default to empty string if undefined)
      const commentText = engager.commentText || '';

      const scoreResult = await this.leadScoreClient.scoreLead({
        leadContext: {
          firstName: engager.firstName,
          company: engager.company || undefined,
          engagementType: engager.engagementType,
          commentText,
        },
        postContext: {
          postContent: automation.sourcePostUrl || '',
          actionWords: normalizedActionWords,
        },
        profileData: {
          companySize: engager.company ? this.guessCompanySize(engager.company) : undefined,
          industry: this.guessIndustry(engager.company),
          seniority: this.guessSeniority(engager.jobTitle),
        },
      });

=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
      const lead = await this.context.prisma.lead.create({
        data: {
          workspaceId: automation.workspaceId,
          automationId,
          linkedinProfileUrl: engager.profileUrl,
          firstName: engager.firstName,
          lastName: engager.lastName,
          company: engager.company,
          engagementType: engager.engagementType,
<<<<<<< HEAD
          commentText,
          connectionStatus: engager.connectionStatus,
          state: 'PENDING',
          leadScore: scoreResult?.score ?? 50,
          leadTier: scoreResult?.tier ?? 'MEDIUM',
          profileData: undefined,
=======
          commentText: engager.commentText,
          connectionStatus: engager.connectionStatus,
          state: 'PENDING',
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
        },
      });

      await this.context.prisma.leadEvent.create({
        data: {
          workspaceId: automation.workspaceId,
          leadId: lead.id,
          eventType: 'ENGAGEMENT_DETECTED',
          metadata: {
            engagementType: engager.engagementType,
<<<<<<< HEAD
            commentText,
=======
            commentText: engager.commentText,
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
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
<<<<<<< HEAD

  private guessCompanySize(company: string | undefined): string | undefined {
    if (!company) return undefined;
    const lower = company.toLowerCase();
    if (/ltd|inc|corp|gmbh/.test(lower)) return '11-50';
    if (/company|corporation/.test(lower)) return '51-200';
    return '1-10';
  }

  private guessIndustry(company: string | undefined): string | undefined {
    if (!company) return undefined;
    const lower = company.toLowerCase();
    if (/saas|tech|software/.test(lower)) return 'SaaS';
    if (/finance|bank/.test(lower)) return 'Finance';
    if (/health|medical/.test(lower)) return 'Healthcare';
    return undefined;
  }

  private guessSeniority(jobTitle: string | undefined): string | undefined {
    if (!jobTitle) return undefined;
    const lower = jobTitle.toLowerCase();
    if (/vp|head|chief|director/.test(lower)) return 'director_plus';
    if (/manager/.test(lower)) return 'manager';
    return 'entry_level';
  }
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
}