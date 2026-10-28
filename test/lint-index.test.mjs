import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lintVault } from '../src/lint/index.mjs';
import { fileEntry } from '../src/vault/file.mjs';
import { renderIndex, writeIndex } from '../src/vault/indexer.mjs';
import { get, makeVault, page, put } from './helpers.mjs';

let v;
beforeEach(async () => {
  v = await makeVault();
});
afterEach(() => v.cleanup());

const codes = (result, level) => result.issues.filter((i) => !level || i.level === level).map((i) => i.code);

async function fileOne(name = 'a', title = '来源') {
  await put(v.vault, `inbox/${name}.md`, `---\nsent_at: 2026-10-28T09:00:00+08:00\ntitle: ${title}\n---\n正文\n`);
  return fileEntry(v.vault, `inbox/${name}.md`, { summary: '摘要' });
}

describe('kb index', () => {
  it('renders the empty template index exactly', async () => {
    expect(await get(v.vault, 'index.md')).toBe(renderIndex([]));
  });

  it('groups pages by type, newest first, and is stable', async () => {
    await put(v.vault, '主题/旧.md', page({ title: '旧', summary: '旧页面', updated: '2026-10-01' }));
    await put(v.vault, '主题/新.md', page({ title: '新', summary: '新页面', updated: '2026-10-20' }));
    await put(v.vault, '项目/项目甲.md', page({ type: '项目', summary: '' }));
    const r = await writeIndex(v.vault);
    expect(r).toMatchObject({ pages: 3, changed: true, by_type: { 主题: 2, 项目: 1, 生活: 0, 思考: 0 } });
    const text = await get(v.vault, 'index.md');
    expect(text).toContain('## 主题（2）\n\n- [[新]] · 新页面 · 2026-10-20\n- [[旧]] · 旧页面 · 2026-10-01\n');
    expect(text).toContain('## 项目（1）\n\n- [[项目甲]] · 2026-10-28\n');
    expect(text).not.toContain('## 生活');
    expect((await writeIndex(v.vault)).changed).toBe(false);
  });
});

describe('kb lint', () => {
  it('passes on the untouched template', async () => {
    const r = await lintVault(v.vault);
    expect(r).toMatchObject({ errors: 0, warnings: 0, clean: true });
  });

  it('passes on a well-formed vault', async () => {
    const raw = await fileOne();
    await put(v.vault, '主题/甲.md', page({ title: '甲', sources: [raw.link] }, `# 甲\n\n## 一句话\nx\n\n## 要点\n- 要点（${raw.link}）\n\n## 我的看法\n\n## 相关\n[[乙]]\n`));
    await put(v.vault, '主题/乙.md', page({ title: '乙' }, '## 相关\n[[甲]]\n'));
    await writeIndex(v.vault);
    const r = await lintVault(v.vault);
    expect(r.issues).toEqual([]);
  });

  it('reports dead links, but ignores links in code', async () => {
    await put(v.vault, '主题/甲.md', page({ sources: ['[[raw/2026/10/不存在]]'] }, '[[不存在的页面]] [[甲|别名]] [[甲#小节]]\n`[[代码里]]`\n```\n[[代码块里]]\n```\n'));
    await writeIndex(v.vault);
    const dead = (await lintVault(v.vault)).issues.filter((i) => i.code === 'dead_link').map((i) => i.target);
    expect(dead.sort()).toEqual(['raw/2026/10/不存在', '不存在的页面']);
  });

  it('requires frontmatter fields, valid dates and a matching type', async () => {
    await put(v.vault, '主题/无属性.md', '# 没有属性\n');
    await put(v.vault, '主题/缺字段.md', '---\ntype: 主题\ntitle: x\n---\n');
    await put(v.vault, '生活/错类型.md', page({ type: '主题', created: '10/28' }));
    await writeIndex(v.vault);
    const r = await lintVault(v.vault);
    expect(codes(r, 'error').sort()).toEqual(['invalid_date', 'missing_field', 'missing_frontmatter', 'wrong_type']);
  });

  it('requires every point on a topic page to cite raw/', async () => {
    const raw = await fileOne();
    await put(v.vault, '主题/甲.md', page({}, `## 要点\n- 有来源（${raw.link}）\n- 没有来源\n- 只链到页面 [[甲]]\n\n## 我的看法\n- 原话不需要来源\n`));
    await writeIndex(v.vault);
    const r = await lintVault(v.vault);
    expect(r.issues.filter((i) => i.code === 'point_without_source')).toHaveLength(2);
  });

  it('detects modified raw bodies and incomplete raw frontmatter', async () => {
    const raw = await fileOne();
    await put(v.vault, raw.path, (await get(v.vault, raw.path)).replace('正文', '改过的正文'));
    await put(v.vault, 'raw/2026/10/手放的.md', '没有属性\n');
    const r = await lintVault(v.vault);
    expect(codes(r, 'error').sort()).toEqual(['missing_field', 'raw_modified']);
  });

  it('flags a stale index, duplicate names and unsafe file names', async () => {
    await put(v.vault, '主题/同名.md', page());
    await put(v.vault, '生活/同名.md', page({ type: '生活' }));
    await put(v.vault, '主题/C#笔记.md', page());
    const r = await lintVault(v.vault);
    expect(new Set(codes(r, 'error'))).toEqual(new Set(['index_stale', 'duplicate_name', 'forbidden_filename']));
  });

  it('warns about orphans, long pages, conflict copies and extra folders', async () => {
    await put(v.vault, '主题/孤儿.md', page({}, '字'.repeat(2001)));
    await put(v.vault, '主题/孤儿 2.md', page());
    await put(v.vault, '新文件夹/x.md', 'x');
    await put(v.vault, '主题/子目录/y.md', page());
    await writeIndex(v.vault);
    const r = await lintVault(v.vault);
    expect(r.errors).toBe(0);
    expect(new Set(codes(r, 'warning'))).toEqual(new Set(['orphan', 'too_long', 'conflict_copy', 'unknown_folder']));
  });

  it('does not count index.md or a self-link as an inbound link', async () => {
    await put(v.vault, '主题/甲.md', page({}, '[[甲]]'));
    await writeIndex(v.vault);
    expect(codes(await lintVault(v.vault))).toEqual(['orphan']);
  });
});
