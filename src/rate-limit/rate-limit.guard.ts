import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  dailyLimit?: number;
  weeklyLimit?: number;
  skipIf?: (context: ExecutionContext) => boolean;
}

export const RateLimit = (options: RateLimitOptions = {}) =>
  Reflector.createDecorator<RateLimitOptions>()(options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getHandler()) ||
                    this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getClass());

    if (options?.skipIf?.(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const senderAccountId = request.params.senderAccountId || request.body?.senderAccountId || request.user?.senderAccountId;

    if (!senderAccountId) {
      return true;
    }

    const result = await this.rateLimitService.checkAndIncrement(senderAccountId, {
      dailyLimit: options?.dailyLimit,
      weeklyLimit: options?.weeklyLimit,
    });

    if (!result.allowed) {
      throw new ForbiddenException({
        message: 'Rate limit exceeded',
        remaining: result.remaining,
      });
    }

    request.rateLimitRemaining = result.remaining;
    return true;
  }
}