import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const ROOT = fileURLToPath(new URL('../vault-template/', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Characters that break Obsidian links (see CLAUDE.md "Obsidian 约定").
const FORBIDDEN = /[\\/:*?"<>|#^[\]]/;
const PAGE_TYPES = ['主题', '项目', '生活', '思考'];
const REQUIRED_FIELDS = ['type', 'title', 'summary', 'created', 'updated', 'sources', 'tags'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? [p, ...walk(p)] : [p];
  });
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  expect(m, 'page starts with a frontmatter block').not.toBeNull();
  return parseYaml(m[1]);
}

describe('vault-template structure', () => {
  it.each([
    'CLAUDE.md', '我的设置.md', 'index.md', 'log.md', 'gitignore',
    '.claude/settings.json', '.obsidian/app.json',
    'inbox', 'raw', 'raw/assets', '主题', '项目', '生活', '思考', '_templates',
  ])('has %s', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true);
  });

  it('has no file or folder name with characters forbidden by Obsidian links', () => {
    const bad = walk(ROOT).filter((p) => FORBIDDEN.test(basename(p))).map((p) => relative(ROOT, p));
    expect(bad).toEqual([]);
  });

  it('does not ship a dot-gitignore that would apply to the kit repo itself', () => {
    expect(existsSync(join(ROOT, '.gitignore'))).toBe(false);
  });

  it('keeps Obsidian UI state out of the vault git history', () => {
    const lines = read('gitignore').split('\n');
    expect(lines).toContain('.obsidian/workspace*.json');
    expect(lines).toContain('.DS_Store');
  });
});

describe('page templates', () => {
  it('has exactly the four page types', () => {
    const names = readdirSync(join(ROOT, '_templates')).sort();
    expect(names).toEqual(PAGE_TYPES.map((t) => `${t}.md`).sort());
  });

  it.each(PAGE_TYPES)('%s template has valid frontmatter with all required fields', (type) => {
    const fm = frontmatter(read(`_templates/${type}.md`));
    for (const field of REQUIRED_FIELDS) expect(fm, field).toHaveProperty(field);
    expect(fm.type).toBe(type);
    expect(fm.sources).toEqual([]);
    expect(fm.tags).toEqual([]);
  });

  it.each([
    ['主题', ['一句话', '要点', '我的看法', '相关']],
    ['项目', ['概况', '决策日志', '待办', '相关会议']],
    ['生活', ['一句话', '流程或要点', '材料与链接', '经验', '相关']],
  ])('%s template has the sections from docs/TECH.md in order', (type, sections) => {
    const headings = [...read(`_templates/${type}.md`).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(sections);
  });
});

describe('CLAUDE.md', () => {
  const text = read('CLAUDE.md');

  it('ends with the personal section that upgrades preserve', () => {
    const marker = '<!-- kb:personal';
    expect(text.split(marker)).toHaveLength(2);
    const after = text.slice(text.indexOf(marker));
    expect(after.split('\n').filter((l) => l.trim()).length).toBe(1);
    expect(text.lastIndexOf('## 个人补充')).toBeLessThan(text.indexOf(marker));
  });

  it('documents every kb subcommand and the core LLM-Wiki rules', () => {
    for (const name of ['status', 'pull', 'fetch', 'file', 'index', 'lint', 'react', 'commit', 'question']) {
      expect(text).toContain(`kb ${name}`);
    }
    for (const rule of ['只增不改', '优先更新已有页面', '不得新建任何文件夹', '不代写']) {
      expect(text).toContain(rule);
    }
  });
});

describe('skills', () => {
  it.each(['inbox', 'ask'])('%s skill has a name and a trigger description', (name) => {
    const fm = frontmatter(read(`.claude/skills/${name}/SKILL.md`));
    expect(fm.name).toBe(name);
    expect(fm.description.length).toBeGreaterThan(20);
  });

  it('inbox skill uses only kb subcommands that exist', async () => {
    const { COMMANDS } = await import('../src/commands/index.mjs');
    const known = new Set(COMMANDS.map((c) => c.name));
    const used = [...read('.claude/skills/inbox/SKILL.md').matchAll(/`kb (\w+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(5);
    for (const name of used) expect(known.has(name), name).toBe(true);
  });
});

describe('我的设置.md', () => {
  it('has the configuration fields from docs/TECH.md and no real IDs', () => {
    const fm = frontmatter(read('我的设置.md'));
    expect(Object.keys(fm).sort()).toEqual(
      ['batch_limit', 'browser_domains', 'browser_headless', 'feishu_chat_id', 'life_categories', 'lint_interval_days', 'projects', 'reaction_failed', 'reaction_ok'],
    );
    expect(fm.feishu_chat_id).toBe('');
    expect(fm.batch_limit).toBe(30);
    expect(fm.lint_interval_days).toBe(30);
    expect(fm.browser_domains).toContain('mp.weixin.qq.com');
    // Flat scalars only: Obsidian's properties panel cannot edit nested objects.
    for (const value of Object.values(fm)) {
      expect(Array.isArray(value) || typeof value !== 'object').toBe(true);
    }
  });
});

describe('.claude/settings.json', () => {
  const allow = JSON.parse(read('.claude/settings.json')).permissions.allow;

  it('pre-approves kb, rg and everyday git commands', () => {
    expect(allow).toEqual(expect.arrayContaining(['Bash(kb:*)', 'Bash(rg:*)', 'Bash(git commit:*)']));
  });

  it('does not pre-approve anything that deletes files', () => {
    for (const rule of allow) {
      expect(rule).not.toMatch(/^Bash\((rm|git rm|git clean|git reset|git checkout|git:\*)/);
    }
  });
});
