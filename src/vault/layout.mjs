// Fixed vault layout and file helpers shared by the vault commands.

import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';

export const PAGE_TYPES = ['主题', '项目', '生活', '思考'];
export const WIKI_DIRS = PAGE_TYPES;
export const TOP_LEVEL_DIRS = ['inbox', 'raw', '_templates', ...WIKI_DIRS];
export const SETTINGS_FILE = '我的设置.md';

export const REQUIRED_PAGE_FIELDS = ['type', 'title', 'summary', 'created', 'updated', 'sources', 'tags'];
export const REQUIRED_RAW_FIELDS = ['kind', 'title', 'captured', 'summary', 'body_sha256'];

// Characters that break Obsidian links.
export const FORBIDDEN_CHARS = /[\\/:*?"<>|#^[\]]/;
const FORBIDDEN_CHARS_G = /[\\/:*?"<>|#^[\]]/g;

const MAX_NAME_LENGTH = 50;

// Turn an arbitrary title into a safe file name (without extension).
export function sanitizeName(title) {
  const cleaned = String(title ?? '')
    .normalize('NFC')
    .replace(FORBIDDEN_CHARS_G, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  const chars = [...cleaned];
  const name = chars.length > MAX_NAME_LENGTH ? chars.slice(0, MAX_NAME_LENGTH).join('').trim() : cleaned;
  return name || '未命名';
}

// Vault-relative path with forward slashes, NFC-normalized (macOS returns NFD).
export function relPath(vault, file) {
  return relative(vault, file).split(sep).join('/').normalize('NFC');
}

export function stem(file) {
  return basename(file, extname(file)).normalize('NFC');
}

// Recursively list files, skipping dot-directories (.git, .obsidian, .claude, ...).
export async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

export async function listMarkdown(dir) {
  return (await walk(dir)).filter((p) => p.endsWith('.md'));
}

// Wiki pages live directly in the four page folders (no nesting).
export async function listPages(vault) {
  const pages = [];
  for (const type of WIKI_DIRS) {
    for (const file of await listMarkdown(join(vault, type))) {
      pages.push({ file, folder: type });
    }
  }
  return pages;
}

export async function readText(file) {
  return readFile(file, 'utf8');
}
