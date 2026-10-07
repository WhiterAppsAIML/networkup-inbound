import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventLogService } from './event-log.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@ApiTags('Event Log')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller()
export class EventLogController {
  constructor(private readonly service: EventLogService) {}

  @Get('leads/:leadId/events')
  @ApiOperation({ summary: 'Get events for a specific lead' })
  findByLead(
    @Param('leadId') leadId: string,
    @Query('eventType') eventType?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findByLead(leadId, { eventType, page, limit });
  }

  @Get('automations/:automationId/events')
  @ApiOperation({ summary: 'Get events for all leads in an automation' })
  findByAutomation(
    @Param('automationId') automationId: string,
    @Query('eventType') eventType?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findByAutomation(automationId, { eventType, page, limit });
  }
}