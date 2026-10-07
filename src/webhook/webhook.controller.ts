import { Controller, Post, Body, Headers, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { WebhookService, LinkedInReplyWebhookDto } from './webhook.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@ApiTags('Webhooks')
@Controller('webhooks/linkedin')
export class WebhookController {
  constructor(private readonly service: WebhookService) {}

  @Post('reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle LinkedIn reply webhook for Unified Inbox handoff' })
  @ApiHeader({ name: 'x-signature', description: 'HMAC signature for verification', required: false })
  async handleReply(
    @Body() dto: LinkedInReplyWebhookDto,
    @Headers('x-signature') signature: string,
    @Req() req: Request,
  ) {
    const payload = JSON.stringify(dto);
    const valid = await this.service.verifySignature(payload, signature || '');
    if (!valid) {
      return { status: 'invalid_signature' };
    }
    return this.service.handleReplyWebhook(dto);
  }
}