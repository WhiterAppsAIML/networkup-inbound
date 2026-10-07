export const QUEUE_NAMES = {
  ENGAGEMENT_SCAN: 'engagement-scan',
  CONNECT: 'connect',
  MESSAGE: 'message',
  REPLY_POLL: 'reply-poll',
} as const;
 
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
 