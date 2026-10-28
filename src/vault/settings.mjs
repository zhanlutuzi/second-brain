// Read 我的设置.md; fall back to defaults for anything missing.

import { join } from 'node:path';
import { parseMarkdown } from './frontmatter.mjs';
import { SETTINGS_FILE, readText } from './layout.mjs';

export const DEFAULT_SETTINGS = {
  feishu_chat_id: '',
  reaction_ok: 'OK',
  reaction_failed: 'CRY',
  browser_domains: ['mp.weixin.qq.com'],
  browser_headless: true,
  projects: [],
  life_categories: [],
  batch_limit: 30,
  lint_interval_days: 30,
};

export async function readSettings(vault) {
  try {
    const { data } = parseMarkdown(await readText(join(vault, SETTINGS_FILE)));
    const merged = { ...DEFAULT_SETTINGS };
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') merged[key] = value;
    }
    return merged;
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    throw err;
  }
}
