import { Module, Global } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirebaseService } from './firebase.service';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_APP',
      useFactory: (): App => {
        if (getApps().length === 0) {
          return initializeApp({
            credential: cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
          });
        }
        return getApps()[0];
      },
    },
    FirebaseService,
    FirebaseAuthGuard,
  ],
  exports: [FirebaseService, FirebaseAuthGuard, 'FIREBASE_APP'],
})
export class FirebaseModule {}