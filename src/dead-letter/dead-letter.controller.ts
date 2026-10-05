import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeadLetterService } from './dead-letter.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@ApiTags('Dead Letter Queue')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('workspaces/:workspaceId/dead-letters')
export class DeadLetterController {
  constructor(private readonly service: DeadLetterService) {}

  @Get()
  @ApiOperation({ summary: 'List dead letters' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listDeadLetters(workspaceId, status, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dead letter details' })
  get(@Param('id') id: string) {
    return this.service.getDeadLetter(id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a dead letter' })
  retry(@Param('id') id: string) {
    return this.service.retryDeadLetter(id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a dead letter' })
  archive(@Param('id') id: string) {
    return this.service.archiveDeadLetter(id);
  }
}