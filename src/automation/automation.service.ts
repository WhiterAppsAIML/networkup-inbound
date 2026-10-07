import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface CreateAutomationDto {
  name: string;
  sourcePostUrl: string;
  actionWords?: string[];
  connectionNoteTemplate?: string;
  messageTemplate: string;
  senderAccountId: string;
  workspaceId: string;
}

export interface UpdateAutomationDto {
  name?: string;
  sourcePostUrl?: string;
  actionWords?: string[];
  connectionNoteTemplate?: string;
  messageTemplate?: string;
  senderAccountId?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED';
}

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  private validateLinkedInPostUrl(url: string): boolean {
    const patterns = [
      /^https:\/\/www\.linkedin\.com\/posts\/[^/]+\/activity-\d+/,
      /^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:\d+/,
      /^https:\/\/www\.linkedin\.com\/feed\/update\/activity:\d+/,
    ];
    return patterns.some((p) => p.test(url));
  }

  private validateConnectionNote(template?: string): void {
    if (template && template.length > 300) {
      throw new BadRequestException('Connection note exceeds 300 character limit');
    }
  }

  async create(dto: CreateAutomationDto) {
    if (!this.validateLinkedInPostUrl(dto.sourcePostUrl)) {
      throw new BadRequestException('Invalid LinkedIn post URL format');
    }
    this.validateConnectionNote(dto.connectionNoteTemplate);

    const senderAccount = await this.prisma.senderAccount.findUnique({
      where: { id: dto.senderAccountId },
    });
    if (!senderAccount) {
      throw new NotFoundException('Sender account not found');
    }

    return this.prisma.automation.create({
      data: {
        name: dto.name,
        sourcePostUrl: dto.sourcePostUrl,
        actionWords: dto.actionWords || [],
        connectionNoteTemplate: dto.connectionNoteTemplate,
        messageTemplate: dto.messageTemplate,
        senderAccountId: dto.senderAccountId,
        workspaceId: dto.workspaceId,
      },
    });
  }

  async findAll() {
    return this.prisma.automation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        senderAccount: { select: { id: true, displayName: true } },
        _count: { select: { leads: true } },
      },
    });
  }

  async findOne(id: string) {
    const automation = await this.prisma.automation.findUnique({
      where: { id },
      include: {
        senderAccount: { select: { id: true, displayName: true, status: true } },
        leads: {
          select: { id: true, state: true, connectionStatus: true, firstName: true, lastName: true },
        },
      },
    });

    if (!automation) {
      throw new NotFoundException(`Automation ${id} not found`);
    }

    return automation;
  }

  async update(id: string, dto: UpdateAutomationDto) {
    await this.findOne(id);

    if (dto.sourcePostUrl && !this.validateLinkedInPostUrl(dto.sourcePostUrl)) {
      throw new BadRequestException('Invalid LinkedIn post URL format');
    }
    if (dto.connectionNoteTemplate !== undefined) {
      this.validateConnectionNote(dto.connectionNoteTemplate);
    }

    return this.prisma.automation.update({
      where: { id },
      data: dto,
    });
  }

  async activate(id: string) {
    const automation = await this.findOne(id);

    if (!automation.messageTemplate) {
      throw new BadRequestException('Message template is required');
    }
    if (automation.senderAccount.status !== 'HEALTHY') {
      throw new BadRequestException('Sender account is not healthy');
    }

    return this.prisma.automation.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async pause(id: string) {
    await this.findOne(id);
    return this.prisma.automation.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  async getReview(id: string) {
    const automation = await this.findOne(id);
    return {
      id: automation.id,
      name: automation.name,
      sourcePostUrl: automation.sourcePostUrl,
      actionWords: automation.actionWords,
      connectionNoteTemplate: automation.connectionNoteTemplate,
      messageTemplate: automation.messageTemplate,
      senderAccount: automation.senderAccount,
      status: automation.status,
      createdAt: automation.createdAt,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.automation.delete({ where: { id } });
  }
}