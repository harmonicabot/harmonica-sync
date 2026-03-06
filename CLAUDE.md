# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

CLI tool that syncs Harmonica deliberation sessions to templated markdown files. Published on npm as `harmonica-sync`. Users run `npx harmonica-sync` in CI or locally with a `harmonica.config.json` config file.

Part of the Harmonica ecosystem (github.com/harmonicabot).

## Commands

```bash
npm run build        # Compile TypeScript → dist/
node dist/cli.js     # Run locally (requires HARMONICA_API_KEY)
```

## Architecture

```
cli.ts → sync.ts → api.ts
                  → template.ts → templates/session-template.md
```

- **`cli.ts`** — Entry point and arg parsing (`--init`, `--config`, `--help`). Loads config, calls `sync()`.
- **`sync.ts`** — Core sync engine. Exports `SyncConfig` and `TemplateData` types. Pipeline: search API → filter by keywords/participants/summary → dedupe against output dir → fetch details + responses → render → write files.
- **`api.ts`** — HTTP client for Harmonica REST API v1. Adapted from `harmonica-mcp/src/client.ts` — only sync-relevant methods (listSessions, getSession, getResponses, getSummary).
- **`template.ts`** — Loads Mustache template from config path or built-in default, renders `TemplateData` to markdown.

## Key Design Decisions

- **Idempotent**: Scans output directory for existing `hst_*` session IDs in filenames to skip already-synced sessions.
- **Triple-brace Mustache**: Templates use `{{{var}}}` (unescaped) not `{{var}}` — output is markdown, not HTML. HTML escaping turns apostrophes into `&#39;`.
- **Both active and completed sessions**: Searches both statuses because Harmonica sessions may stay "active" even after generating a summary.
- **No runtime deps except `mustache`**: Uses native `fetch`.

## Environment Variables

- `HARMONICA_API_KEY` (required) — API key from Harmonica dashboard
- `HARMONICA_API_URL` (optional) — defaults to `https://app.harmonica.chat`

## Publishing

Package has 2FA enabled via Windows Hello. Bump version before publishing:

```bash
npm version patch
npm publish          # triggers Windows Hello prompt
```

## Roadmap

- **Research sync pipeline** — `--mode research` for complex projects where 1 session → many output files. Extract, map (LLM-assisted), reconcile (human-in-the-loop), compute metrics, render via templates. Canonical data file as source of truth. ([Design doc](docs/plans/2026-03-02-research-sync-pipeline.md))
- **Git repo as session context** — Feed repo content (previous sessions, workshop notes, artifacts, consensus) back into new Harmonica sessions as facilitator context. Closes the loop: sessions produce markdown → markdown informs future sessions. Config-driven context assembly in `harmonica.config.json` defines rules for what to send (e.g., "include all artifacts, last 3 workshops, latest consensus") and a `--context` flag pushes to the Session Context Sources API (HAR-94). Without this, communities must manually pick documents per session or write custom CI scripts.
- **Incremental updates (HAR-339)** — Re-sync changed sessions (by `updated_at` or response count) instead of skipping already-synced ones.
- **Webhook trigger (HAR-340)** — React to Harmonica webhooks instead of polling every 6 hours.
- **Auto-generate emerging consensus (HAR-338)** — Post-sync synthesis step that reads all content in the output directory, sends it to an LLM, and writes a consensus summary to a data file (e.g., `_data/consensus.yml`). Supports BYOM (Bring Your Own Model): Harmonica API by default, or community-provided LLM config in `harmonica.config.json`.

## Related

- `harmonica-mcp/` — MCP server (shares API client code)
- `needs-discovery/` — First consumer (NSRelaTech session archive, runs via GitHub Actions)
- `docs/plans/2026-02-24-harmonica-sync-design.md` — Original design doc
