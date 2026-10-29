import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lintVault } from '../src/lint/index.mjs';
import { readState } from '../src/state.mjs';
import { parseMarkdown } from '../src/vault/frontmatter.mjs';
import { TEMPLATE, addMissingIgnores, addMissingSettings, configure, initVault, mergeClaudeMd, setSettingsField, upgradeAll, upgradeVault } from '../src/vault/setup.mjs';
import { readSettings } from '../src/vault/settings.mjs';
import { vaultStatus } from '../src/vault/status.mjs';

let tmp;
let env;

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
  it('creates a lint-clean vault with no git inside and shared state in .kb/', async () => {
    const vault = join(tmp, 'iCloud', '我的第二大脑');
    const r = await initVault(vault, { env, now: new Date(2026, 9, 28) });
    expect(r).toEqual({ ok: true, vault });

    expect(existsSync(join(vault, '.gitignore'))).toBe(true);
    expect(existsSync(join(vault, 'gitignore'))).toBe(false);
    expect(existsSync(join(vault, '.git'))).toBe(false);
    expect(existsSync(join(tmp, 'home', 'vault.git'))).toBe(false);

    expect((await lintVault(vault)).errors).toBe(0);
    expect(await readState(vault, env)).toEqual({ last_lint: '2026-10-28' });
    expect((await vaultStatus(vault, env, new Date(2026, 9, 29))).lint_due).toBe(false);
  });

  it('accepts a folder Obsidian already created and keeps its config', async () => {
    const vault = join(tmp, 'v');
    await mkdir(join(vault, '.obsidian'), { recursive: true });
    await writeFile(join(vault, '.obsidian', 'app.json'), '{"mine":true}');
    expect((await initVault(vault, { env })).ok).toBe(true);
    expect(await readFile(join(vault, '.obsidian', 'app.json'), 'utf8')).toBe('{"mine":true}');
  });

  it('refuses non-empty folders', async () => {
    const full = join(tmp, 'full');
    await mkdir(full);
    await writeFile(join(full, 'note.md'), 'x');
    expect(await initVault(full, { env })).toMatchObject({ ok: false, error: 'not_empty' });
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

    const r = await upgradeVault(vault, { template, env });
    expect(r).toEqual({ ok: true, changed: ['CLAUDE.md', '.claude/skills/new/SKILL.md'], removed: ['_templates/生活.md'], added: [], migrated: [] });

    const claude = await readFile(join(vault, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('# 第二大脑 · 规则 v2');
    expect(claude.endsWith('- 我的规则：标签用中文\n')).toBe(true);
    expect(await readFile(join(vault, '主题/我的页面.md'), 'utf8')).toBe('我的内容');
    expect(await readFile(join(vault, '我的设置.md'), 'utf8')).toBe(settings);
    expect(existsSync(join(vault, '_templates/生活.md'))).toBe(false);

    expect(await upgradeVault(vault, { template, env })).toEqual({ ok: true, changed: [], removed: [], added: [], migrated: [] });
  });

  it('migrates a v0.1.0 vault: removes the .git pointer and moves the state', async () => {
    await writeFile(join(vault, '.git'), `gitdir: ${join(tmp, 'home', 'vault.git')}\n`);
    await mkdir(join(tmp, 'home'), { recursive: true });
    await writeFile(join(tmp, 'home', 'state.json'), JSON.stringify({ feishu: { cursor_time: 9, cursor_ids: ['om_old'] } }));
    const r = await upgradeVault(vault, { template, env });
    expect(r.migrated).toHaveLength(2);
    expect(existsSync(join(vault, '.git'))).toBe(false);
    expect((await readState(vault, env)).feishu).toEqual({ cursor_time: 9, cursor_ids: ['om_old'] });
    expect(existsSync(join(tmp, 'home', 'state.json.migrated'))).toBe(true);
  });

  it('adds new settings fields and ignore entries without touching existing ones', async () => {
    // A v0.1.0 vault: no version_history, my own chat id and batch limit, my own ignore rule.
    const settingsFile = join(vault, '我的设置.md');
    const old = (await readFile(settingsFile, 'utf8')).replace('version_history: false\n', '').replace('batch_limit: 30', 'batch_limit: 10').replace('feishu_chat_id: ""', 'feishu_chat_id: oc_mine');
    await writeFile(settingsFile, old);
    await writeFile(join(vault, '.gitignore'), '.obsidian/workspace*.json\nmy-private/\n');
    await writeFile(join(template, 'gitignore'), await readFile(join(TEMPLATE, 'gitignore'), 'utf8'));

    const r = await upgradeVault(vault, { template, env });
    expect(r.added).toContain('我的设置.md: version_history');
    expect(r.added).toContain('.gitignore: .kb/');
    const settings = await readSettings(vault);
    expect(settings).toMatchObject({ version_history: false, batch_limit: 10, feishu_chat_id: 'oc_mine' });
    expect((await readFile(settingsFile, 'utf8')).startsWith(old.slice(0, old.indexOf('\n---')))).toBe(true);
    const ignore = await readFile(join(vault, '.gitignore'), 'utf8');
    expect(ignore.startsWith('.obsidian/workspace*.json\nmy-private/\n')).toBe(true);
    expect(ignore.split('\n').filter((l) => l === '.obsidian/workspace*.json')).toHaveLength(1);

    expect((await upgradeVault(vault, { template, env })).added).toEqual([]);
  });

  it('never removes a real .git directory', async () => {
    await mkdir(join(vault, '.git'));
    expect((await upgradeVault(vault, { template, env })).migrated).toEqual([]);
    expect(existsSync(join(vault, '.git'))).toBe(true);
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

describe('kb upgrade (one command)', () => {
  // A fake shell: records commands, simulates git and the re-run of the new kb.
  function fakeRun({ before = 'aaa1111', after = 'bbb2222', pullError, noGit } = {}) {
    const calls = [];
    let head = before;
    const run = async (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      if (cmd === 'git') {
        if (noGit) throw Object.assign(new Error('not a git repository'), { stderr: 'fatal: not a git repository' });
        if (args.includes('rev-parse')) return `${head}\n`;
        if (args.includes('pull')) {
          if (pullError) throw Object.assign(new Error('pull'), { stderr: pullError });
          head = after;
          return '';
        }
      }
      if (cmd === 'npm') return '';
      return `${JSON.stringify({ ok: true, changed: ['CLAUDE.md'], removed: [], added: [], migrated: [] })}\n`;
    };
    return { run, calls };
  }

  it('pulls the kit, installs, then lets the new version update the vault', async () => {
    const f = fakeRun();
    const r = await upgradeAll('/vault', { env, kitDir: '/kit', run: f.run });
    expect(r).toEqual({ ok: true, changed: ['CLAUDE.md'], removed: [], added: [], migrated: [], kit: { from: 'aaa1111', to: 'bbb2222', updated: true } });
    expect(f.calls).toEqual([
      'git -C /kit rev-parse --short HEAD',
      'git -C /kit pull --ff-only --quiet',
      'git -C /kit rev-parse --short HEAD',
      'npm install --no-audit --no-fund --silent',
      `${process.execPath} /kit/bin/kb.mjs upgrade --no-pull --vault /vault`,
    ]);
  });

  it('skips npm install when the kit is already up to date', async () => {
    const f = fakeRun({ after: 'aaa1111' });
    expect((await upgradeAll('/vault', { env, kitDir: '/kit', run: f.run })).kit.updated).toBe(false);
    expect(f.calls.some((c) => c.startsWith('npm'))).toBe(false);
  });

  it('stops before touching the vault when the kit cannot be updated', async () => {
    const f = fakeRun({ pullError: 'error: Your local changes would be overwritten' });
    expect(await upgradeAll('/vault', { env, kitDir: '/kit', run: f.run })).toMatchObject({ ok: false, error: 'kit_update_failed' });
    expect(f.calls.some((c) => c.includes('kb.mjs'))).toBe(false);
    expect((await upgradeAll('/vault', { env, kitDir: '/kit', run: fakeRun({ noGit: true }).run })).error).toBe('kit_not_git');
  });

  it('extends settings and ignore files line by line', () => {
    const tpl = '---\na: 1\nb: 2 # new\n---\n';
    expect(addMissingSettings('---\na: 9\n---\n正文\n', tpl)).toEqual({ text: '---\na: 9\nb: 2 # new\n---\n正文\n', added: ['b'] });
    expect(addMissingSettings('没有属性的文件', tpl).added).toEqual([]);
    expect(addMissingIgnores('x\n', '# c\nx\ny\n')).toEqual({ text: 'x\n\n# Added by kb upgrade\ny\n', added: ['y'] });
  });
});
