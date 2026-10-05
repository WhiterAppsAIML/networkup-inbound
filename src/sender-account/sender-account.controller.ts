import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SenderAccountService, CreateSenderAccountDto, UpdateSenderAccountDto } from './sender-account.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators';

@ApiTags('Sender Accounts')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('sender-accounts')
export class SenderAccountController {
  constructor(private readonly service: SenderAccountService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sender account' })
  create(@Body() dto: CreateSenderAccountDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all sender accounts' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a sender account by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a sender account' })
  update(@Param('id') id: string, @Body() dto: UpdateSenderAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a sender account' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}