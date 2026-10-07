import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { FirebaseModule } from './auth/firebase.module';
import { QueueModule } from './queue/queue.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { HealthModule } from './health/health.module';
import { SenderAccountModule } from './sender-account/sender-account.module';
import { AutomationModule } from './automation/automation.module';
import { LeadModule } from './lead/lead.module';
import { EventLogModule } from './event-log/event-log.module';
import { WebhookModule } from './webhook/webhook.module';
import { LinkedInClientModule } from './linkedin-client/linkedin-client.module';
import { EngineModule } from './engine/engine.module';
import { AiModule } from './ai/ai.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AuditExportModule } from './audit-export/audit-export.module';
import { DeadLetterModule } from './dead-letter/dead-letter.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    FirebaseModule,
    QueueModule,
    RateLimitModule,
    HealthModule,
    SenderAccountModule,
    AutomationModule,
    LeadModule,
    EventLogModule,
    WebhookModule,
    LinkedInClientModule,
    EngineModule,
    AiModule,
    SchedulerModule,
    AuditExportModule,
    DeadLetterModule,
  ],
})
export class AppModule {}