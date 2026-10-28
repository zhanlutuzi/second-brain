import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lintVault } from '../src/lint/index.mjs';
import { readState } from '../src/state.mjs';
import { parseMarkdown } from '../src/vault/frontmatter.mjs';
import { configure, initVault, mergeClaudeMd, setSettingsField, upgradeVault } from '../src/vault/setup.mjs';
import { readSettings } from '../src/vault/settings.mjs';
import { vaultStatus } from '../src/vault/status.mjs';

let tmp;
let env;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'kb-setup-'));
  env = {
    SECOND_BRAIN_HOME: join(tmp, 'home'),
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' });
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

describe('kb init', () => {
  it('creates a lint-clean vault whose git history lives in ~/.second-brain', async () => {
    const vault = join(tmp, 'iCloud', '我的第二大脑');
    const r = await initVault(vault, { env, now: new Date(2026, 9, 28) });
    expect(r).toEqual({ ok: true, vault, git_dir: join(tmp, 'home', 'vault.git') });

    expect(existsSync(join(vault, '.gitignore'))).toBe(true);
    expect(existsSync(join(vault, 'gitignore'))).toBe(false);
    // .git is a pointer file, not a directory, so iCloud never syncs history.
    expect(statSync(join(vault, '.git')).isFile()).toBe(true);
    expect(await readFile(join(vault, '.git'), 'utf8')).toContain(join(tmp, 'home', 'vault.git'));
    expect(git(vault, 'log', '--format=%s')).toBe('[2026-10-28] 初始化知识库');
    expect(git(vault, 'status', '--porcelain')).toBe('');

    expect((await lintVault(vault)).errors).toBe(0);
    expect(await readState(env)).toEqual({ last_lint: '2026-10-28' });
    expect((await vaultStatus(vault, env, new Date(2026, 9, 29))).lint_due).toBe(false);
  });

  it('accepts a folder Obsidian already created and keeps its config', async () => {
    const vault = join(tmp, 'v');
    await mkdir(join(vault, '.obsidian'), { recursive: true });
    await writeFile(join(vault, '.obsidian', 'app.json'), '{"mine":true}');
    expect((await initVault(vault, { env })).ok).toBe(true);
    expect(await readFile(join(vault, '.obsidian', 'app.json'), 'utf8')).toBe('{"mine":true}');
  });

  it('refuses non-empty folders and a second vault on the same git dir', async () => {
    const full = join(tmp, 'full');
    await mkdir(full);
    await writeFile(join(full, 'note.md'), 'x');
    expect(await initVault(full, { env })).toMatchObject({ ok: false, error: 'not_empty' });
    expect((await initVault(join(tmp, 'a'), { env })).ok).toBe(true);
    expect(await initVault(join(tmp, 'b'), { env })).toMatchObject({ ok: false, error: 'git_dir_exists' });
  });
});

describe('kb upgrade', () => {
  let vault;
  let template;
  beforeEach(async () => {
    vault = join(tmp, 'vault');
    await initVault(vault, { env });
    // A newer kit: changed rules, a new skill, a removed template.
    template = join(tmp, 'kit-next');
    execFileSync('cp', ['-R', join(vault), template]);
    await rm(join(template, '.git'));
    await writeFile(join(template, 'gitignore'), '');
    const claude = await readFile(join(template, 'CLAUDE.md'), 'utf8');
    await writeFile(join(template, 'CLAUDE.md'), claude.replace('# 第二大脑 · 规则', '# 第二大脑 · 规则 v2'));
    await mkdir(join(template, '.claude/skills/new'), { recursive: true });
    await writeFile(join(template, '.claude/skills/new/SKILL.md'), '---\nname: new\n---\n');
    await rm(join(template, '_templates/生活.md'));
  });

  it('replaces system files and keeps the personal section and user files', async () => {
    await writeFile(join(vault, 'CLAUDE.md'), `${await readFile(join(vault, 'CLAUDE.md'), 'utf8')}- 我的规则：标签用中文\n`);
    await writeFile(join(vault, '主题/我的页面.md'), '我的内容');
    const settings = await readFile(join(vault, '我的设置.md'), 'utf8');

    const r = await upgradeVault(vault, { template });
    expect(r).toEqual({ ok: true, changed: ['CLAUDE.md', '.claude/skills/new/SKILL.md'], removed: ['_templates/生活.md'] });

    const claude = await readFile(join(vault, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('# 第二大脑 · 规则 v2');
    expect(claude.endsWith('- 我的规则：标签用中文\n')).toBe(true);
    expect(await readFile(join(vault, '主题/我的页面.md'), 'utf8')).toBe('我的内容');
    expect(await readFile(join(vault, '我的设置.md'), 'utf8')).toBe(settings);
    expect(existsSync(join(vault, '_templates/生活.md'))).toBe(false);

    expect(await upgradeVault(vault, { template })).toEqual({ ok: true, changed: [], removed: [] });
  });

  it('merges CLAUDE.md around the personal marker', () => {
    const next = '规则 v2\n<!-- kb:personal — keep -->\n';
    expect(mergeClaudeMd(next, '规则 v1\n<!-- kb:personal — keep -->\n我的补充\n')).toBe('规则 v2\n<!-- kb:personal — keep -->\n我的补充\n');
    expect(mergeClaudeMd(next, '没有标记的旧文件')).toBe(next);
  });
});

describe('kb config', () => {
  let vault;
  beforeEach(async () => {
    vault = join(tmp, 'vault');
    await initVault(vault, { env });
  });

  it('writes credentials with mode 600 and the chat id into 我的设置', async () => {
    const r = await configure(vault, { appId: 'cli_example', appSecret: 'example-secret-value', chatId: 'oc_example' }, env);
    expect(r).toEqual({ ok: true, written: { app_id: 'cli_example', app_secret: '***', feishu_chat_id: 'oc_example' } });
    const file = join(tmp, 'home', '.env');
    expect(await readFile(file, 'utf8')).toBe('FEISHU_APP_ID=cli_example\nFEISHU_APP_SECRET=example-secret-value\n');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect((await readSettings(vault)).feishu_chat_id).toBe('oc_example');
    // The rest of the settings file is untouched.
    const text = await readFile(join(vault, '我的设置.md'), 'utf8');
    expect(text).toContain('reaction_ok: OK\n');
    expect(text).toContain('## 备注');

    await configure(vault, { appSecret: 'rotated-secret-value' }, env);
    expect(await readFile(file, 'utf8')).toBe('FEISHU_APP_ID=cli_example\nFEISHU_APP_SECRET=rotated-secret-value\n');
  });

  it('requires at least one value', async () => {
    expect((await configure(vault, {}, env)).error).toBe('invalid_arguments');
  });

  it('adds a missing field to the frontmatter', () => {
    const out = setSettingsField('---\na: 1\n---\n正文\n', 'feishu_chat_id', 'oc_x');
    expect(parseMarkdown(out).data).toEqual({ a: 1, feishu_chat_id: 'oc_x' });
    expect(parseMarkdown(out).body).toBe('正文\n');
  });
});
