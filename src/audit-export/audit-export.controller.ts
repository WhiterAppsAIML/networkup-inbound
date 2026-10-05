import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditExportService, ExportFilters } from './audit-export.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators';

@ApiTags('Audit Export')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('workspaces/:workspaceId/audit-exports')
export class AuditExportController {
  constructor(private readonly service: AuditExportService) {}

  @Post()
  @ApiOperation({ summary: 'Create audit log export job' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser('uid') uid: string,
    @Body() filters: ExportFilters,
  ) {
    return this.service.createExport(workspaceId, uid, filters);
  }

  @Get()
  @ApiOperation({ summary: 'List audit exports for workspace' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listExports(workspaceId, page, limit);
  }

  @Get(':exportId')
  @ApiOperation({ summary: 'Get export status' })
  getStatus(@Param('exportId') exportId: string) {
    return this.service.getExportStatus(exportId);
  }
}