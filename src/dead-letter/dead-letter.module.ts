import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue/queue.module';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterController } from './dead-letter.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ENGAGEMENT_SCAN },
      { name: QUEUE_NAMES.CONNECT },
      { name: QUEUE_NAMES.MESSAGE },
      { name: QUEUE_NAMES.REPLY_POLL },
    ),
  ],
  controllers: [DeadLetterController],
  providers: [DeadLetterService],
  exports: [DeadLetterService],
})
export class DeadLetterModule {}