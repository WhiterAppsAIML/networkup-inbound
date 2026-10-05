import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface EventQueryDto {
  eventType?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class EventLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findByLead(leadId: string, query: EventQueryDto) {
    const { eventType, page = 1, limit = 100 } = query;
    const where: any = { leadId };
    if (eventType) where.eventType = eventType;

    const [events, total] = await Promise.all([
      this.prisma.leadEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.leadEvent.count({ where }),
    ]);

    return { data: events, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByAutomation(automationId: string, query: EventQueryDto) {
    const { eventType, page = 1, limit = 100 } = query;
    const where: any = { lead: { automationId } };
    if (eventType) where.eventType = eventType;

    const [events, total] = await Promise.all([
      this.prisma.leadEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { lead: { select: { id: true, firstName: true, lastName: true, linkedinProfileUrl: true } } },
      }),
      this.prisma.leadEvent.count({ where }),
    ]);

    return { data: events, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}