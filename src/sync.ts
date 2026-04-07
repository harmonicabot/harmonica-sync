import fs from 'node:fs';
import path from 'node:path';
import { HarmonicaClient, type SessionDetail, type ParticipantResponse } from './api.js';
import { renderSession } from './template.js';

export interface SyncConfig {
  sync: {
    search: string[];
    sessionIds?: string[];
    keywords?: string[];
    minParticipants?: number;
    requireSummary?: boolean;
    includeResponses?: boolean;
  };
  output: {
    dir?: string;
    filename?: string;
    template?: string;
  };
}

export interface TemplateData {
  topic: string;
  date: string;
  id: string;
  participant_count: number;
  status: string;
  goal: string;
  critical: string | null;
  context: string | null;
  summary: string | null;
  tags: string[];
  responses: boolean;
  participants: Array<{
    number: number;
    messages: Array<{ content: string }>;
  }>;
}

function formatDate(isoString: string): string {
  return isoString.split('T')[0];
}

function sanitizeForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function resolveFilename(template: string, data: { date: string; id: string; slug: string }): string {
  return template
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{id\}\}/g, data.id)
    .replace(/\{\{slug\}\}/g, data.slug);
}

function getExistingSessionIds(outputDir: string): Set<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    return new Set();
  }
  const files = fs.readdirSync(outputDir);
  const ids = new Set<string>();
  for (const file of files) {
    const match = file.match(/(hst_[a-f0-9]+)\.md$/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

function buildTemplateData(
  session: SessionDetail,
  summary: string | null,
  responses: ParticipantResponse[],
  matchedQueries: string[],
): TemplateData {
  const participants = responses
    .map((r, i) => ({
      number: i + 1,
      messages: r.messages
        .filter(m => m.role === 'user')
        .map(m => ({ content: m.content })),
    }))
    .filter(p => p.messages.length > 0);

  return {
    topic: session.topic,
    date: formatDate(session.created_at),
    id: session.id,
    participant_count: session.participant_count,
    status: session.status,
    goal: session.goal,
    critical: session.critical,
    context: session.context,
    summary,
    tags: matchedQueries,
    responses: participants.length > 0,
    participants,
  };
}

export async function sync(config: SyncConfig, configDir: string): Promise<void> {
  const apiKey = process.env.HARMONICA_API_KEY;
  if (!apiKey) {
    console.error('Error: HARMONICA_API_KEY environment variable is required.');
    console.error('Get your API key from the Harmonica dashboard (Settings → API Keys).');
    process.exit(1);
  }

  const apiUrl = process.env.HARMONICA_API_URL || 'https://app.harmonica.chat';
  const client = new HarmonicaClient(apiKey, apiUrl);

  const outputDir = path.resolve(configDir, config.output.dir || 'sessions');
  const filenameTemplate = config.output.filename || '{{date}}-{{id}}.md';
  const minParticipants = config.sync.minParticipants ?? 1;
  const requireSummary = config.sync.requireSummary ?? true;
  const includeResponses = config.sync.includeResponses ?? false;

  // Load template
  const templatePath = config.output.template
    ? path.resolve(configDir, config.output.template)
    : null;

  const existingIds = getExistingSessionIds(outputDir);
  console.log(`Found ${existingIds.size} existing sessions in ${path.relative(process.cwd(), outputDir) || outputDir}`);

  // Collect unique sessions across explicit IDs and search queries
  const sessionMap = new Map<string, { session: any; queries: string[] }>();

  // Explicit session IDs — fetch directly, no search ambiguity
  if (config.sync.sessionIds && config.sync.sessionIds.length > 0) {
    for (const id of config.sync.sessionIds) {
      if (existingIds.has(id)) continue;
      try {
        const session = await client.getSession(id);
        sessionMap.set(id, { session, queries: ['explicit'] });
      } catch (err: any) {
        console.warn(`Failed to fetch session ${id}: ${err.message}`);
      }
    }
    console.log(`Found ${sessionMap.size} sessions from explicit IDs`);
  }

  // Search queries — only if no explicit sessionIds provided
  if (!config.sync.sessionIds || config.sync.sessionIds.length === 0) {
    if (config.sync.search.length === 0) {
      console.error('Error: config must specify either "sessionIds" or "search" queries.');
      process.exit(1);
    }
    for (const query of config.sync.search) {
      for (const status of ['completed', 'active'] as const) {
        try {
          const result = await client.listSessions({ q: query, status, limit: 50 });
          for (const session of result.data) {
            const existing = sessionMap.get(session.id);
            if (existing) {
              if (!existing.queries.includes(query)) {
                existing.queries.push(query);
              }
            } else {
              sessionMap.set(session.id, { session, queries: [query] });
            }
          }
        } catch (err: any) {
          console.warn(`Search for "${query}" (${status}) failed: ${err.message}`);
        }
      }
    }
    console.log(`Found ${sessionMap.size} sessions matching search queries`);
  }

  // Filter to new sessions only
  const candidates = [...sessionMap.entries()].filter(([id]) => !existingIds.has(id));
  console.log(`${candidates.length} new candidates to process`);

  if (candidates.length === 0) {
    console.log('Nothing to sync.');
    return;
  }

  let synced = 0;

  for (const [id, { queries }] of candidates) {
    // Fetch full session details
    let details: SessionDetail;
    try {
      details = await client.getSession(id);
    } catch (err: any) {
      console.warn(`Failed to fetch session ${id}: ${err.message}`);
      continue;
    }

    // Post-search validation: verify the session text actually contains
    // at least one search query as a substring (API search is fuzzy and
    // returns false positives across the entire account)
    const sessionText = `${details.topic} ${details.goal} ${details.context || ''}`.toLowerCase();
    const matchedQuery = queries.includes('explicit') || queries.some(q =>
      q.toLowerCase().split(/\s+/).every(word => sessionText.includes(word))
    );
    if (!matchedQuery) {
      console.log(`Skipping: ${details.topic} (${id}) — search query not found in session text`);
      continue;
    }

    // Keyword relevance filter (all keywords must match as whole words)
    if (config.sync.keywords && config.sync.keywords.length > 0) {
      if (!config.sync.keywords.some(kw => {
        const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return re.test(sessionText);
      })) {
        console.log(`Skipping: ${details.topic} (${id}) — no keyword match`);
        continue;
      }
    }

    // Participant count filter
    if (details.participant_count < minParticipants) {
      console.log(`Skipping: ${details.topic} (${id}) — ${details.participant_count} participants (min: ${minParticipants})`);
      continue;
    }

    // Summary filter
    let summary: string | null = null;
    try {
      const summaryResult = await client.getSummary(id);
      summary = summaryResult.summary;
    } catch {
      // no summary available
    }

    if (requireSummary && !summary) {
      console.log(`Skipping: ${details.topic} (${id}) — no summary`);
      continue;
    }

    // Fetch responses only if explicitly opted in
    let responses: ParticipantResponse[] = [];
    if (includeResponses) {
      try {
        const responsesResult = await client.getResponses(id);
        responses = responsesResult.data;
      } catch {
        // responses unavailable, continue without them
      }
    }

    console.log(`Syncing: ${details.topic} (${id}) — ${details.participant_count} participants`);

    const templateData = buildTemplateData(details, summary, responses, queries);
    const markdown = await renderSession(templateData, templatePath);

    const filename = resolveFilename(filenameTemplate, {
      date: formatDate(details.created_at),
      id: details.id,
      slug: sanitizeForFilename(details.topic),
    });
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, markdown);
    console.log(`  Written: ${filename}`);
    synced++;
  }

  console.log(`Sync complete. ${synced} session${synced === 1 ? '' : 's'} synced.`);
}
