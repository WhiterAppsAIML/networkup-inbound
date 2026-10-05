import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface MessagePersonalizeLeadContext {
  firstName: string;
  fullName: string;
  company?: string;
  jobTitle?: string;
  commentText: string;
  engagementType?: string;
}

export interface MessagePersonalizePostContext {
  postUrl?: string;
  postContent?: string;
  actionWords?: string[];
}

export interface PersonalizeMessageRequest {
  baseTemplate: string;
  leadContext: MessagePersonalizeLeadContext;
  postContext?: MessagePersonalizePostContext;
  isConnected: boolean;
}

export interface PersonalizeMessageResponse {
  improvisedMessage: string;
  tokensUsed?: { prompt: number; completion: number };
  model?: string;
}

@Injectable()
export class MessagePersonalizationClient {
  private readonly logger = new Logger(MessagePersonalizationClient.name);
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

  async personalizeMessage(request: PersonalizeMessageRequest): Promise<string | null> {
    if (!this.enabled) {
      this.logger.debug('AI service not configured, skipping personalization');
      return null;
    }

    try {
      const response = await this.client.post<PersonalizeMessageResponse>(
        '/api/v1/message/personalize',
        request,
      );
      return response.data.improvisedMessage || null;
    } catch (error: any) {
      this.logger.warn(`AI message personalization failed: ${error.message}`);
      return null;
    }
  }
}
