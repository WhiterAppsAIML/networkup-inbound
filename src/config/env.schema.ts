import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string(),
  ENCRYPTION_KEY: z.string().length(32),
  RATE_LIMIT_DEFAULT_WEEKLY: z.coerce.number().default(80),
  RATE_LIMIT_PREMIUM_WEEKLY: z.coerce.number().default(150),
  RATE_LIMIT_DAILY: z.coerce.number().default(20),
});

export type Env = z.infer<typeof envSchema>;