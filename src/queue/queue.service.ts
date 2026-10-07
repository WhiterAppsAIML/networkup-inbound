import { Injectable, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QueueName } from './queue-names.constants';
export { QUEUE_NAMES, QueueName };

@Injectable()
export class QueueService {
  private queues: Map<QueueName, Queue> = new Map();

  constructor(
    @Inject(`BullQueue_${QUEUE_NAMES.ENGAGEMENT_SCAN}`) private engagementScanQueue: Queue,
    @Inject(`BullQueue_${QUEUE_NAMES.CONNECT}`) private connectQueue: Queue,
    @Inject(`BullQueue_${QUEUE_NAMES.MESSAGE}`) private messageQueue: Queue,
    @Inject(`BullQueue_${QUEUE_NAMES.REPLY_POLL}`) private replyPollQueue: Queue,
  ) {
    this.queues.set(QUEUE_NAMES.ENGAGEMENT_SCAN, this.engagementScanQueue);
    this.queues.set(QUEUE_NAMES.CONNECT, this.connectQueue);
    this.queues.set(QUEUE_NAMES.MESSAGE, this.messageQueue);
    this.queues.set(QUEUE_NAMES.REPLY_POLL, this.replyPollQueue);
  }

  getQueue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  async addJob<T>(name: QueueName, jobName: string, data: T, opts?: { idempotencyKey?: string; delay?: number }) {
    const queue = this.getQueue(name);
    const jobId = opts?.idempotencyKey;
    return queue.add(jobName, data, {
      jobId,
      delay: opts?.delay,
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async addEngagementScanJob(automationId: string, postUrl: string) {
    return this.addJob(QUEUE_NAMES.ENGAGEMENT_SCAN, 'scan', { automationId, postUrl }, {
      idempotencyKey: `scan:${automationId}`,
    });
  }

  async addConnectJob(leadId: string, senderAccountId: string) {
    return this.addJob(QUEUE_NAMES.CONNECT, 'connect', { leadId, senderAccountId }, {
      idempotencyKey: `connect:${leadId}`,
    });
  }

  async addMessageJob(leadId: string, senderAccountId: string) {
    return this.addJob(QUEUE_NAMES.MESSAGE, 'message', { leadId, senderAccountId }, {
      idempotencyKey: `message:${leadId}`,
    });
  }

  async addReplyPollJob(leadId: string, senderAccountId: string) {
    return this.addJob(QUEUE_NAMES.REPLY_POLL, 'poll', { leadId, senderAccountId }, {
      idempotencyKey: `poll:${leadId}`,
    });
  }
}