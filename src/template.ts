import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Mustache from 'mustache';
import type { TemplateData } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getDefaultTemplatePath(): string {
  // In dist/, look for ../templates/session-template.md
  const fromDist = path.resolve(__dirname, '..', 'templates', 'session-template.md');
  if (fs.existsSync(fromDist)) return fromDist;

  // Fallback for development (running from src/)
  const fromSrc = path.resolve(__dirname, '..', 'templates', 'session-template.md');
  return fromSrc;
}

export async function renderSession(data: TemplateData, templatePath?: string | null): Promise<string> {
  const resolvedPath = templatePath || getDefaultTemplatePath();

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Template file not found: ${resolvedPath}`);
  }

  const template = fs.readFileSync(resolvedPath, 'utf-8');
  return Mustache.render(template, data);
}
