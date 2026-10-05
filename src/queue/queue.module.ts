import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue-names.constants';

export { QUEUE_NAMES } from './queue-names.constants';
export type { QueueName } from './queue-names.constants';

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL,
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ENGAGEMENT_SCAN },
      { name: QUEUE_NAMES.CONNECT },
      { name: QUEUE_NAMES.MESSAGE },
      { name: QUEUE_NAMES.REPLY_POLL },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}