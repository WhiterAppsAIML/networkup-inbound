import { Injectable, OnModuleInit, OnModuleDestroy, Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase is not allowed in production');
    }
    return Promise.all([
      this.leadEvent.deleteMany(),
      this.lead.deleteMany(),
      this.automation.deleteMany(),
      this.senderAccount.deleteMany(),
    ]);
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}