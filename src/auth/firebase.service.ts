import { Injectable, Inject } from '@nestjs/common';
import { App } from 'firebase-admin/app';
import { Auth, DecodedIdToken, UserRecord } from 'firebase-admin/auth';

export interface FirebaseApp {
  auth(): Auth;
}

@Injectable()
export class FirebaseService {
  constructor(@Inject('FIREBASE_APP') private readonly firebaseApp: FirebaseApp) {}

  get auth(): Auth {
    return this.firebaseApp.auth();
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return this.auth.verifyIdToken(idToken);
  }

  async getUser(uid: string): Promise<UserRecord> {
    return this.auth.getUser(uid);
  }

  async createCustomToken(uid: string, claims?: object): Promise<string> {
    return this.auth.createCustomToken(uid, claims);
  }
}