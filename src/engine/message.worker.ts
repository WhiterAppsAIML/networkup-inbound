import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { BaseWorker } from './base.worker';
import { LinkedInHttpClient } from '../linkedin-client/linkedin-http.client';
import { CommentPersonalizationClient } from '../ai/comment-personalization.client';

interface MessageJobData {
  leadId: string;
  senderAccountId: string;
}

@Injectable()
export class MessageWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    prisma: PrismaService,
    private readonly linkedinClient: LinkedInHttpClient,
    private readonly aiClient: CommentPersonalizationClient,
  ) {
    super(QUEUE_NAMES.MESSAGE, 'message', { prisma, queueService });
  }

  protected async process(job: Job<MessageJobData>): Promise<void> {
    const { leadId, senderAccountId } = job.data;

    const lead = await this.context.prisma.lead.findUnique({
      where: { id: leadId },
      include: { automation: true },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }
    if (lead.state !== 'CONNECTION_ACCEPTED' && lead.state !== 'MESSAGE_SENT') {
      this.logger.warn(`Lead ${leadId} in invalid state ${lead.state} for message`);
      return;
    }

    const conversationUrn = await this.findOrCreateConversation(senderAccountId, lead);
    if (!conversationUrn) {
      throw new Error(`Could not find or create conversation for lead ${leadId}`);
    }

    let message = this.interpolateTemplate(lead.automation.messageTemplate, lead);

    if (lead.engagementType === 'COMMENT' && lead.commentText) {
      try {
        const improvised = await this.aiClient.improviseComment({
          baseTemplate: message,
          leadContext: {
            firstName: lead.firstName || '',
            fullName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
            commentText: lead.commentText,
          },
          isConnected: lead.connectionStatus === 'CONNECTED',
        });
        if (improvised) message = improvised;
      } catch (error: any) {
        this.logger.warn(`AI personalization failed for lead ${leadId}, using base template: ${error.message}`);
      }
    }

    try {
      await this.context.prisma.lead.update({
        where: { id: leadId },
        data: { state: 'MESSAGE_SENT', stateUpdatedAt: new Date() },
      });

      await this.context.prisma.leadEvent.create({
        data: {
          workspaceId: lead.workspaceId,
          leadId,
          eventType: 'MESSAGE_SENT',
          metadata: { message, conversationUrn } as any,
        },
      });

      await this.linkedinClient.sendMessage(senderAccountId, conversationUrn, message);
      await this.context.queueService.addReplyPollJob(leadId, senderAccountId);

      this.logger.log(`Message sent to lead ${leadId}`);
    } catch (error) {
      await this.context.prisma.lead.update({
        where: { id: leadId },
        data: { state: 'CONNECTION_ACCEPTED', stateUpdatedAt: new Date() },
      });
      throw error;
    }
  }

  private async findOrCreateConversation(senderAccountId: string, lead: any): Promise<string | null> {
    const profileUrn = this.extractProfileUrn(lead.linkedinProfileUrl);
    if (!profileUrn) return null;

    const conversations = await this.linkedinClient.getConversations(senderAccountId);
    const existing = conversations.find((c: any) =>
      c?.participants?.some((p: any) => p.profileUrn === profileUrn),
    );
    if (existing) return existing.conversationUrn;

    return `urn:li:conversation:${profileUrn}`;
  }

  private extractProfileUrn(url: string): string | null {
    const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (!match) return null;
    return `urn:li:fs_profile:${match[1]}`;
  }

  private interpolateTemplate(template: string, lead: any): string {
    return template
      .replace(/\{\{first_name\}\}/gi, lead.firstName || '')
      .replace(/\{\{last_name\}\}/gi, lead.lastName || '')
      .replace(/\{\{full_name\}\}/gi, `${lead.firstName || ''} ${lead.lastName || ''}`.trim())
      .replace(/\{\{company\}\}/gi, lead.company || '')
      .replace(/\{\{job_title\}\}/gi, '');
  }
}