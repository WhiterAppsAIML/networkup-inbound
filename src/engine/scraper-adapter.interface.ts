export interface RawEngager {
  profileUrn: string;
  firstName: string;
  lastName: string;
  company?: string;
  engagementType: 'LIKE' | 'COMMENT';
  commentText?: string;
}

export interface ScraperAdapter {
  fetchEngagers(senderAccountId: string, postUrn: string): Promise<RawEngager[]>;
}

export class ScraperAdapterFactory {
  private static adapterType = process.env.SCRAPER_ADAPTER || 'csv';

  static createAdapter(): ScraperAdapter {
    switch (this.adapterType) {
      case 'proxycurl':
        return new ProxyCurlAdapter();
      case 'puppeteer':
        return new PuppeteerAdapter();
      case 'csv':
      default:
        return new CsvUploadAdapter();
    }
  }
}

class CsvUploadAdapter implements ScraperAdapter {
  async fetchEngagers(_senderAccountId: string, _postUrn: string): Promise<RawEngager[]> {
    throw new Error('CSV upload adapter: engagers must be imported via POST /api/v1/automations/:id/engagers/import');
  }
}

class ProxyCurlAdapter implements ScraperAdapter {
  async fetchEngagers(senderAccountId: string, postUrn: string): Promise<RawEngager[]> {
    const apiKey = process.env.PROXYCURL_API_KEY;
    if (!apiKey) throw new Error('PROXYCURL_API_KEY not configured');

    const response = await fetch(`https://nubela.co/proxycurl/api/v2/linkedin/post/engagers?post_urn=${encodeURIComponent(postUrn)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Proxycurl error: ${response.statusText}`);

    const data = await response.json();
    return (data.likers || []).map((l: any) => ({
      profileUrn: l.profile_urn,
      firstName: l.first_name,
      lastName: l.last_name,
      company: l.company,
      engagementType: 'LIKE' as const,
    })).concat((data.commenters || []).map((c: any) => ({
      profileUrn: c.profile_urn,
      firstName: c.first_name,
      lastName: c.last_name,
      company: c.company,
      engagementType: 'COMMENT' as const,
      commentText: c.comment_text,
    })));
  }
}

class PuppeteerAdapter implements ScraperAdapter {
  async fetchEngagers(_senderAccountId: string, _postUrn: string): Promise<RawEngager[]> {
    throw new Error('Puppeteer adapter not implemented - requires browser automation setup');
  }
}