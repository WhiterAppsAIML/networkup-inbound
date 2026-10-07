import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue/queue.module';
import { AuditExportService } from './audit-export.service';
import { AuditExportController } from './audit-export.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.ENGAGEMENT_SCAN }),
  ],
  controllers: [AuditExportController],
  providers: [AuditExportService],
  exports: [AuditExportService],
})
export class AuditExportModule {}