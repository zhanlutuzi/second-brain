// kb file: move an inbox entry into raw/YYYY/MM/ (see docs/TECH.md "入库编译").

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { queueReaction } from '../feishu/react.mjs';
import { datePart, localDate } from '../util/date.mjs';
import { parseMarkdown, stringifyMarkdown } from './frontmatter.mjs';
import { listMarkdown, relPath, sanitizeName, stem } from './layout.mjs';

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());
const unlink2 = (v) => (typeof v === 'string' ? v.replace(/^\[\[(.*?)(\|.*)?\]\]$/, '$1') : v);

export function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/#.*$/, '').replace(/\/+$/, '');
}

// Bring Web Clipper output and hand-dropped files into the inbox entry shape.
export function normalizeEntry(data, body) {
  const d = { ...data };
  if (isUrl(d.source)) {
    d.url ??= d.source.trim();
    d.source = 'clipper';
  }
  if (!d.source) d.source = 'clipper';
  if (Array.isArray(d.author)) d.author = d.author.map(unlink2).join(', ');
  else if (d.author) d.author = unlink2(d.author);
  if (!d.kind) d.kind = d.url ? 'link' : body.trim() ? 'file' : 'thought';
  return d;
}

function firstHeading(body) {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function firstLine(body, max = 30) {
  const line = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return [...line].slice(0, max).join('');
}

export function deriveTitle(data, body, fallback) {
  if (data.title) return String(data.title);
  const heading = firstHeading(body);
  if (heading) return heading;
  if (data.kind !== 'link' && firstLine(body)) return firstLine(body);
  if (data.url) {
    try {
      const u = new URL(data.url);
      return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`;
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

// Key order of the raw frontmatter: inbox fields, then the fields filing adds.
const ORDER = [
  'source', 'message_id', 'sent_at', 'kind', 'url', 'note', 'fetch_status', 'fetch_error',
  'attachment', 'title', 'author', 'published', 'site', 'captured', 'summary', 'body_sha256',
];

function ordered(data) {
  const out = {};
  for (const k of ORDER) if (k in data) out[k] = data[k];
  for (const [k, v] of Object.entries(data)) if (!(k in out)) out[k] = v;
  return out;
}

// Entries with a URL are duplicates when the URL matches (one message can carry
// several links); entries without one are matched by message_id.
async function findDuplicate(vault, { url, message_id: messageId }) {
  const wantUrl = normalizeUrl(url);
  for (const file of await listMarkdown(join(vault, 'raw'))) {
    let data;
    try {
      ({ data } = parseMarkdown(await readFile(file, 'utf8')));
    } catch {
      continue;
    }
    if (wantUrl) {
      if (normalizeUrl(data.url) === wantUrl) return file;
    } else if (messageId && data.message_id === messageId && !data.url) {
      return file;
    }
  }
  return null;
}

function uniquePath(dir, name, ext = '.md') {
  let candidate = join(dir, `${name}${ext}`);
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${name}-${i}${ext}`);
  return candidate;
}

// Move an entry's attachment from inbox/ to raw/assets/ and fix the embed.
async function moveAttachment(vault, entryFile, data, body) {
  if (!data.attachment) return { data, body };
  const src = join(dirname(entryFile), basename(String(data.attachment)));
  if (!existsSync(src)) return { data, body };
  const name = basename(src);
  const ext = extname(name);
  const assets = join(vault, 'raw', 'assets');
  await mkdir(assets, { recursive: true });
  const target = uniquePath(assets, name.slice(0, name.length - ext.length), ext);
  await rename(src, target);
  const newName = basename(target);
  return {
    data: { ...data, attachment: `raw/assets/${newName}` },
    body: newName === name ? body : body.split(`[[${name}]]`).join(`[[${newName}]]`),
  };
}

const rawLink = (vault, file) => `[[${relPath(vault, file).replace(/\.md$/, '')}]]`;

export async function fileEntry(vault, entry, { title, summary, now = new Date(), env = process.env } = {}) {
  const file = isAbsolute(entry) ? entry : resolve(vault, entry);
  const rel = relPath(vault, file);
  if (!rel.startsWith('inbox/') || !rel.endsWith('.md')) {
    return { ok: false, error: 'not_in_inbox', message: `${rel} is not a Markdown file in inbox/` };
  }
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, error: 'not_found', message: `${rel} does not exist` };
    throw err;
  }

  const parsed = parseMarkdown(text);
  const data = normalizeEntry(parsed.data, parsed.body);
  let { body } = parsed;

  if (data.fetch_status === 'failed') {
    return { ok: false, error: 'fetch_failed', message: `${rel}: fetch failed (${data.fetch_error || 'unknown'}); clip it manually`, entry: rel };
  }
  if (data.kind === 'link' && !body.trim()) {
    return { ok: false, error: 'not_fetched', message: `${rel}: link has no content yet; run kb fetch first`, entry: rel };
  }

  const dup = await findDuplicate(vault, data);
  if (dup) {
    await unlink(file);
    if (data.attachment) await unlink(join(dirname(file), basename(String(data.attachment)))).catch(() => {});
    if (data.source === 'feishu' && data.message_id) await queueReaction(vault, data.message_id, env);
    return { ok: true, duplicate: true, entry: rel, path: relPath(vault, dup), link: rawLink(vault, dup) };
  }

  let fields = data;
  ({ data: fields, body } = await moveAttachment(vault, file, data, body));

  const captured = datePart(data.captured) ?? datePart(data.sent_at) ?? datePart(data.created) ?? localDate(now);
  const finalTitle = String(title ?? deriveTitle(data, body, stem(file))).trim();
  const out = ordered({
    ...fields,
    title: finalTitle,
    captured,
    summary: summary ?? data.summary ?? '',
    body_sha256: sha256(body),
  });

  const [year, month] = captured.split('-');
  const dir = join(vault, 'raw', year, month);
  await mkdir(dir, { recursive: true });
  const target = uniquePath(dir, sanitizeName(`${captured}-${finalTitle}`));
  await writeFile(target, stringifyMarkdown(out, body), { encoding: 'utf8', flag: 'wx' });
  await unlink(file);
  if (out.source === 'feishu' && out.message_id) await queueReaction(vault, out.message_id, env);

  return {
    ok: true,
    duplicate: false,
    entry: rel,
    kind: out.kind,
    title: finalTitle,
    path: relPath(vault, target),
    link: rawLink(vault, target),
    name: basename(target),
  };
}
