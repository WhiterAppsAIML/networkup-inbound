import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface AnalyzeActionWordsRequest {
  commentText: string;
  actionWords: string[];
}

export interface AnalyzeActionWordsResponse {
  matched: boolean;
  matchedWords: string[];
  confidence: number;
  reason: string;
}

export const ACTION_WORDS_CONFIDENCE_THRESHOLD = 0.7;

@Injectable()
export class ActionWordsClient {
  private readonly logger = new Logger(ActionWordsClient.name);
  private readonly client: AxiosInstance;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const baseUrl = this.config.get('AI_SERVICE_URL') || 'http://localhost:8000';
    const token = this.config.get('AI_SERVICE_TOKEN');

    this.enabled = !!this.config.get('AI_SERVICE_URL');
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 5000,
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


  async analyzeActionWords(request: AnalyzeActionWordsRequest): Promise<AnalyzeActionWordsResponse | null> {
    if (!this.enabled) {
      this.logger.debug('AI service not configured, skipping semantic action word analysis');
      return null;
    }

    try {
      const response = await this.client.post<AnalyzeActionWordsResponse>(
        '/api/v1/action-words/analyze',
        request,
      );
      return response.data;
    } catch (error: any) {
      this.logger.warn(`AI action word analysis failed: ${error.message}`);
      return null;
    }
  }
}
