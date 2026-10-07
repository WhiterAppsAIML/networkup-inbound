import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadService } from './lead.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators';

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('automations/:automationId/leads')
export class LeadController {
  constructor(private readonly service: LeadService) {}

  @Get()
  @ApiOperation({ summary: 'List leads for an automation with filters' })
  findAll(
    @Param('automationId') automationId: string,
    @Query('state') state?: string,
    @Query('connectionStatus') connectionStatus?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findByAutomation(automationId, { state, connectionStatus, page, limit });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get lead statistics by state' })
  getStats(@Param('automationId') automationId: string) {
    return this.service.getStats(automationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead details with events' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/remove')
  @ApiOperation({ summary: 'Manually remove lead from automation' })
  remove(@Param('id') id: string, @CurrentUser('uid') uid: string) {
    return this.service.remove(id, uid);
  }

  @Post(':id/wrong-person')
  @ApiOperation({ summary: 'Mark lead as wrong person' })
  markWrongPerson(@Param('id') id: string, @CurrentUser('uid') uid: string) {
    return this.service.markWrongPerson(id, uid);
  }

  @Post(':id/enqueue-connect')
  @ApiOperation({ summary: 'Enqueue connection request job' })
  enqueueConnect(@Param('id') id: string) {
    return this.service.enqueueConnection(id);
  }

  @Post(':id/enqueue-message')
  @ApiOperation({ summary: 'Enqueue message send job' })
  enqueueMessage(@Param('id') id: string) {
    return this.service.enqueueMessage(id);
  }

  @Post(':id/enqueue-reply-poll')
  @ApiOperation({ summary: 'Enqueue reply polling job' })
  enqueueReplyPoll(@Param('id') id: string) {
    return this.service.enqueueReplyPoll(id);
  }
}