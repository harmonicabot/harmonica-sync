# Session Context Sources

**Date:** 2026-03-05
**Status:** Design approved
**Linear:** HAR-94 (parent), HAR-82 (MCP delivery)

## Problem

Hosts need to enrich sessions with external knowledge so participants can react to and build on existing work. The current `context` field is a single free-text string with no structure, no multi-source support, and no live updates.

## Use case: Scenius cross-pollination

The Sensemaking Scenius community runs Harmonica sessions, live workshops, and writes proposals. They want a cross-pollination session where participants react to the collective body of work — and as source sessions get new responses, the facilitator's context stays current.

## Design

### Two source types (MVP)

1. **Harmonica session** — reference another session by ID. Pulls latest summary + responses from the database on each facilitator interaction. Auto-updates as the source session evolves.

2. **Markdown document** — free-text markdown with a title. Covers workshop notes, proposals, meeting summaries — anything not in Harmonica.

### Data model

New `session_context_sources` table:

```sql
CREATE TABLE session_context_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES host_sessions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('session', 'document')),
  source_ref TEXT,          -- for session type: source session ID
  title TEXT NOT NULL,
  content TEXT,             -- for document type: markdown content
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_context_sources_session ON session_context_sources(session_id);
```

- `source_type = 'session'`: `source_ref` = session ID, `content` = null (fetched live)
- `source_type = 'document'`: `source_ref` = null, `content` = markdown text

### Context flow into facilitation

In the facilitator's LLM call path (`monicaSingleSession.ts` or Pro equivalent):

1. Fetch all context sources for the session
2. For `session` sources: pull current summary from DB (use summary, not raw responses)
3. For `document` sources: use stored content
4. Truncate each source to ~2000 tokens, total budget ~8000 tokens
5. Inject as a context block in the system prompt, after facilitation instructions, before conversation history:

```
## Session Context Sources

### Community Application Brainstorming (session: hst_206730127f33)
[Latest summary]

### TG Restructuring Proposal (document)
[Markdown content]
```

6. Add instruction: "You have access to context sources below. Reference them naturally when relevant to the participant's responses. Do not dump context unprompted."

### Token budget

Each source: ~2000 tokens max. Total context sources budget: ~8000 tokens. For session sources with long summaries, truncate to fit. HAR-134 (context engineering with token budgets) is the long-term solution.

### API

New endpoints on `/api/v1/sessions/{id}/context-sources`:

```
POST   /  — add a context source
GET    /  — list all context sources for the session
DELETE /{source_id} — remove a context source
```

**Create session source:**
```json
POST /api/v1/sessions/{session_id}/context-sources
{
  "source_type": "session",
  "source_ref": "hst_206730127f33",
  "title": "Community Application Brainstorming"
}
```

**Create document source:**
```json
POST /api/v1/sessions/{session_id}/context-sources
{
  "source_type": "document",
  "title": "TG Restructuring Proposal",
  "content": "## Background\n\nAs the Scenius Telegram community..."
}
```

**Response:**
```json
{
  "id": "uuid",
  "session_id": "hst_xxx",
  "source_type": "session",
  "source_ref": "hst_206730127f33",
  "title": "Community Application Brainstorming",
  "content": null,
  "created_at": "2026-03-05T...",
  "updated_at": "2026-03-05T..."
}
```

### MCP tools

- `add_context_source(session_id, source_type, title, source_ref?, content?)` — add a session or document source
- `list_context_sources(session_id)` — list sources for a session
- `remove_context_source(session_id, source_id)` — remove a source

### UI

Session creation form: new optional step "Add context sources."

- **Add session** — search/autocomplete existing sessions, or paste a session ID
- **Add document** — title field + markdown textarea
- List of added sources with remove buttons
- Also accessible from session settings (hosts can add/remove post-creation)

No participant-facing UI changes. Context is background knowledge for the facilitator only.

### Scenius workflow example

1. Create session: "Scenius Cross-Pollination — React to our collective progress"
2. Add context source: session `hst_206730127f33` (brainstorming)
3. Add context source: document "TG Restructuring Proposal" (markdown)
4. Add context source: document "Mar 4 Workshop — Platform Integration" (markdown)
5. As the brainstorming session gets new responses, the cross-pollination facilitator reflects the latest state automatically
6. GitHub Action can automate adding document sources by calling the API after harmonica-sync runs

### harmonica-sync integration (post-MVP)

The API covers the receiving side, but communities still need to decide *what* to send and *when*. Without automation, hosts must manually attach documents to each session or write custom CI scripts.

`harmonica-sync` can close this gap with config-driven context assembly:

```json
{
  "context": {
    "target_session": "hst_xxx",
    "sources": [
      { "type": "glob", "pattern": "_artifacts/*.md", "limit": 10 },
      { "type": "glob", "pattern": "_workshops/*.md", "limit": 3 },
      { "type": "file", "path": "_data/consensus.yml" }
    ]
  }
}
```

A `--context` flag would assemble matching repo content and push it as document sources via the API. This closes the loop: sessions produce markdown → `harmonica-sync` writes to repo → repo content feeds back into future sessions.

Rules could include glob patterns, recency limits, file size caps, and tag filters — so a community can say "include all artifacts and the last 3 workshop summaries" without manual intervention.

### What's NOT in MVP

- URL fetching (auto-scrape webpages)
- File uploads (PDFs, docs via Vercel Blob)
- Connected services (Notion, Google Docs, Slack)
- MCP server knowledge bases
- Vector DB / RAG for large context (HAR-95)
- Participant-visible context (side panel, references)

### Related Linear issues

- **HAR-94** — Session Knowledge Management (parent story)
- **HAR-82** — Inbound Context via MCP
- **HAR-95** — Vector DB / RAG
- **HAR-134** — Context engineering with token budgets
- **HAR-17** — HARMONICA.md context injection (in progress)
- **HAR-11** — Context injection from previous sessions (canceled, superseded by this)
