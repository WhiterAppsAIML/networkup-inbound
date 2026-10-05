import { Module } from '@nestjs/common';
import { SenderAccountController } from './sender-account.controller';
import { SenderAccountService } from './sender-account.service';

@Module({
  controllers: [SenderAccountController],
  providers: [SenderAccountService],
  exports: [SenderAccountService],
})
export class SenderAccountModule {}