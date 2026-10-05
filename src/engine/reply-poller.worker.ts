import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { BaseWorker } from './base.worker';
import { LinkedInHttpClient } from '../linkedin-client/linkedin-http.client';

interface ReplyPollJobData {
  leadId: string;
  senderAccountId: string;
}

@Injectable()
export class ReplyPollerWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    prisma: PrismaService,
    private readonly linkedinClient: LinkedInHttpClient,
  ) {
    super(QUEUE_NAMES.REPLY_POLL, 'poll', { prisma, queueService });
  }

  protected async process(job: Job<ReplyPollJobData>): Promise<void> {
    const { leadId, senderAccountId } = job.data;

    const lead = await this.context.prisma.lead.findUnique({
      where: { id: leadId },
      include: { automation: true },
    });

    if (!lead) {
      this.logger.warn(`Lead ${leadId} not found, stopping poll`);
      return;
    }
    if (lead.state !== 'MESSAGE_SENT') {
      this.logger.log(`Lead ${leadId} no longer in MESSAGE_SENT (now ${lead.state}), stopping poll`);
      return;
    }

    const conversationUrn = await this.findConversation(senderAccountId, lead);
    if (!conversationUrn) {
      this.logger.warn(`No conversation found for lead ${leadId}, will retry`);
      await this.scheduleRetry(leadId, senderAccountId);
      return;
    }

    const events = await this.linkedinClient.getConversationEvents(senderAccountId, conversationUrn, lead.stateUpdatedAt);

    const myProfileUrn = await this.getMyProfileUrn(senderAccountId);

    const inboundReplies = events.filter((e: any) => {
      const isInbound = e?.from?.profileUrn !== myProfileUrn;
      const isMessage = e?.eventType === 'MESSAGE_CREATE';
      const isAfterOurMessage = new Date(e?.createdAt || 0) > lead.stateUpdatedAt;
      return isInbound && isMessage && isAfterOurMessage;
    });

    if (inboundReplies.length > 0) {
      const latestReply = inboundReplies[0];
      await this.handleReply(lead, latestReply);
      return;
    }

    await this.scheduleRetry(leadId, senderAccountId);
  }

  private async handleReply(lead: any, replyEvent: any): Promise<void> {
    await this.context.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: { state: 'REPLIED', stateUpdatedAt: new Date() },
      });

      await tx.leadEvent.create({
        data: {
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          eventType: 'REPLY_DETECTED',
          metadata: {
            messageId: replyEvent.eventUrn,
            senderUrn: replyEvent.from?.profileUrn,
            body: replyEvent.value?.['com.linkedin.voyager.messaging.create.MessageCreate']?.body?.text,
            timestamp: replyEvent.createdAt,
          } as any,
        },
      });
    });

    this.logger.log(`Lead ${lead.id} replied - automation stopped, handoff to Unified Inbox`);
  }

  private async scheduleRetry(leadId: string, senderAccountId: string): Promise<void> {
    const delay = 2 * 60 * 1000 + Math.random() * 3 * 60 * 1000;
    await this.context.queueService.addReplyPollJob(leadId, senderAccountId);
  }

  private async findConversation(senderAccountId: string, lead: any): Promise<string | null> {
    const profileUrn = this.extractProfileUrn(lead.linkedinProfileUrl);
    if (!profileUrn) return null;

    const conversations = await this.linkedinClient.getConversations(senderAccountId);
    const existing = conversations.find((c: any) =>
      c?.participants?.some((p: any) => p.profileUrn === profileUrn),
    );
    return existing?.conversationUrn || null;
  }

  private async getMyProfileUrn(senderAccountId: string): Promise<string> {
    const profile = await this.linkedinClient.getProfile(senderAccountId);
    return profile?.entityUrn || profile?.urn || '';
  }

  private extractProfileUrn(url: string): string | null {
    const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (!match) return null;
    return `urn:li:fs_profile:${match[1]}`;
  }
}