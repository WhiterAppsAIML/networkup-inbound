import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AutomationService, CreateAutomationDto, UpdateAutomationDto } from './automation.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@ApiTags('Automations')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('automations')
export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new automation (Step 1-5 builder config)' })
  create(@Body() dto: CreateAutomationDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all automations' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get automation details' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/review')
  @ApiOperation({ summary: 'Get read-only review summary (Step 5)' })
  getReview(@Param('id') id: string) {
    return this.service.getReview(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update automation config' })
  update(@Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate automation (Step 5 -> Active)' })
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause automation' })
  pause(@Param('id') id: string) {
    return this.service.pause(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete automation' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}