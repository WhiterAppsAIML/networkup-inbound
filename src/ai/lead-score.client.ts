import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface LeadScoreLeadContext {
  firstName: string;
  company?: string;
  jobTitle?: string;
  engagementType?: string;
  commentText: string;
}

export interface LeadScorePostContext {
  postContent?: string;
  actionWords?: string[];
}

export interface LeadScoreProfileData {
  companySize?: string;
  industry?: string;
  seniority?: string;
}

export interface ScoreLeadRequest {
  leadContext: LeadScoreLeadContext;
  postContext?: LeadScorePostContext;
  profileData?: LeadScoreProfileData;
}

export interface ScoreLeadResponse {
  score: number;
  tier: 'HIGH' | 'MEDIUM' | 'LOW';
  factors: string[];
}

export const LEAD_SCORE_FALLBACK: ScoreLeadResponse = {
  score: 50,
  tier: 'MEDIUM',
  factors: [],
};

@Injectable()
export class LeadScoreClient {
  private readonly logger = new Logger(LeadScoreClient.name);
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

  async scoreLead(request: ScoreLeadRequest): Promise<ScoreLeadResponse | null> {
    if (!this.enabled) {
      this.logger.debug('AI service not configured, skipping lead scoring');
      return null;
    }

    try {
      const response = await this.client.post<ScoreLeadResponse>('/api/v1/lead/score', request);
      return response.data;
    } catch (error: any) {
      this.logger.warn(`AI lead scoring failed: ${error.message}`);
      return null;
    }
  }
}
