import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { LeadService } from '../lead/lead.service';
import { OrchestratorService } from '../engine/orchestrator.service';
import { DeadLetterService } from '../dead-letter/dead-letter.service';
import { Prisma } from '@prisma/client';

export interface LinkedInReplyWebhookDto {
  leadId: string;
  messageId: string;
  senderUrn: string;
  recipientUrn: string;
  body: string;
  timestamp: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadService: LeadService,
    private readonly orchestrator: OrchestratorService,
    private readonly deadLetter: DeadLetterService,
  ) {}

  async handleReplyWebhook(dto: LinkedInReplyWebhookDto) {
    this.logger.log(`Reply webhook received for lead ${dto.leadId}`);

    try {
      const lead = await this.leadService.findOne(dto.leadId);

      if (['REPLIED', 'REMOVED', 'WRONG_PERSON', 'COMPLETED'].includes(lead.state)) {
        this.logger.warn(`Lead ${dto.leadId} already in terminal state ${lead.state}`);
        return { status: 'already_terminal', state: lead.state };
      }

      await this.orchestrator.handleReplyDetected(dto.leadId, {
        messageId: dto.messageId,
        senderUrn: dto.senderUrn,
        recipientUrn: dto.recipientUrn,
        body: dto.body,
        timestamp: dto.timestamp,
        receivedAt: new Date().toISOString(),
      });

      return { status: 'transitioned' };
    } catch (error: any) {
      this.logger.error(`Webhook processing failed for lead ${dto.leadId}: ${error.message}`);
      await this.deadLetter.addToDeadLetter(
        'unknown', // workspaceId would need to be derived from lead
        'webhook',
        dto.leadId,
        dto,
        error.message,
      );
      throw error;
    }
  }

  async verifySignature(payload: string, signature: string): Promise<boolean> {
    const crypto = await import('crypto');
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('WEBHOOK_SECRET not configured, skipping signature verification');
      return true;
    }
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}