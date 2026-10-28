// Obsidian [[wikilink]] extraction and resolution.

import { extname } from 'node:path';

// Remove code (fenced and inline) and HTML comments: links there are not real links.
function stripCode(text) {
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

// Return link targets ("page", "raw/2026/10/x", "image.png") in document order.
export function extractLinks(text) {
  const targets = [];
  for (const m of stripCode(text).matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    const target = m[1].split('|')[0].split('#')[0].replace(/\\$/, '').trim();
    if (target) targets.push(target.normalize('NFC'));
  }
  return targets;
}

// Index every vault file by name and path so links can be resolved the way
// Obsidian does: case-insensitive, by file name or by (partial) path.
export function buildResolver(relPaths) {
  const byName = new Map();
  const all = [];
  for (const rel of relPaths) {
    const lower = rel.toLowerCase();
    const isMd = lower.endsWith('.md');
    const key = isMd ? lower.slice(0, -3) : lower;
    all.push({ rel, key });
    const name = key.split('/').pop();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(rel);
  }

  return function resolve(target) {
    let key = target.toLowerCase();
    if (key.endsWith('.md')) key = key.slice(0, -3);
    if (!key.includes('/')) return byName.get(key)?.[0] ?? null;
    const hit = all.find((f) => f.key === key || f.key.endsWith(`/${key}`));
    return hit ? hit.rel : null;
  };
}

export function isMarkdownTarget(target) {
  const ext = extname(target).toLowerCase();
  return ext === '' || ext === '.md' || !/^\.[a-z0-9]{1,5}$/.test(ext);
}
