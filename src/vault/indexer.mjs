// kb index: regenerate index.md from wiki page frontmatter (docs/TECH.md "索引与体检").

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseMarkdown } from './frontmatter.mjs';
import { PAGE_TYPES, listPages, stem } from './layout.mjs';

export const INDEX_FILE = 'index.md';

const HEADER = [
  '# 总目录',
  '',
  '> 本文件由 `kb index` 根据各页面的属性自动生成，请不要手动编辑。',
  '',
];

export async function collectPages(vault) {
  const pages = [];
  for (const { file, folder } of await listPages(vault)) {
    let data = {};
    try {
      ({ data } = parseMarkdown(await readFile(file, 'utf8')));
    } catch {
      /* broken frontmatter is reported by kb lint; still list the page */
    }
    pages.push({
      file,
      folder,
      name: stem(file),
      type: PAGE_TYPES.includes(data.type) ? data.type : folder,
      summary: typeof data.summary === 'string' ? data.summary.trim() : '',
      updated: typeof data.updated === 'string' ? data.updated : '',
    });
  }
  return pages;
}

export function renderIndex(pages) {
  const lines = [...HEADER];
  if (pages.length === 0) {
    lines.push('暂无页面。', '');
    return lines.join('\n');
  }
  lines.push(`共 ${pages.length} 个页面，按更新时间倒序排列。`, '');
  for (const type of PAGE_TYPES) {
    const group = pages
      .filter((p) => p.type === type)
      .sort((a, b) => b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name));
    if (group.length === 0) continue;
    lines.push(`## ${type}（${group.length}）`, '');
    for (const p of group) {
      const parts = [`[[${p.name}]]`];
      if (p.summary) parts.push(p.summary);
      if (p.updated) parts.push(p.updated);
      lines.push(`- ${parts.join(' · ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function buildIndex(vault) {
  const pages = await collectPages(vault);
  return { pages, text: renderIndex(pages) };
}

export async function writeIndex(vault) {
  const { pages, text } = await buildIndex(vault);
  const file = join(vault, INDEX_FILE);
  let current = null;
  try {
    current = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (current !== text) await writeFile(file, text, 'utf8');
  const byType = Object.fromEntries(PAGE_TYPES.map((t) => [t, pages.filter((p) => p.type === t).length]));
  return { pages: pages.length, by_type: byType, changed: current !== text };
}
