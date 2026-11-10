import { Injectable, Logger } from '@nestjs/common';
import { LinkedInHttpClient } from '../linkedin-client/linkedin-http.client';
import { ScraperAdapter, ScraperAdapterFactory } from './scraper-adapter.interface';
<<<<<<< HEAD
import { ActionWordsClient } from '../ai/action-words.client';
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b

export interface EngagerData {
  profileUrl: string;
  firstName: string;
  lastName: string;
  company?: string;
  engagementType: 'LIKE' | 'COMMENT';
  commentText?: string;
  connectionStatus: 'NOT_CONNECTED' | 'PENDING' | 'CONNECTED';
  matchedActionWords: string[];
<<<<<<< HEAD
  jobTitle?: string;
=======
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
}

@Injectable()
export class EngagementScannerService {
  private readonly logger = new Logger(EngagementScannerService.name);
<<<<<<< HEAD
  private readonly actionWordsConfidenceThreshold = 0.7;

  constructor(
    private readonly linkedinClient: LinkedInHttpClient,
    private readonly actionWordsClient: ActionWordsClient,
  ) {}

  private extractPostUrn(url: string): string | null {
    const patterns = [
      /activity-(\d+)/,
      /urn:li:activity:(\d+)/,
      /activity:(\d+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return `urn:li:activity:${match[1]}`;
    }
    return null;
  }

=======

  constructor(
    private readonly linkedinClient: LinkedInHttpClient,
  ) {}

>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
  async scanPostEngagers(
    senderAccountId: string,
    postUrl: string,
    actionWords: string[],
  ): Promise<EngagerData[]> {
    const postUrn = this.extractPostUrn(postUrl);
    if (!postUrn) {
      throw new Error(`Invalid LinkedIn post URL: ${postUrl}`);
    }

    const adapter = ScraperAdapterFactory.createAdapter();
    const rawEngagers = await adapter.fetchEngagers(senderAccountId, postUrn);

    const engagers: EngagerData[] = [];

    for (const raw of rawEngagers) {
<<<<<<< HEAD
      const aiResult = await this.actionWordsClient.analyzeActionWords({
        commentText: raw.commentText || '',
        actionWords,
      });

      const matchedWords: string[] = aiResult?.matchedWords ?? [];
      const confidence = aiResult?.confidence ?? 0;
      const effectiveMatch = matchedWords.length > 0 && confidence >= this.actionWordsConfidenceThreshold;

      if (raw.engagementType === 'COMMENT' && actionWords.length > 0 && !effectiveMatch) {
=======
      const matchedWords = this.matchActionWords(raw.commentText || '', actionWords);

      if (raw.engagementType === 'COMMENT' && actionWords.length > 0 && matchedWords.length === 0) {
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
        continue;
      }

      let connectionStatus: 'NOT_CONNECTED' | 'PENDING' | 'CONNECTED' = 'NOT_CONNECTED';
      if (raw.profileUrn) {
        try {
          const status = await this.linkedinClient.checkConnectionStatus(senderAccountId, raw.profileUrn);
          connectionStatus = status === '1' ? 'CONNECTED' : status === 'PENDING' ? 'PENDING' : 'NOT_CONNECTED';
        } catch {
          connectionStatus = 'NOT_CONNECTED';
        }
      }

      engagers.push({
        profileUrl: `https://www.linkedin.com/in/${raw.profileUrn?.split(':').pop() || ''}`,
        firstName: raw.firstName || '',
        lastName: raw.lastName || '',
        company: raw.company,
        engagementType: raw.engagementType,
        commentText: raw.commentText,
        connectionStatus,
        matchedActionWords: matchedWords,
      });
    }

    return engagers;
  }
<<<<<<< HEAD
=======

  private extractPostUrn(url: string): string | null {
    const patterns = [
      /activity-(\d+)/,
      /urn:li:activity:(\d+)/,
      /activity:(\d+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return `urn:li:activity:${match[1]}`;
    }
    return null;
  }

  private matchActionWords(commentText: string, actionWords: string[]): string[] {
    if (actionWords.length === 0) return [];
    const lowerComment = commentText.toLowerCase();
    return actionWords.filter((word) => lowerComment.includes(word.toLowerCase()));
  }
>>>>>>> d9fb37f3162d92582f057668f485ca3833073a3b
}