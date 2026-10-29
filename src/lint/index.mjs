// kb lint: deterministic health checks (docs/TECH.md "索引与体检").
// error = must fix; warning = worth a look. "Zero errors" is the P1 bar.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { sha256 } from '../vault/file.mjs';
import { parseMarkdown } from '../vault/frontmatter.mjs';
import { buildIndex, INDEX_FILE } from '../vault/indexer.mjs';
import {
  FORBIDDEN_CHARS, REQUIRED_PAGE_FIELDS, REQUIRED_RAW_FIELDS, TOP_LEVEL_DIRS,
  listMarkdown, listPages, relPath, stem, walk,
} from '../vault/layout.mjs';
import { buildResolver, extractLinks } from '../vault/links.mjs';

export const MAX_PAGE_CHARS = 2000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const countChars = (text) => [...text.replace(/\s/g, '')].length;

// Bullets under "## 要点" in a topic page must each cite a raw source.
function pointsWithoutSource(body) {
  const section = body.match(/^## 要点[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) return [];
  return section[1]
    .split('\n')
    .filter((l) => /^\s*[-*+]\s+\S/.test(l))
    .filter((l) => !extractLinks(l).some((t) => t.toLowerCase().startsWith('raw/')))
    .map((l) => l.trim());
}

export async function lintVault(vault) {
  const issues = [];
  const add = (level, code, file, message, extra = {}) => issues.push({ level, code, file, message, ...extra });

  const allFiles = (await walk(vault)).map((f) => relPath(vault, f));
  const resolve = buildResolver(allFiles);
  const pages = await listPages(vault);

  // Folder layout: no extra top-level folders, no nesting inside page folders.
  for (const e of await readdir(vault, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !TOP_LEVEL_DIRS.includes(e.name.normalize('NFC'))) {
      add('warning', 'unknown_folder', e.name, `Folder "${e.name}" is not part of the fixed layout`);
    }
  }
  for (const { file, folder } of pages) {
    if (dirname(file) !== join(vault, folder)) {
      add('warning', 'unknown_folder', relPath(vault, dirname(file)), 'Page folders must not contain subfolders');
    }
  }

  // Same page name in two folders makes [[name]] ambiguous.
  const seen = new Map();
  for (const { file } of pages) {
    const key = stem(file).toLowerCase();
    if (seen.has(key)) {
      add('error', 'duplicate_name', relPath(vault, file), `Same page name as ${seen.get(key)}`);
    } else {
      seen.set(key, relPath(vault, file));
    }
  }

  const inbound = new Map(pages.map(({ file }) => [relPath(vault, file), 0]));

  for (const { file, folder } of pages) {
    const rel = relPath(vault, file);
    const text = await readFile(file, 'utf8');
    if (FORBIDDEN_CHARS.test(stem(file))) add('error', 'forbidden_filename', rel, 'File name contains a character that breaks links');

    let parsed;
    try {
      parsed = parseMarkdown(text);
    } catch (err) {
      add('error', 'invalid_frontmatter', rel, err.message);
      continue;
    }
    const { data, body, hasFrontmatter } = parsed;
    if (!hasFrontmatter) {
      add('error', 'missing_frontmatter', rel, 'Page has no frontmatter');
    } else {
      const missing = REQUIRED_PAGE_FIELDS.filter((f) => !(f in data) || (f !== 'summary' && isEmpty(data[f])));
      if (missing.length) add('error', 'missing_field', rel, `Missing frontmatter: ${missing.join(', ')}`, { fields: missing });
      if (!isEmpty(data.type) && data.type !== folder) {
        add('error', 'wrong_type', rel, `type is "${data.type}" but the page is in ${folder}/`);
      }
      for (const f of ['created', 'updated']) {
        if (!isEmpty(data[f]) && !DATE.test(String(data[f]))) add('error', 'invalid_date', rel, `${f} must be YYYY-MM-DD`);
      }
      for (const f of ['sources', 'tags']) {
        if (f in data && !Array.isArray(data[f])) add('error', 'invalid_field', rel, `${f} must be a list`);
      }
      if (isEmpty(data.summary)) add('warning', 'empty_summary', rel, 'summary is empty; index.md will show no description');
    }

    if (folder === '主题') {
      for (const line of pointsWithoutSource(body)) {
        add('error', 'point_without_source', rel, `Point without a raw/ source: ${line}`);
      }
    }

    for (const target of extractLinks(text)) {
      const hit = resolve(target);
      if (!hit) add('error', 'dead_link', rel, `Link target not found: [[${target}]]`, { target });
      else if (hit !== rel && inbound.has(hit)) inbound.set(hit, inbound.get(hit) + 1);
    }

    if (countChars(body) > MAX_PAGE_CHARS) {
      add('warning', 'too_long', rel, `Page is over ${MAX_PAGE_CHARS} characters; consider splitting`);
    }
  }

  for (const [rel, count] of inbound) {
    if (count === 0) add('warning', 'orphan', rel, 'No other page links here');
  }

  // index.md must match what kb index would generate.
  const indexFile = join(vault, INDEX_FILE);
  const current = existsSync(indexFile) ? await readFile(indexFile, 'utf8') : null;
  const { text: expected } = await buildIndex(vault);
  if (current !== expected) add('error', 'index_stale', INDEX_FILE, 'index.md is out of date; run kb index');
  if (current) {
    for (const target of extractLinks(current)) {
      if (!resolve(target)) add('error', 'dead_link', INDEX_FILE, `Link target not found: [[${target}]]`, { target });
    }
  }

  // raw/: complete frontmatter, untouched bodies, safe names.
  for (const file of await listMarkdown(join(vault, 'raw'))) {
    const rel = relPath(vault, file);
    if (FORBIDDEN_CHARS.test(stem(file))) add('error', 'forbidden_filename', rel, 'File name contains a character that breaks links');
    let parsed;
    try {
      parsed = parseMarkdown(await readFile(file, 'utf8'));
    } catch (err) {
      add('error', 'invalid_frontmatter', rel, err.message);
      continue;
    }
    const { data, body } = parsed;
    const missing = REQUIRED_RAW_FIELDS.filter((f) => isEmpty(data[f]));
    if (missing.length) add('error', 'missing_field', rel, `Missing frontmatter: ${missing.join(', ')}`, { fields: missing });
    if (!isEmpty(data.body_sha256) && data.body_sha256 !== sha256(body)) {
      add('error', 'raw_modified', rel, 'raw/ body changed after filing (hash mismatch)');
    }
  }

  // iCloud conflict copies: "name 2.md" next to "name.md".
  for (const rel of allFiles) {
    const m = basename(rel).match(/^(.+) \d+(\.[^.]+)$/);
    if (m && allFiles.includes(join(dirname(rel), m[1] + m[2]).split('\\').join('/'))) {
      add('warning', 'conflict_copy', rel, `Looks like an iCloud conflict copy of ${m[1]}${m[2]}; merge and delete it`);
    }
  }

  // The shared state file can get iCloud conflict copies too ("state 2.json").
  try {
    for (const name of await readdir(join(vault, '.kb'))) {
      if (/^state \d+\.json$/.test(name)) {
        add('warning', 'conflict_copy', `.kb/${name}`, 'Conflict copy of the processing state: two computers processed at the same time; keep .kb/state.json and delete this copy');
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const order = { error: 0, warning: 1 };
  issues.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || a.code.localeCompare(b.code));
  const errors = issues.filter((i) => i.level === 'error').length;
  return { errors, warnings: issues.length - errors, clean: errors === 0, issues };
}
