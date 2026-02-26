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

## Related

- `harmonica-mcp/` — MCP server (shares API client code)
- `needs-discovery/` — First consumer (NSRelaTech session archive, runs via GitHub Actions)
- `harmonica-mcp/docs/plans/2026-02-24-harmonica-sync-design.md` — Original design doc
