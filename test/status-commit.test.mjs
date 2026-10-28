import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readState, writeState } from '../src/state.mjs';
import { commitVault } from '../src/vault/git.mjs';
import { setQuestion } from '../src/vault/question.mjs';
import { vaultStatus } from '../src/vault/status.mjs';
import { makeVault, page, put } from './helpers.mjs';

let v;
afterEach(() => v.cleanup());

describe('kb status', () => {
  beforeEach(async () => {
    v = await makeVault({ examples: true });
  });

  it('lists inbox entries oldest first with settings and lint state', async () => {
    await put(v.vault, 'inbox/附件.pdf', 'binary');
    const s = await vaultStatus(v.vault, v.env, new Date(2026, 9, 28));
    expect(s.inbox.pending).toBe(20);
    expect(s.inbox.attachments).toEqual(['inbox/附件.pdf']);
    expect(s.inbox.entries[0]).toMatchObject({ path: 'inbox/feishu-om_example_0001.md', kind: 'link', title: '长上下文会取代 RAG 吗' });
    const clip = s.inbox.entries.find((e) => e.path.includes('番茄'));
    expect(clip).toMatchObject({ kind: 'link', source: 'clipper', url: 'https://example.org/notes/pomodoro-revisited' });
    expect(s).toMatchObject({ today: '2026-10-28', pages: 0, batch_limit: 30, last_lint: null, lint_due: false, pending_question: null });
  });

  it('counts failed and unfetched links', async () => {
    await put(v.vault, 'inbox/x.md', '---\nkind: link\nurl: https://example.com/a\nfetch_status: failed\n---\n');
    await put(v.vault, 'inbox/y.md', '---\nkind: link\nurl: https://example.com/b\n---\n');
    const s = await vaultStatus(v.vault, v.env);
    expect(s.inbox).toMatchObject({ pending: 22, failed: 1, needs_fetch: 1 });
  });

  it('reports when lint is due', async () => {
    await put(v.vault, '主题/甲.md', page());
    expect((await vaultStatus(v.vault, v.env)).lint_due).toBe(true);
    await writeState({ last_lint: '2026-10-01' }, v.env);
    expect(await vaultStatus(v.vault, v.env, new Date(2026, 9, 31))).toMatchObject({ days_since_lint: 30, lint_due: false });
    expect(await vaultStatus(v.vault, v.env, new Date(2026, 10, 1))).toMatchObject({ days_since_lint: 31, lint_due: true });
  });
});

describe('kb question', () => {
  beforeEach(async () => {
    v = await makeVault();
  });

  it('sets, shows and clears the pending question without touching other state', async () => {
    await writeState({ last_lint: '2026-10-01' }, v.env);
    const set = await setQuestion({ text: '你同意它哪一点？', related: '[[甲]]' }, v.env, new Date(2026, 9, 28));
    expect(set.pending_question).toEqual({ asked_at: '2026-10-28', text: '你同意它哪一点？', related: '[[甲]]' });
    expect((await vaultStatus(v.vault, v.env)).pending_question.text).toBe('你同意它哪一点？');
    expect(await setQuestion({ clear: true }, v.env)).toEqual({ ok: true, pending_question: null });
    expect(await readState(v.env)).toEqual({ last_lint: '2026-10-01' });
  });

  it('rejects empty or contradictory arguments', async () => {
    expect((await setQuestion({}, v.env)).error).toBe('invalid_arguments');
    expect((await setQuestion({ text: 'x', clear: true }, v.env)).error).toBe('invalid_arguments');
  });
});

describe('kb commit', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const initRepo = (dir) => {
    git(dir, 'init', '--quiet');
    git(dir, 'config', 'user.name', 'Test');
    git(dir, 'config', 'user.email', 'test@example.com');
  };

  beforeEach(async () => {
    v = await makeVault();
  });

  it('commits all changes once and reports nothing to commit afterwards', async () => {
    initRepo(v.vault);
    const r = await commitVault(v.vault, '[2026-10-28] 处理收件箱 | 入库 0，失败 0');
    expect(r).toMatchObject({ ok: true, committed: true });
    expect(r.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(git(v.vault, 'log', '-1', '--format=%s')).toBe('[2026-10-28] 处理收件箱 | 入库 0，失败 0');
    expect(await commitVault(v.vault, 'again')).toMatchObject({ ok: true, committed: false });
  });

  it('works with a separate git dir like the real vault', async () => {
    git(v.vault, 'init', '--quiet', '--separate-git-dir', join(v.tmp, 'vault.git'));
    git(v.vault, 'config', 'user.name', 'Test');
    git(v.vault, 'config', 'user.email', 'test@example.com');
    expect(await commitVault(v.vault, 'first')).toMatchObject({ ok: true, committed: true });
  });

  it('refuses to commit outside a vault repository', async () => {
    expect(await commitVault(v.vault, 'x')).toMatchObject({ ok: false });
    initRepo(v.tmp);
    await mkdir(join(v.tmp, 'other'), { recursive: true });
    expect(await commitVault(v.vault, 'x')).toMatchObject({ ok: false, error: 'vault_not_git_root' });
    expect(await commitVault(v.vault, '  ')).toMatchObject({ ok: false, error: 'missing_message' });
  });
});
