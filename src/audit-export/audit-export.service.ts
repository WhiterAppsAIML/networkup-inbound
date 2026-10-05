import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { Prisma } from '@prisma/client';

export interface ExportFilters {
  from?: string;
  to?: string;
  eventType?: string;
  automationId?: string;
  leadId?: string;
  format?: 'json' | 'csv';
}

@Injectable()
export class AuditExportService {
  private readonly logger = new Logger(AuditExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async createExport(workspaceId: string, requestedBy: string, filters: ExportFilters): Promise<string> {
    const exportRecord = await this.prisma.auditExport.create({
      data: {
        workspaceId,
        requestedBy,
        format: filters.format || 'json',
        filters: filters as any,
        status: 'PENDING',
      },
    });

    await this.queueService.addJob(QUEUE_NAMES.ENGAGEMENT_SCAN, 'audit-export', {
      exportId: exportRecord.id,
    }, { idempotencyKey: `export:${exportRecord.id}` });

    return exportRecord.id;
  }

  async processExport(exportId: string): Promise<void> {
    const exportRecord = await this.prisma.auditExport.findUnique({
      where: { id: exportId },
    });
    if (!exportRecord) throw new Error(`Export ${exportId} not found`);

    await this.prisma.auditExport.update({
      where: { id: exportId },
      data: { status: 'PROCESSING' },
    });

    try {
      const where = this.buildWhereClause(exportRecord.workspaceId, exportRecord.filters as any);
      const events = await this.prisma.leadEvent.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              linkedinProfileUrl: true,
              automation: { select: { id: true, name: true } },
            },
          },
        },
      });

      const formatted = events.map((e) => ({
        eventId: e.id,
        timestamp: e.timestamp.toISOString(),
        eventType: e.eventType,
        leadId: e.leadId,
        leadName: `${e.lead?.firstName || ''} ${e.lead?.lastName || ''}`.trim(),
        leadProfileUrl: e.lead?.linkedinProfileUrl,
        automationId: e.lead?.automation?.id,
        automationName: e.lead?.automation?.name,
        metadata: e.metadata,
      }));

      const content = exportRecord.format === 'csv'
        ? this.toCsv(formatted)
        : JSON.stringify(formatted, null, 2);

      const fileName = `audit-export-${exportRecord.workspaceId}-${Date.now()}.${exportRecord.format}`;
      const fileUrl = `/tmp/${fileName}`;

      await this.prisma.auditExport.update({
        where: { id: exportId },
        data: {
          status: 'COMPLETED',
          fileUrl,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Export ${exportId} completed: ${events.length} events`);
    } catch (error: any) {
      await this.prisma.auditExport.update({
        where: { id: exportId },
        data: { status: 'FAILED' },
      });
      this.logger.error(`Export ${exportId} failed: ${error.message}`);
      throw error;
    }
  }

  async getExportStatus(exportId: string): Promise<any> {
    return this.prisma.auditExport.findUnique({ where: { id: exportId } });
  }

  async listExports(workspaceId: string, page = 1, limit = 20): Promise<any> {
    const [exports, total] = await Promise.all([
      this.prisma.auditExport.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditExport.count({ where: { workspaceId } }),
    ]);
    return { data: exports, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private buildWhereClause(workspaceId: string, filters: ExportFilters): any {
    const where: any = { workspaceId };
    if (filters.from) where.timestamp = { ...where.timestamp, gte: new Date(filters.from) };
    if (filters.to) where.timestamp = { ...where.timestamp, lte: new Date(filters.to) };
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.automationId) where.lead = { ...where.lead, automationId: filters.automationId };
    if (filters.leadId) where.leadId = filters.leadId;
    return where;
  }

  private toCsv(data: any[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val ?? '').replace(/"/g, '""');
      }).map((v) => `"${v}"`).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }
}