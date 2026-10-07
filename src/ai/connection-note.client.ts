import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ConnectionNoteLeadContext {
  firstName: string;
  fullName: string;
  company?: string;
  jobTitle?: string;
  commentText: string;
  engagementType?: string;
}

export interface ConnectionNotePostContext {
  postContent?: string;
  actionWords?: string[];
}

export interface ConnectionNoteRequest {
  leadContext: ConnectionNoteLeadContext;
  postContext?: ConnectionNotePostContext;
  maxChars?: number;
}

export interface ConnectionNoteResponse {
  connectionNote: string;
  tokensUsed?: { prompt: number; completion: number };
  model?: string;
}

@Injectable()
export class ConnectionNoteClient {
  private readonly logger = new Logger(ConnectionNoteClient.name);
  private readonly client: AxiosInstance;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const baseUrl = this.config.get('AI_SERVICE_URL') || 'http://localhost:8000';
    const token = this.config.get('AI_SERVICE_TOKEN');

    this.enabled = !!this.config.get('AI_SERVICE_URL');
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 8000,
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

  async generateConnectionNote(request: ConnectionNoteRequest): Promise<string | null> {
    if (!this.enabled) {
      this.logger.debug('AI service not configured, skipping connection note generation');
      return null;
    }

    try {
      const response = await this.client.post<ConnectionNoteResponse>(
        '/api/v1/connection/note',
        request,
      );
      return response.data.connectionNote || null;
    } catch (error: any) {
      this.logger.warn(`AI connection note generation failed: ${error.message}`);
      return null;
    }
  }
}
