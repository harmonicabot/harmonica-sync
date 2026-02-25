/**
 * HTTP client for the Harmonica REST API v1.
 * Adapted from harmonica-mcp/src/client.ts — kept only sync-relevant methods.
 */

export interface SessionSummary {
  id: string;
  topic: string;
  goal: string;
  status: string;
  participant_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionDetail extends SessionSummary {
  critical: string | null;
  context: string | null;
  summary: string | null;
}

export interface ParticipantResponse {
  participant_id: string;
  participant_name: string | null;
  active: boolean;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }>;
}

export interface SessionSummaryResult {
  session_id: string;
  summary: string | null;
  generated_at: string | null;
}

export class HarmonicaClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://app.harmonica.chat') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as any)?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Harmonica API error: ${message}`);
    }

    return res.json() as Promise<T>;
  }

  async listSessions(params?: {
    status?: 'active' | 'completed';
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: SessionSummary[]; pagination: { total: number; limit: number; offset: number } }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.q) query.set('q', params.q);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return this.request(`/sessions${qs ? `?${qs}` : ''}`);
  }

  async getSession(id: string): Promise<SessionDetail> {
    return this.request(`/sessions/${id}`);
  }

  async getResponses(sessionId: string): Promise<{ data: ParticipantResponse[] }> {
    return this.request(`/sessions/${sessionId}/responses`);
  }

  async getSummary(sessionId: string): Promise<SessionSummaryResult> {
    return this.request(`/sessions/${sessionId}/summary`);
  }
}
