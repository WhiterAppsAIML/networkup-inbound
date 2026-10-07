import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '@prisma/client';

export interface CreateSenderAccountDto {
  linkedinAccountRef: string;
  displayName: string;
  workspaceId: string;
}

export interface UpdateSenderAccountDto {
  displayName?: string;
  dailyActionCount?: number;
  weeklyActionCount?: number;
  status?: 'HEALTHY' | 'WARNING' | 'RESTRICTED';
  cookies?: Prisma.InputJsonValue;
}

@Injectable()
export class SenderAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSenderAccountDto) {
    const existing = await this.prisma.senderAccount.findUnique({
      where: { linkedinAccountRef: dto.linkedinAccountRef },
    });

    if (existing) {
      throw new ConflictException('LinkedIn account already registered');
    }

    return this.prisma.senderAccount.create({
      data: {
        linkedinAccountRef: dto.linkedinAccountRef,
        displayName: dto.displayName,
        workspaceId: dto.workspaceId,
      },
    });
  }

  async findAll() {
    return this.prisma.senderAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { automations: true } },
      },
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.senderAccount.findUnique({
      where: { id },
      include: {
        automations: { select: { id: true, name: true, status: true } },
      },
    });

    if (!account) {
      throw new NotFoundException(`SenderAccount ${id} not found`);
    }

    return account;
  }

  async update(id: string, dto: UpdateSenderAccountDto) {
    await this.findOne(id);
    return this.prisma.senderAccount.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.senderAccount.delete({ where: { id } });
  }

  async incrementDailyCount(id: string) {
    return this.prisma.senderAccount.update({
      where: { id },
      data: { dailyActionCount: { increment: 1 } },
    });
  }

  async incrementWeeklyCount(id: string) {
    return this.prisma.senderAccount.update({
      where: { id },
      data: { weeklyActionCount: { increment: 1 } },
    });
  }

  async resetDailyCounts() {
    return this.prisma.senderAccount.updateMany({
      data: { dailyActionCount: 0 },
    });
  }

  async resetWeeklyCounts() {
    return this.prisma.senderAccount.updateMany({
      data: { weeklyActionCount: 0 },
    });
  }
}