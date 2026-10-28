import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/vault/frontmatter.mjs';
import { fileEntry, sha256 } from '../src/vault/file.mjs';
import { listMarkdown, relPath, sanitizeName } from '../src/vault/layout.mjs';
import { REQUIRED_RAW_FIELDS } from '../src/vault/layout.mjs';
import { get, inboxMarkdown, makeVault, put } from './helpers.mjs';

let v;
afterEach(() => v?.cleanup());

async function fileAll(vault) {
  const results = [];
  for (const name of await inboxMarkdown(vault)) {
    results.push(await fileEntry(vault, `inbox/${name}`, { summary: `摘要：${name}` }));
  }
  return results;
}

describe('kb file with the 20 examples', () => {
  beforeEach(async () => {
    v = await makeVault({ examples: true });
  });

  it('files every example into raw/YYYY/MM with complete frontmatter and an untouched body', async () => {
    const originals = new Map();
    for (const name of await inboxMarkdown(v.vault)) {
      originals.set(name, parseMarkdown(await get(v.vault, `inbox/${name}`)).body);
    }
    expect(originals.size).toBe(20);

    const results = await fileAll(v.vault);
    expect(results.every((r) => r.ok && !r.duplicate)).toBe(true);
    expect(await inboxMarkdown(v.vault)).toEqual([]);

    const raws = await listMarkdown(join(v.vault, 'raw'));
    expect(raws).toHaveLength(20);
    for (const file of raws) {
      const { data, body } = parseMarkdown(await get(v.vault, relPath(v.vault, file)));
      for (const f of REQUIRED_RAW_FIELDS) expect(data[f], `${f} in ${file}`).toBeTruthy();
      expect(data.body_sha256).toBe(sha256(body));
      expect(relPath(v.vault, file)).toMatch(/^raw\/2026\/10\/2026-10-\d\d-.+\.md$/);
    }
    for (const r of results) {
      const { body } = parseMarkdown(await get(v.vault, r.path));
      expect([...originals.values()]).toContain(body);
      expect(r.link).toBe(`[[${r.path.replace(/\.md$/, '')}]]`);
    }
  });

  it('does not file anything twice when the same messages arrive again', async () => {
    await fileAll(v.vault);
    const v2 = await makeVault({ examples: true });
    try {
      // Re-deliver the same 20 entries into the already-filed vault.
      const { cp } = await import('node:fs/promises');
      await cp(join(v2.vault, 'inbox'), join(v.vault, 'inbox'), { recursive: true });
    } finally {
      await v2.cleanup();
    }
    const again = await fileAll(v.vault);
    expect(again).toHaveLength(20);
    expect(again.every((r) => r.ok && r.duplicate)).toBe(true);
    expect(await listMarkdown(join(v.vault, 'raw'))).toHaveLength(20);
    expect(await inboxMarkdown(v.vault)).toEqual([]);
  });

  it('normalizes Web Clipper files', async () => {
    const r = await fileEntry(v.vault, 'inbox/番茄工作法的正确打开方式.md', { summary: 's' });
    expect(r).toMatchObject({ ok: true, kind: 'link', path: 'raw/2026/10/2026-10-27-番茄工作法的正确打开方式.md' });
    const { data } = parseMarkdown(await get(v.vault, r.path));
    expect(data).toMatchObject({
      source: 'clipper',
      url: 'https://example.org/notes/pomodoro-revisited',
      author: '示例作者辰',
      captured: '2026-10-27',
    });
  });

  it('uses the sent date and the first words of a thought as its name', async () => {
    const r = await fileEntry(v.vault, 'inbox/feishu-om_example_0012.md');
    expect(r.ok).toBe(true);
    expect(r.path).toMatch(/^raw\/2026\/10\/2026-10-26-团队规模大，还是得用 RAG；/);
    const { data } = parseMarkdown(await get(v.vault, r.path));
    expect(data.kind).toBe('thought');
    expect(data.summary).toBe('');
  });

  it('names meetings and files after their first line', async () => {
    const r = await fileEntry(v.vault, 'inbox/feishu-om_example_0015.md');
    expect(r.title).toBe('会议：读书会小程序');
    expect(r.path).toBe('raw/2026/10/2026-10-27-会议：读书会小程序.md');
  });

  it('accepts --title and --summary from the skill', async () => {
    const r = await fileEntry(v.vault, 'inbox/feishu-om_example_0013.md', { title: '记忆卡片 太多/放弃?', summary: '只做一年内会用到的卡片' });
    expect(r.path).toBe('raw/2026/10/2026-10-26-记忆卡片 太多 放弃.md');
    const { data } = parseMarkdown(await get(v.vault, r.path));
    expect(data.title).toBe('记忆卡片 太多/放弃?');
    expect(data.summary).toBe('只做一年内会用到的卡片');
  });
});

describe('kb file edge cases', () => {
  beforeEach(async () => {
    v = await makeVault();
  });

  it('leaves failed fetches in the inbox', async () => {
    await put(v.vault, 'inbox/a.md', '---\nkind: link\nurl: https://example.com/x\nfetch_status: failed\nfetch_error: http 403\n---\n');
    const r = await fileEntry(v.vault, 'inbox/a.md');
    expect(r).toMatchObject({ ok: false, error: 'fetch_failed' });
    expect(existsSync(join(v.vault, 'inbox/a.md'))).toBe(true);
  });

  it('refuses links that were never fetched', async () => {
    await put(v.vault, 'inbox/a.md', '---\nkind: link\nurl: https://example.com/x\n---\n');
    expect(await fileEntry(v.vault, 'inbox/a.md')).toMatchObject({ ok: false, error: 'not_fetched' });
  });

  it('only accepts Markdown files inside inbox/', async () => {
    await put(v.vault, '主题/a.md', 'x');
    expect(await fileEntry(v.vault, '主题/a.md')).toMatchObject({ ok: false, error: 'not_in_inbox' });
    expect(await fileEntry(v.vault, 'inbox/missing.md')).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('accepts absolute paths and never overwrites an existing raw file', async () => {
    const body = '---\nsent_at: 2026-10-01T10:00:00+08:00\ntitle: 同名\n---\n正文一\n';
    await put(v.vault, 'inbox/a.md', body);
    await put(v.vault, 'inbox/b.md', body.replace('正文一', '正文二'));
    const a = await fileEntry(v.vault, join(v.vault, 'inbox/a.md'));
    const b = await fileEntry(v.vault, 'inbox/b.md');
    expect(a.path).toBe('raw/2026/10/2026-10-01-同名.md');
    expect(b.path).toBe('raw/2026/10/2026-10-01-同名-2.md');
    expect(a.kind).toBe('file');
  });

  it('dates entries without a timestamp with today', async () => {
    await put(v.vault, 'inbox/a.md', '随手记的一句话\n');
    const r = await fileEntry(v.vault, 'inbox/a.md', { now: new Date(2027, 0, 5) });
    expect(r.path).toMatch(/^raw\/2027\/01\/2027-01-05-/);
    expect(await readdir(join(v.vault, 'raw/2027/01'))).toHaveLength(1);
  });
});

describe('sanitizeName', () => {
  it.each([
    ['a/b:c*d?e"f<g>h|i#j^k[l]m\\n', 'a b c d e f g h i j k l m n'],
    ['  多个   空格  ', '多个 空格'],
    ['...隐藏', '隐藏'],
    ['结尾.', '结尾'],
    ['', '未命名'],
    ['x'.repeat(80), 'x'.repeat(50)],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeName(input)).toBe(expected);
  });
});
