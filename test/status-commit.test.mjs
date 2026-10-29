import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
    await writeState(v.vault, { last_lint: '2026-10-01' }, v.env);
    expect(await vaultStatus(v.vault, v.env, new Date(2026, 9, 31))).toMatchObject({ days_since_lint: 30, lint_due: false });
    expect(await vaultStatus(v.vault, v.env, new Date(2026, 10, 1))).toMatchObject({ days_since_lint: 31, lint_due: true });
  });
});

describe('kb question', () => {
  beforeEach(async () => {
    v = await makeVault();
  });

  it('sets, shows and clears the pending question without touching other state', async () => {
    await writeState(v.vault, { last_lint: '2026-10-01' }, v.env);
    const set = await setQuestion(v.vault, { text: '你同意它哪一点？', related: '[[甲]]' }, v.env, new Date(2026, 9, 28));
    expect(set.pending_question).toEqual({ asked_at: '2026-10-28', text: '你同意它哪一点？', related: '[[甲]]' });
    expect((await vaultStatus(v.vault, v.env)).pending_question.text).toBe('你同意它哪一点？');
    expect(await setQuestion(v.vault, { clear: true }, v.env)).toEqual({ ok: true, pending_question: null });
    expect(await readState(v.vault, v.env)).toEqual({ last_lint: '2026-10-01' });
  });

  it('rejects empty or contradictory arguments', async () => {
    expect((await setQuestion(v.vault, {}, v.env)).error).toBe('invalid_arguments');
    expect((await setQuestion(v.vault, { text: 'x', clear: true }, v.env)).error).toBe('invalid_arguments');
  });
});

describe('another computer', () => {
  beforeEach(async () => {
    v = await makeVault();
  });

  it('warns when another computer processed the vault in the last 10 minutes', async () => {
    await writeState(v.vault, { last_run: { machine: '另一台 Mac', at: '2026-10-28T09:00:00+08:00' } }, v.env);
    const at = (min) => new Date(Date.parse('2026-10-28T09:00:00+08:00') + min * 60_000);
    expect(await vaultStatus(v.vault, { ...v.env, KB_MACHINE: '这台 Mac' }, at(5))).toMatchObject({ machine: '这台 Mac', other_machine_recent: true });
    expect((await vaultStatus(v.vault, { ...v.env, KB_MACHINE: '这台 Mac' }, at(11))).other_machine_recent).toBe(false);
    expect((await vaultStatus(v.vault, { ...v.env, KB_MACHINE: '另一台 Mac' }, at(5))).other_machine_recent).toBe(false);
  });

  it('shares the cursor through the vault, not the computer', async () => {
    await writeState(v.vault, { feishu: { cursor_time: 42 } }, v.env);
    expect((await readState(v.vault, { SECOND_BRAIN_HOME: join(v.tmp, 'second-computer') })).feishu.cursor_time).toBe(42);
  });
});

describe('kb commit', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const ON = { version_history: true };

  beforeEach(async () => {
    v = await makeVault();
    Object.assign(process.env, { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' });
  });

  it('does nothing while version_history is off (the default)', async () => {
    expect(await commitVault(v.vault, 'x', { env: v.env, settings: {} })).toMatchObject({ ok: false, error: 'not_configured' });
    expect(existsSync(join(v.tmp, 'home', 'vault.git'))).toBe(false);
  });

  it('keeps history in ~/.second-brain/vault.git and nothing git-related in the vault', async () => {
    const r = await commitVault(v.vault, '[2026-10-28] 处理收件箱 | 入库 0，失败 0', { env: v.env, settings: ON });
    expect(r).toMatchObject({ ok: true, committed: true });
    expect(r.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(existsSync(join(v.vault, '.git'))).toBe(false);
    const gitDir = join(v.tmp, 'home', 'vault.git');
    expect(git(v.vault, '--git-dir', gitDir, 'log', '-1', '--format=%s')).toBe('[2026-10-28] 处理收件箱 | 入库 0，失败 0');
    expect(git(v.vault, '--git-dir', gitDir, '--work-tree', v.vault, 'ls-files')).not.toContain('.kb/');
    expect(await commitVault(v.vault, 'again', { env: v.env, settings: ON })).toMatchObject({ ok: true, committed: false });
  });

  it('refuses a git dir that belongs to another vault, and an empty message', async () => {
    await commitVault(v.vault, 'first', { env: v.env, settings: ON });
    const other = await makeVault();
    try {
      expect(await commitVault(other.vault, 'x', { env: v.env, settings: ON })).toMatchObject({ ok: false, error: 'git_dir_in_use' });
    } finally {
      await other.cleanup();
    }
    expect(await commitVault(v.vault, '  ', { env: v.env, settings: ON })).toMatchObject({ ok: false, error: 'missing_message' });
  });
});
