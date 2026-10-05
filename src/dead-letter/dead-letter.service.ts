import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly maxRetries = 3;
  private readonly baseDelay = 60000; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async addToDeadLetter(
    workspaceId: string,
    queueName: string,
    jobId: string,
    payload: any,
    error: string,
  ): Promise<void> {
    const existing = await this.prisma.deadLetter.findUnique({
      where: { id: `${queueName}:${jobId}` },
    });

    const attemptCount = existing ? existing.attemptCount + 1 : 1;
    const nextRetryAt = new Date(Date.now() + this.baseDelay * Math.pow(2, attemptCount - 1));

    await this.prisma.deadLetter.upsert({
      where: { id: `${queueName}:${jobId}` },
      create: {
        id: `${queueName}:${jobId}`,
        workspaceId,
        queueName,
        jobId,
        payload: payload as Prisma.InputJsonValue,
        error,
        attemptCount,
        nextRetryAt,
        status: attemptCount >= this.maxRetries ? 'ARCHIVED' : 'PENDING',
      },
      update: {
        error,
        attemptCount,
        nextRetryAt,
        status: attemptCount >= this.maxRetries ? 'ARCHIVED' : 'PENDING',
      },
    });

    this.logger.warn(`Dead letter recorded: ${queueName}:${jobId} (attempt ${attemptCount})`);
  }

  async processDeadLetters(): Promise<void> {
    const due = await this.prisma.deadLetter.findMany({
      where: {
        status: 'PENDING',
        nextRetryAt: { lte: new Date() },
      },
      take: 50,
    });

    for (const dl of due) {
      await this.retryDeadLetter(dl.id);
    }
  }

  async retryDeadLetter(deadLetterId: string): Promise<void> {
    const dl = await this.prisma.deadLetter.findUnique({ where: { id: deadLetterId } });
    if (!dl) return;

    await this.prisma.deadLetter.update({
      where: { id: deadLetterId },
      data: { status: 'RETRYING' },
    });

    try {
      const payload = dl.payload as Record<string, any>;
      switch (dl.queueName) {
        case QUEUE_NAMES.ENGAGEMENT_SCAN:
          await this.queueService.addEngagementScanJob(payload.automationId, payload.postUrl);
          break;
        case QUEUE_NAMES.CONNECT:
          await this.queueService.addConnectJob(payload.leadId, payload.senderAccountId);
          break;
        case QUEUE_NAMES.MESSAGE:
          await this.queueService.addMessageJob(payload.leadId, payload.senderAccountId);
          break;
        case QUEUE_NAMES.REPLY_POLL:
          await this.queueService.addReplyPollJob(payload.leadId, payload.senderAccountId);
          break;
        default:
          throw new Error(`Unknown queue: ${dl.queueName}`);
      }

      await this.prisma.deadLetter.update({
        where: { id: deadLetterId },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      this.logger.log(`Dead letter ${deadLetterId} retried successfully`);
    } catch (error: any) {
      await this.addToDeadLetter(dl.workspaceId, dl.queueName, dl.jobId, dl.payload, error.message);
      this.logger.error(`Dead letter ${deadLetterId} retry failed: ${error.message}`);
    }
  }

  async listDeadLetters(workspaceId: string, status?: string, page = 1, limit = 50): Promise<any> {
    const where: any = { workspaceId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.deadLetter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deadLetter.count({ where }),
    ]);
    return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDeadLetter(id: string): Promise<any> {
    return this.prisma.deadLetter.findUnique({ where: { id } });
  }

  async archiveDeadLetter(id: string): Promise<void> {
    await this.prisma.deadLetter.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }
}