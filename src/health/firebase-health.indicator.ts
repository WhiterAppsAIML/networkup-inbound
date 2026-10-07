import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';

@Injectable()
export class FirebaseHealthIndicator {
  private app: App | null = null;

  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    return this.healthIndicatorService.check(key).attempt(async () => {
      if (!this.app) {
        this.app = getApps()[0] || initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
      }
      await getAuth(this.app).listUsers(1);
    });
  }
}