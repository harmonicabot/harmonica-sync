#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sync, type SyncConfig } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STARTER_CONFIG: SyncConfig = {
  sync: {
    search: ['your search query here'],
    keywords: ['optional', 'relevance', 'keywords'],
    minParticipants: 1,
    requireSummary: true,
  },
  output: {
    dir: 'sessions',
    filename: '{{date}}-{{id}}.md',
    template: './session-template.md',
  },
};

function printUsage(): void {
  console.log(`
harmonica-sync — Sync Harmonica sessions to markdown files

Usage:
  npx harmonica-sync                     # sync using ./harmonica.config.json
  npx harmonica-sync --config path/to    # use custom config path
  npx harmonica-sync --init              # generate starter config + template
  npx harmonica-sync --help              # show this help

Environment variables:
  HARMONICA_API_KEY  (required)  API key from Harmonica dashboard
  HARMONICA_API_URL  (optional)  defaults to https://app.harmonica.chat
`.trim());
}

function runInit(): void {
  const configPath = path.resolve('harmonica.config.json');
  const templatePath = path.resolve('session-template.md');

  if (fs.existsSync(configPath)) {
    console.error(`Error: ${configPath} already exists. Remove it first if you want to reinitialize.`);
    process.exit(1);
  }

  // Write starter config
  fs.writeFileSync(configPath, JSON.stringify(STARTER_CONFIG, null, 2) + '\n');
  console.log(`Created: harmonica.config.json`);

  // Copy default template
  if (!fs.existsSync(templatePath)) {
    const defaultTemplate = path.resolve(__dirname, '..', 'templates', 'session-template.md');
    if (fs.existsSync(defaultTemplate)) {
      fs.copyFileSync(defaultTemplate, templatePath);
    } else {
      // Fallback: write a minimal template
      fs.writeFileSync(templatePath, `---
title: "{{topic}}"
date: {{date}}
session_id: {{id}}
participants: {{participant_count}}
status: {{status}}
---

# {{topic}}

**Goal:** {{goal}}

{{#summary}}
## Summary

{{summary}}
{{/summary}}
`);
    }
    console.log(`Created: session-template.md`);
  } else {
    console.log(`Skipped: session-template.md (already exists)`);
  }

  console.log(`
Setup complete! Next steps:

  1. Edit harmonica.config.json with your search queries
  2. Set your API key: export HARMONICA_API_KEY=hm_live_...
  3. Run: npx harmonica-sync
`);
}

function loadConfig(configPath: string): SyncConfig {
  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    console.error(`Run 'npx harmonica-sync --init' to create one.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`Invalid JSON in config file: ${configPath}`);
    process.exit(1);
  }

  if (!parsed.sync?.search || !Array.isArray(parsed.sync.search) || parsed.sync.search.length === 0) {
    console.error(`Config must have sync.search as a non-empty array of search queries.`);
    process.exit(1);
  }

  return parsed as SyncConfig;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  if (args.includes('--init')) {
    runInit();
    return;
  }

  // Determine config path
  let configPath = path.resolve('harmonica.config.json');
  const configIdx = args.indexOf('--config');
  if (configIdx !== -1) {
    const configArg = args[configIdx + 1];
    if (!configArg) {
      console.error('Error: --config requires a path argument.');
      process.exit(1);
    }
    configPath = path.resolve(configArg);
  }

  const config = loadConfig(configPath);
  const configDir = path.dirname(configPath);

  await sync(config, configDir);
}

main().catch(err => {
  console.error('Sync failed:', err.message || err);
  process.exit(1);
});
