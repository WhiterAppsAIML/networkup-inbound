import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue/queue.module';
import { EngagementScannerWorker } from './engagement-scanner.worker';
import { EngagementScannerService } from './engagement-scanner.service';
import { ConnectionWorker } from './connection.worker';
import { MessageWorker } from './message.worker';
import { ReplyPollerWorker } from './reply-poller.worker';
import { ScraperAdapterFactory } from './scraper-adapter.interface';
import { OrchestratorService } from './orchestrator.service';
import { LinkedInClientModule } from '../linkedin-client/linkedin-client.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ENGAGEMENT_SCAN },
      { name: QUEUE_NAMES.CONNECT },
      { name: QUEUE_NAMES.MESSAGE },
      { name: QUEUE_NAMES.REPLY_POLL },
    ),
    LinkedInClientModule,
    AiModule,
  ],
  providers: [
    EngagementScannerService,
    ScraperAdapterFactory,
    EngagementScannerWorker,
    ConnectionWorker,
    MessageWorker,
    ReplyPollerWorker,
    OrchestratorService,
  ],
  exports: [OrchestratorService, EngagementScannerService],
})
export class EngineModule {}