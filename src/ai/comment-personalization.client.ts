import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ImproviseCommentRequest {
  baseTemplate: string;
  leadContext: {
    firstName: string;
    fullName: string;
    commentText: string;
  };
  isConnected: boolean;
}

export interface ImproviseCommentResponse {
  improvisedComment: string;
  tokensUsed?: { prompt: number; completion: number };
  model?: string;
}

@Injectable()
export class CommentPersonalizationClient {
  private readonly logger = new Logger(CommentPersonalizationClient.name);
  private readonly client: AxiosInstance;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const baseUrl = this.config.get('AI_SERVICE_URL') || 'http://localhost:8000';
    const token = this.config.get('AI_SERVICE_TOKEN');

    this.enabled = !!this.config.get('AI_SERVICE_URL');
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.warn(`AI service error: ${error.message}`);
        return Promise.reject(error);
      },
    );
  }

  async improviseComment(request: ImproviseCommentRequest): Promise<string | null> {
    if (!this.enabled) {
      this.logger.debug('AI service not configured, skipping personalization');
      return null;
    }

    try {
      const response = await this.client.post<ImproviseCommentResponse>('/api/v1/comment/improvise', request);
      return response.data.improvisedComment || null;
    } catch (error: any) {
      this.logger.warn(`AI personalization failed: ${error.message}`);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.client.get('/health', { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}