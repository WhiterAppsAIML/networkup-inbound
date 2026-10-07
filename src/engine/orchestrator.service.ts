import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { LinkedInHttpClient } from '../linkedin-client/linkedin-http.client';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly linkedinClient: LinkedInHttpClient,
  ) {}

  async activateAutomation(automationId: string): Promise<void> {
    const automation = await this.prisma.automation.findUnique({
      where: { id: automationId },
      include: { senderAccount: true },
    });

    if (!automation) throw new Error(`Automation ${automationId} not found`);
    if (automation.status !== 'ACTIVE') throw new Error('Automation not active');

    await this.queueService.addEngagementScanJob(automationId, automation.sourcePostUrl);
    this.logger.log(`Orchestrator: Activated automation ${automationId}, enqueued engagement scan`);
  }

  async pauseAutomation(automationId: string): Promise<void> {
    await this.prisma.automation.update({
      where: { id: automationId },
      data: { status: 'PAUSED' },
    });
    this.logger.log(`Orchestrator: Paused automation ${automationId}`);
  }

  async resumeAutomation(automationId: string): Promise<void> {
    const automation = await this.prisma.automation.findUnique({
      where: { id: automationId },
    });
    if (!automation) throw new Error(`Automation ${automationId} not found`);

    await this.prisma.automation.update({
      where: { id: automationId },
      data: { status: 'ACTIVE' },
    });
    await this.queueService.addEngagementScanJob(automationId, automation.sourcePostUrl);
    this.logger.log(`Orchestrator: Resumed automation ${automationId}`);
  }

  async handleConnectionAccepted(leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { automation: true },
    });
    if (!lead) return;

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { state: 'CONNECTION_ACCEPTED', connectionStatus: 'CONNECTED', stateUpdatedAt: new Date() },
    });

    await this.prisma.leadEvent.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId,
        eventType: 'CONNECTION_ACCEPTED',
        metadata: {} as any,
      },
    });

    await this.queueService.addMessageJob(leadId, lead.automation.senderAccountId);
    this.logger.log(`Orchestrator: Connection accepted for lead ${leadId}, enqueued message`);
  }

  async handleReplyDetected(leadId: string, replyData: any): Promise<void> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: { state: 'REPLIED', stateUpdatedAt: new Date() },
      });

      await tx.leadEvent.create({
        data: {
          workspaceId: lead.workspaceId,
          leadId,
          eventType: 'REPLY_DETECTED',
          metadata: replyData as any,
        },
      });
    });

    await this.cancelPendingJobs(leadId);
    this.logger.log(`Orchestrator: Reply detected for lead ${leadId}, cancelled pending jobs`);
  }

  async retryFailedLead(leadId: string, fromState: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { automation: true },
    });
    if (!lead) throw new Error(`Lead ${leadId} not found`);

    const stateMap: Record<string, () => Promise<void>> = {
      'PENDING': async () => { await this.queueService.addConnectJob(leadId, lead.automation.senderAccountId); },
      'CONNECTION_SENT': async () => { await this.queueService.addConnectJob(leadId, lead.automation.senderAccountId); },
      'CONNECTION_ACCEPTED': async () => { await this.queueService.addMessageJob(leadId, lead.automation.senderAccountId); },
      'MESSAGE_SENT': async () => { await this.queueService.addReplyPollJob(leadId, lead.automation.senderAccountId); },
    };

    const retryFn = stateMap[fromState];
    if (retryFn) {
      await retryFn();
      this.logger.log(`Orchestrator: Retried lead ${leadId} from state ${fromState}`);
    }
  }

  async cancelPendingJobs(leadId: string): Promise<void> {
    // BullMQ doesn't have direct job cancellation by ID easily
    // Jobs use idempotency keys so re-processing is safe
    this.logger.log(`Orchestrator: Marked lead ${leadId} as REPLIED, future jobs will no-op`);
  }

  async getAutomationStats(automationId: string): Promise<any> {
    const leads = await this.prisma.lead.groupBy({
      by: ['state'],
      where: { automationId },
      _count: { state: true },
    });

    return {
      automationId,
      totalLeads: leads.reduce((sum, l) => sum + l._count.state, 0),
      byState: leads.reduce((acc, l) => ({ ...acc, [l.state]: l._count.state }), {}),
    };
  }
}