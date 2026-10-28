// kb status: what the inbox skill needs to know before it starts.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readState } from '../state.mjs';
import { daysBetween, localDate } from '../util/date.mjs';
import { parseMarkdown } from './frontmatter.mjs';
import { listPages, relPath, stem, walk } from './layout.mjs';
import { deriveTitle, normalizeEntry } from './file.mjs';
import { readSettings } from './settings.mjs';

export async function inboxEntries(vault) {
  const files = await walk(join(vault, 'inbox'));
  const entries = [];
  const attachments = [];
  for (const file of files) {
    if (!file.endsWith('.md')) {
      attachments.push(relPath(vault, file));
      continue;
    }
    const rel = relPath(vault, file);
    try {
      const { data: rawData, body } = parseMarkdown(await readFile(file, 'utf8'));
      const data = normalizeEntry(rawData, body);
      entries.push({
        path: rel,
        kind: data.kind,
        source: data.source,
        message_id: data.message_id ?? null,
        title: deriveTitle(data, body, stem(file)),
        url: data.url ?? null,
        sent_at: String(data.sent_at ?? data.created ?? ''),
        fetch_status: data.fetch_status ?? null,
        needs_fetch: data.kind === 'link' && !body.trim() && data.fetch_status !== 'failed',
      });
    } catch (err) {
      entries.push({ path: rel, kind: 'unknown', error: err.message, sent_at: '' });
    }
  }
  entries.sort((a, b) => a.sent_at.localeCompare(b.sent_at) || a.path.localeCompare(b.path));
  return { entries, attachments };
}

export async function vaultStatus(vault, env = process.env, now = new Date()) {
  const settings = await readSettings(vault);
  const state = await readState(env);
  const { entries, attachments } = await inboxEntries(vault);
  const pages = await listPages(vault);
  const today = localDate(now);

  const lastLint = state.last_lint ?? null;
  const daysSinceLint = lastLint ? daysBetween(lastLint, today) : null;
  const lintDue = lastLint ? daysSinceLint > settings.lint_interval_days : pages.length > 0;

  return {
    ok: true,
    today,
    inbox: {
      pending: entries.length,
      failed: entries.filter((e) => e.fetch_status === 'failed').length,
      needs_fetch: entries.filter((e) => e.needs_fetch).length,
      entries,
      attachments,
    },
    pages: pages.length,
    batch_limit: settings.batch_limit,
    last_lint: lastLint,
    days_since_lint: daysSinceLint,
    lint_due: lintDue,
    pending_question: state.pending_question ?? null,
    settings: {
      projects: settings.projects,
      life_categories: settings.life_categories,
      lint_interval_days: settings.lint_interval_days,
    },
  };
}
