import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { Prisma } from '@prisma/client';

export interface LeadQueryDto {
  state?: string;
  connectionStatus?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async findByAutomation(automationId: string, query: LeadQueryDto) {
    const { state, connectionStatus, page = 1, limit = 50 } = query;
    const where: any = { automationId };
    if (state) where.state = state;
    if (connectionStatus) where.connectionStatus = connectionStatus;

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data: leads, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        automation: { select: { id: true, name: true, senderAccountId: true } },
        events: { orderBy: { timestamp: 'desc' } },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead ${id} not found`);
    }

    return lead;
  }

  async remove(id: string, removedBy: string) {
    const lead = await this.findOne(id);

    if (['REPLIED', 'REMOVED', 'WRONG_PERSON', 'COMPLETED'].includes(lead.state)) {
      throw new BadRequestException(`Cannot remove lead in state ${lead.state}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { state: 'REMOVED', stateUpdatedAt: new Date() },
      });

      await tx.leadEvent.create({
        data: {
          leadId: id,
          workspaceId: lead.workspaceId,
          eventType: 'REMOVED',
          metadata: { removedBy, removedAt: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  async markWrongPerson(id: string, markedBy: string) {
    const lead = await this.findOne(id);

    if (['REPLIED', 'REMOVED', 'WRONG_PERSON', 'COMPLETED'].includes(lead.state)) {
      throw new BadRequestException(`Cannot mark wrong person in state ${lead.state}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { state: 'WRONG_PERSON', stateUpdatedAt: new Date() },
      });

      await tx.leadEvent.create({
        data: {
          leadId: id,
          workspaceId: lead.workspaceId,
          eventType: 'MARKED_WRONG_PERSON',
          metadata: { markedBy, markedAt: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  async transitionState(leadId: string, newState: string, metadata?: Record<string, unknown>) {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['CONNECTION_SENT', 'MESSAGE_SENT', 'REMOVED', 'WRONG_PERSON'],
      CONNECTION_SENT: ['CONNECTION_ACCEPTED', 'REMOVED', 'WRONG_PERSON'],
      CONNECTION_ACCEPTED: ['MESSAGE_SENT', 'REMOVED', 'WRONG_PERSON'],
      MESSAGE_SENT: ['REPLIED', 'COMPLETED', 'REMOVED', 'WRONG_PERSON'],
    };

    const lead = await this.findOne(leadId);
    const allowed = validTransitions[lead.state] || [];

    if (!allowed.includes(newState)) {
      throw new BadRequestException(`Invalid state transition from ${lead.state} to ${newState}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: { state: newState as any, stateUpdatedAt: new Date() },
      });

      await tx.leadEvent.create({
        data: {
          leadId,
          workspaceId: lead.workspaceId,
          eventType: newState as any,
          metadata: (metadata || {}) as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  async enqueueConnection(leadId: string) {
    const lead = await this.findOne(leadId);
    if (lead.state !== 'PENDING' && lead.state !== 'CONNECTION_SENT') {
      throw new BadRequestException('Lead not in valid state for connection');
    }
    await this.transitionState(leadId, 'CONNECTION_SENT');
    return this.queueService.addConnectJob(leadId, lead.automation.senderAccountId);
  }

  async enqueueMessage(leadId: string) {
    const lead = await this.findOne(leadId);
    if (lead.state !== 'CONNECTION_ACCEPTED' && lead.state !== 'MESSAGE_SENT') {
      throw new BadRequestException('Lead not in valid state for message');
    }
    await this.transitionState(leadId, 'MESSAGE_SENT');
    return this.queueService.addMessageJob(leadId, lead.automation.senderAccountId);
  }

  async enqueueReplyPoll(leadId: string) {
    const lead = await this.findOne(leadId);
    if (lead.state !== 'MESSAGE_SENT') {
      throw new BadRequestException('Lead not in valid state for reply poll');
    }
    return this.queueService.addReplyPollJob(leadId, lead.automation.senderAccountId);
  }

  async getStats(automationId: string) {
    const leads = await this.prisma.lead.groupBy({
      by: ['state'],
      where: { automationId },
      _count: { state: true },
    });

    const stats = leads.reduce((acc, l) => {
      acc[l.state] = l._count.state;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: Object.values(stats).reduce((a, b) => a + b, 0),
      byState: stats,
    };
  }
}