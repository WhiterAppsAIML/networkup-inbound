import { Injectable, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.module';
import { QueueService, QUEUE_NAMES } from '../queue/queue.service';
import { QueueName } from '../queue/queue.module';

export interface WorkerContext {
  prisma: PrismaService;
  queueService: QueueService;
}

@Injectable()
export abstract class BaseWorker {
  protected readonly logger: Logger;
  protected worker!: Worker;
  protected context: WorkerContext;

  constructor(
    protected readonly queueName: QueueName,
    protected readonly jobName: string,
    context: WorkerContext,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.context = context;
    this.initializeWorker();
  }

  private initializeWorker() {
    this.worker = new Worker(this.queueName, this.processJob.bind(this), {
      connection: { url: process.env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Worker error: ${err.message}`);
    });
  }

  private async processJob(job: Job) {
    const startTime = Date.now();
    try {
      this.logger.log(`Processing ${this.jobName} job ${job.id}`);
      await this.process(job);
      this.logger.log(`${this.jobName} job ${job.id} completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      this.logger.error(`${this.jobName} job ${job.id} failed: ${error.message}`);
      throw error;
    }
  }

  protected abstract process(job: Job): Promise<void>;

  async close(): Promise<void> {
    await this.worker.close();
  }
}