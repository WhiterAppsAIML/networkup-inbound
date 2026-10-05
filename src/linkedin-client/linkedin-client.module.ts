import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CookieEncryptionService } from './cookie-encryption.service';
import { LinkedInHttpClient } from './linkedin-http.client';
import { SessionHealthChecker } from './session-health.checker';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CookieEncryptionService, LinkedInHttpClient, SessionHealthChecker],
  exports: [CookieEncryptionService, LinkedInHttpClient, SessionHealthChecker],
})
export class LinkedInClientModule {}