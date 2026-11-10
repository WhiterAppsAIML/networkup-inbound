import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { BaseWorker } from './base.worker';
import { LinkedInHttpClient } from '../linkedin-client/linkedin-http.client';
<<<<<<< HEAD
import { ConnectionNoteClient } from '../ai/connection-note.client';
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b

interface ConnectJobData {
  leadId: string;
  senderAccountId: string;
}

@Injectable()
export class ConnectionWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    prisma: PrismaService,
    private readonly linkedinClient: LinkedInHttpClient,
<<<<<<< HEAD
    private readonly noteClient: ConnectionNoteClient,
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
  ) {
    super(QUEUE_NAMES.CONNECT, 'connect', { prisma, queueService });
  }

  protected async process(job: Job<ConnectJobData>): Promise<void> {
    const { leadId, senderAccountId } = job.data;

    const lead = await this.context.prisma.lead.findUnique({
      where: { id: leadId },
      include: { automation: true },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }
    if (lead.state !== 'PENDING' && lead.state !== 'CONNECTION_SENT') {
      this.logger.warn(`Lead ${leadId} in invalid state ${lead.state} for connection`);
      return;
    }
    if (lead.connectionStatus === 'CONNECTED') {
      await this.transitionToMessage(leadId, senderAccountId);
      return;
    }

    const profileUrn = this.extractProfileUrn(lead.linkedinProfileUrl);
    if (!profileUrn) {
      throw new Error(`Cannot extract profile URN from ${lead.linkedinProfileUrl}`);
    }

<<<<<<< HEAD
    // Generate connection note via AI
    let note = this.interpolateTemplate(lead.automation.connectionNoteTemplate || '', lead);
    try {
      const aiNote = await this.noteClient.generateConnectionNote({
        leadContext: {
          firstName: lead.firstName || '',
          fullName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
          company: lead.company || '',
          commentText: lead.commentText || '',
          engagementType: lead.engagementType || '',
        },
        postContext: lead.automation.sourcePostUrl
          ? { postContent: lead.automation.sourcePostUrl,
              actionWords: this.normalizeActionWords(lead.automation.actionWords),
            }
          : undefined,
        maxChars: 300,
      });
      if (aiNote && aiNote.length <= 300) {
        note = aiNote;
        this.logger.log(`AI-generated connection note used for lead ${leadId}`);
      } else {
        this.logger.log(`AI note exceeded char limit or failed, using template for lead ${leadId}`);
      }
    } catch (error: any) {
      this.logger.warn(`AI connection note generation failed for lead ${leadId}, using base template: ${error.message}`);
    }
=======
    const note = this.interpolateTemplate(lead.automation.connectionNoteTemplate || '', lead);
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b

    try {
      await this.context.prisma.lead.update({
        where: { id: leadId },
        data: { state: 'CONNECTION_SENT', connectionStatus: 'PENDING', stateUpdatedAt: new Date() },
      });

      await this.context.prisma.leadEvent.create({
        data: {
          workspaceId: lead.workspaceId,
          leadId,
          eventType: 'CONNECTION_SENT',
          metadata: { note, profileUrn } as any,
        },
      });

      await this.linkedinClient.sendConnectionRequest(senderAccountId, profileUrn, note);

      this.logger.log(`Connection request sent to lead ${leadId}`);
    } catch (error) {
      await this.context.prisma.lead.update({
        where: { id: leadId },
        data: { state: 'PENDING', connectionStatus: 'NOT_CONNECTED', stateUpdatedAt: new Date() },
      });
      throw error;
    }
  }

<<<<<<< HEAD
  private normalizeActionWords(actionWords: any): string[] {
    if (!actionWords) return [];
    if (Array.isArray(actionWords)) return actionWords.map((aw: any) => String(aw));
    return [String(actionWords)];
  }

=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
  private async transitionToMessage(leadId: string, senderAccountId: string): Promise<void> {
    await this.context.prisma.lead.update({
      where: { id: leadId },
      data: { connectionStatus: 'CONNECTED', state: 'CONNECTION_ACCEPTED', stateUpdatedAt: new Date() },
    });
    await this.context.queueService.addMessageJob(leadId, senderAccountId);
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