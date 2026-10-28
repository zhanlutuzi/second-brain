// kb fetch: fill an inbox link entry with the article body (docs/TECH.md "链接抓取").
// Level 1 direct request → level 2 real browser → mark failed for manual clipping.

import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { paths } from '../state.mjs';
import { parseMarkdown, stringifyMarkdown } from '../vault/frontmatter.mjs';
import { relPath } from '../vault/layout.mjs';
import { BrowserUnavailable, fetchWithBrowser } from './browser.mjs';
import { fetchDirect } from './direct.mjs';
import { extractArticle, judge } from './extract.mjs';

export function useBrowserFirst(url, domains = []) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => {
    const domain = String(d).toLowerCase().replace(/^\*?\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  });
}

async function attempt(level, url, get) {
  let page;
  try {
    page = await get(url);
  } catch (err) {
    if (err instanceof BrowserUnavailable) return { level, reason: 'browser_unavailable', detail: err.message };
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'network_error';
    return { level, reason, detail: err.message };
  }
  if (page.status < 200 || page.status >= 300) return { level, reason: `http_${page.status}` };
  const article = await extractArticle(page.html, page.finalUrl ?? url);
  const reason = judge(article);
  return reason ? { level, reason } : { level, article };
}

export async function fetchEntry(vault, entry, { settings, env = process.env, fetch, browser } = {}) {
  const file = isAbsolute(entry) ? entry : resolve(vault, entry);
  const rel = relPath(vault, file);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, error: 'not_found', message: `${rel} does not exist` };
    throw err;
  }
  const { data, body } = parseMarkdown(text);
  if (data.kind !== 'link' || !data.url) {
    return { ok: false, error: 'not_a_link', message: `${rel} is not a link entry (kind: ${data.kind ?? 'none'})` };
  }
  if (data.fetch_status === 'ok' && body.trim()) return { ok: true, status: 'ok', already: true, path: rel };

  const direct = (url) => fetchDirect(url, { fetch });
  const viaBrowser = browser ?? ((url) => fetchWithBrowser(url, { profileDir: paths(env).browser, headless: settings.browser_headless !== false }));

  const levels = useBrowserFirst(data.url, settings.browser_domains) ? [['browser', viaBrowser]] : [['direct', direct], ['browser', viaBrowser]];
  const failures = [];
  let success = null;
  for (const [level, get] of levels) {
    const r = await attempt(level, data.url, get);
    if (r.article) {
      success = r;
      break;
    }
    failures.push(r);
  }

  if (!success) {
    const fetchError = failures.map((f) => `${f.level}: ${f.reason}`).join('; ');
    await writeFile(file, stringifyMarkdown({ ...data, fetch_status: 'failed', fetch_error: fetchError }, body), 'utf8');
    return { ok: true, status: 'failed', path: rel, url: data.url, reason: fetchError, details: failures.filter((f) => f.detail).map((f) => `${f.level}: ${f.detail}`) };
  }

  const { article } = success;
  const out = { ...data, fetch_status: 'ok', fetch_error: '' };
  for (const key of ['title', 'author', 'published', 'site']) if (article[key] && !data[key]) out[key] = article[key];
  await writeFile(file, stringifyMarkdown(out, `${article.markdown}\n`), 'utf8');
  return { ok: true, status: 'ok', method: success.level, path: rel, title: out.title ?? '', chars: article.markdown.length };
}
