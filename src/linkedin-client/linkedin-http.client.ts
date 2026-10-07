import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { CookieEncryptionService } from './cookie-encryption.service';
import { PrismaService } from '../prisma/prisma.module';
import { RateLimitService } from '../rate-limit/rate-limit.service';

export interface LinkedInCookies {
  li_at: string;
  JSESSIONID?: string;
  [key: string]: string | undefined;
}

export interface VoyagerResponse<T> {
  data: T;
  status: number;
}

@Injectable()
export class LinkedInHttpClient {
  private readonly logger = new Logger(LinkedInHttpClient.name);
  private readonly baseUrl = 'https://www.linkedin.com/voyager/api';
  private clients: Map<string, AxiosInstance> = new Map();

  constructor(
    private readonly cookieEncryption: CookieEncryptionService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private getClient(senderAccountId: string, cookies: LinkedInCookies): AxiosInstance {
    let client = this.clients.get(senderAccountId);
    if (client) return client;

    client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.linkedin.normalized+json+2.1',
        'X-RestLi-Protocol-Version': '2.0.0',
        'X-Li-Lang': 'en_US',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      withCredentials: true,
    });

    client.interceptors.request.use((config) => {
      const cookieHeader = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      config.headers['Cookie'] = cookieHeader;
      return config;
    });

    client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 429) {
          await this.rateLimit.setStatus(senderAccountId, 'RESTRICTED');
          this.logger.warn(`Rate limited: sender ${senderAccountId} marked RESTRICTED`);
        }
        if (error.response?.status === 401 || error.response?.status === 403) {
          await this.prisma.senderAccount.update({
            where: { id: senderAccountId },
            data: { status: 'RESTRICTED' },
          });
          this.logger.warn(`Auth failed: sender ${senderAccountId} marked RESTRICTED`);
        }
        return Promise.reject(error);
      },
    );

    this.clients.set(senderAccountId, client);
    return client;
  }

  async getSenderClient(senderAccountId: string): Promise<{ client: AxiosInstance; cookies: LinkedInCookies }> {
    const sender = await this.prisma.senderAccount.findUnique({
      where: { id: senderAccountId },
      select: { cookies: true, status: true },
    });

    if (!sender) {
      throw new Error(`SenderAccount ${senderAccountId} not found`);
    }
    if (sender.status === 'RESTRICTED') {
      throw new Error(`SenderAccount ${senderAccountId} is RESTRICTED`);
    }

    const cookies = sender.cookies ? this.cookieEncryption.decrypt(sender.cookies as any) as LinkedInCookies : { li_at: '' };
    if (!cookies.li_at) {
      throw new Error(`SenderAccount ${senderAccountId} missing li_at cookie`);
    }

    const client = this.getClient(senderAccountId, cookies);
    return { client, cookies };
  }

  async getProfile(senderAccountId: string): Promise<any> {
    const { client } = await this.getSenderClient(senderAccountId);
    const response = await client.get('/identity/profiles/me');
    return response.data;
  }

  async getPostEngagers(senderAccountId: string, postUrn: string): Promise<any[]> {
    const { client } = await this.getSenderClient(senderAccountId);
    const likers = await this.fetchAllPages(
      () => client.get(`/feed/posts/${encodeURIComponent(postUrn)}/social-actions/likes`),
      'likes',
    );
    const comments = await this.fetchAllPages(
      () => client.get(`/feed/posts/${encodeURIComponent(postUrn)}/social-actions/comments`),
      'comments',
    );
    return [...likers, ...comments];
  }

  async sendConnectionRequest(
    senderAccountId: string,
    targetProfileUrn: string,
    note: string,
  ): Promise<any> {
    const { client } = await this.getSenderClient(senderAccountId);
    const allowed = await this.rateLimit.checkAndIncrement(senderAccountId);
    if (!allowed.allowed) {
      throw new Error('Rate limit exceeded for sender account');
    }
    const response = await client.post('/growth/normInvitations', {
      invitation: {
        entityUrn: targetProfileUrn,
        invitationType: 'CONNECTION',
        sharedSecret: note,
      },
    });
    return response.data;
  }

  async sendMessage(
    senderAccountId: string,
    conversationUrn: string,
    body: string,
  ): Promise<any> {
    const { client } = await this.getSenderClient(senderAccountId);
    const allowed = await this.rateLimit.checkAndIncrement(senderAccountId);
    if (!allowed.allowed) {
      throw new Error('Rate limit exceeded for sender account');
    }
    const response = await client.post(`/messaging/conversations/${encodeURIComponent(conversationUrn)}/events`, {
      eventCreate: {
        eventType: 'MESSAGE_CREATE',
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            body: { text: body },
          },
        },
      },
    });
    return response.data;
  }

  async getConversations(senderAccountId: string): Promise<any[]> {
    const { client } = await this.getSenderClient(senderAccountId);
    const response = await client.get('/messaging/conversations', {
      params: { count: 50 },
    });
    return response.data?.elements || [];
  }

  async getConversationEvents(
    senderAccountId: string,
    conversationUrn: string,
    since?: Date,
  ): Promise<any[]> {
    const { client } = await this.getSenderClient(senderAccountId);
    const params: any = { count: 50 };
    if (since) params.createdAfter = since.toISOString();
    const response = await client.get(`/messaging/conversations/${encodeURIComponent(conversationUrn)}/events`, {
      params,
    });
    return response.data?.elements || [];
  }

  async checkConnectionStatus(senderAccountId: string, targetProfileUrn: string): Promise<string> {
    const { client } = await this.getSenderClient(senderAccountId);
    try {
      const response = await client.get(`/identity/profiles/${encodeURIComponent(targetProfileUrn)}/connection-info`);
      return response.data?.connectionDistance || 'OUT_OF_NETWORK';
    } catch {
      return 'OUT_OF_NETWORK';
    }
  }

  private async fetchAllPages(
    fetcher: () => Promise<any>,
    type: 'likes' | 'comments',
  ): Promise<any[]> {
    const results: any[] = [];
    let start = 0;
    const count = 100;
    while (true) {
      const response = await fetcher();
      const elements = response.data?.elements || [];
      if (elements.length === 0) break;
      results.push(...elements);
      if (elements.length < count) break;
      start += count;
    }
    return results;
  }

  invalidateClient(senderAccountId: string) {
    this.clients.delete(senderAccountId);
  }
}