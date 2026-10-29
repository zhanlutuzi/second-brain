// kb init / kb upgrade / kb config: the deterministic half of the setup skill.

import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mask, parseEnvFile } from '../feishu/config.mjs';
import { migrateLegacyState, paths, readState, writeState } from '../state.mjs';
import { localDate } from '../util/date.mjs';
import { parseMarkdown } from './frontmatter.mjs';
import { SETTINGS_FILE } from './layout.mjs';

export const TEMPLATE = fileURLToPath(new URL('../../vault-template', import.meta.url));
export const KIT_DIR = fileURLToPath(new URL('../../', import.meta.url));

// Everything under these paths belongs to the kit and is replaced on upgrade.
export const SYSTEM_PATHS = ['CLAUDE.md', '.claude', '_templates'];
export const PERSONAL_MARKER = '<!-- kb:personal';

// A target folder may already exist if Obsidian created it (it only holds .obsidian/).
async function isEmptyEnough(dir) {
  if (!existsSync(dir)) return true;
  const names = (await readdir(dir)).filter((n) => n !== '.obsidian' && n !== '.DS_Store');
  return names.length === 0;
}

export async function initVault(target, { env = process.env, now = new Date(), template = TEMPLATE } = {}) {
  const vault = resolve(target);
  if (!(await isEmptyEnough(vault))) {
    return { ok: false, error: 'not_empty', message: `${vault} already has files; choose an empty folder` };
  }

  await mkdir(vault, { recursive: true });
  const hadObsidian = existsSync(join(vault, '.obsidian'));
  await cp(template, vault, {
    recursive: true,
    // Keep Obsidian's own config if the folder was already opened as a vault.
    filter: (src) => !(hadObsidian && relative(template, src).startsWith('.obsidian')),
  });
  await rename(join(vault, 'gitignore'), join(vault, '.gitignore'));

  // Start the lint clock today so a fresh vault is not reported as overdue.
  await writeState(vault, { last_lint: localDate(now) }, env);
  return { ok: true, vault };
}

// Keep everything after the personal marker in the user's CLAUDE.md.
export function mergeClaudeMd(next, current) {
  const at = current.indexOf(PERSONAL_MARKER);
  const nextAt = next.indexOf(PERSONAL_MARKER);
  if (at === -1 || nextAt === -1) return next;
  const personal = current.slice(current.indexOf('\n', at) + 1);
  return next.slice(0, next.indexOf('\n', nextAt) + 1) + personal;
}

async function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

// v0.1.0 put a .git pointer file in the vault; iCloud syncs it to other computers,
// where it points nowhere. History now lives only in ~/.second-brain/vault.git.
async function removeGitPointer(vault) {
  const file = join(vault, '.git');
  if (!existsSync(file) || !(await stat(file)).isFile()) return false;
  if (!(await readFile(file, 'utf8')).startsWith('gitdir:')) return false;
  await rm(file);
  return true;
}

// User files are only ever extended: settings keys the user does not have yet are
// appended with the template's line (default value and comment); existing values stay.
export function addMissingSettings(current, template) {
  const have = parseMarkdown(current).data;
  const block = template.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const lines = block.split('\n').filter((l) => /^[A-Za-z_][\w-]*:/.test(l) && !(l.split(':')[0] in have));
  if (lines.length === 0 || !current.startsWith('---')) return { text: current, added: [] };
  const end = current.indexOf('\n---', 3);
  return { text: `${current.slice(0, end)}\n${lines.join('\n')}${current.slice(end)}`, added: lines.map((l) => l.split(':')[0]) };
}

export function addMissingIgnores(current, template) {
  const have = new Set(current.split('\n').map((l) => l.trim()));
  const missing = template.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !have.has(l));
  if (missing.length === 0) return { text: current, added: [] };
  const base = current.endsWith('\n') || current === '' ? current : `${current}\n`;
  return { text: `${base}\n# Added by kb upgrade\n${missing.join('\n')}\n`, added: missing };
}

async function extendUserFiles(vault, template) {
  const added = [];
  const settingsFile = join(vault, SETTINGS_FILE);
  if (existsSync(settingsFile)) {
    const r = addMissingSettings(await readFile(settingsFile, 'utf8'), await readFile(join(template, SETTINGS_FILE), 'utf8'));
    if (r.added.length) {
      await writeFile(settingsFile, r.text, 'utf8');
      added.push(...r.added.map((k) => `${SETTINGS_FILE}: ${k}`));
    }
  }
  const ignoreFile = join(vault, '.gitignore');
  const current = existsSync(ignoreFile) ? await readFile(ignoreFile, 'utf8') : '';
  const r = addMissingIgnores(current, await readFile(join(template, 'gitignore'), 'utf8'));
  if (r.added.length) {
    await writeFile(ignoreFile, r.text, 'utf8');
    added.push(...r.added.map((l) => `.gitignore: ${l}`));
  }
  return added;
}

export async function upgradeVault(vault, { template = TEMPLATE, env = process.env } = {}) {
  const changed = [];
  const removed = [];
  const migrated = [];
  if (await removeGitPointer(vault)) migrated.push('removed .git pointer (history stays in ~/.second-brain/vault.git)');
  if (await migrateLegacyState(vault, env)) migrated.push('moved ~/.second-brain/state.json into .kb/state.json');
  for (const sys of SYSTEM_PATHS) {
    const src = join(template, sys);
    const dst = join(vault, sys);
    if (sys === 'CLAUDE.md') {
      const next = await readFile(src, 'utf8');
      const current = existsSync(dst) ? await readFile(dst, 'utf8') : '';
      const merged = mergeClaudeMd(next, current);
      if (merged !== current) {
        await writeFile(dst, merged, 'utf8');
        changed.push(sys);
      }
      continue;
    }
    const before = new Map();
    for (const f of await listFiles(dst)) before.set(f, await readFile(join(dst, f), 'utf8'));
    const after = await listFiles(src);
    await rm(dst, { recursive: true, force: true });
    await cp(src, dst, { recursive: true });
    for (const f of after) {
      if (before.get(f) !== (await readFile(join(src, f), 'utf8'))) changed.push(`${sys}/${f}`);
    }
    for (const f of before.keys()) if (!after.includes(f)) removed.push(`${sys}/${f}`);
  }
  const added = await extendUserFiles(vault, template);
  return { ok: true, changed, removed, added, migrated };
}

const execAsync = promisify(execFile);
const defaultRun = async (cmd, args, opts) => (await execAsync(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...opts })).stdout;

// kb upgrade: update the kit (git pull + npm install), then let the *new* code
// update the vault by running `kb upgrade --no-pull` in a fresh process.
export async function upgradeAll(vault, { env = process.env, kitDir = KIT_DIR, run = defaultRun } = {}) {
  const git = (...args) => run('git', ['-C', kitDir, ...args], { env });
  let before;
  try {
    before = (await git('rev-parse', '--short', 'HEAD')).trim();
  } catch {
    return { ok: false, error: 'kit_not_git', message: `${kitDir} is not a git clone; download the new version yourself, then run: kb upgrade --no-pull` };
  }
  try {
    await git('pull', '--ff-only', '--quiet');
  } catch (err) {
    return { ok: false, error: 'kit_update_failed', message: `git pull failed in ${kitDir}: ${String(err.stderr || err.message).trim()}. Resolve it (e.g. local changes), then run kb upgrade again.` };
  }
  const after = (await git('rev-parse', '--short', 'HEAD')).trim();
  if (after !== before) {
    try {
      await run('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: kitDir, env });
    } catch (err) {
      return { ok: false, error: 'kit_update_failed', message: `npm install failed in ${kitDir}: ${String(err.stderr || err.message).trim()}` };
    }
  }
  const out = await run(process.execPath, [join(kitDir, 'bin', 'kb.mjs'), 'upgrade', '--no-pull', '--vault', vault], { env }).catch((err) => err.stdout ?? '');
  let result;
  try {
    result = JSON.parse(String(out).trim().split('\n').pop());
  } catch {
    return { ok: false, error: 'upgrade_failed', message: 'the new version did not report a result' };
  }
  return { ...result, kit: { from: before, to: after, updated: after !== before } };
}

// Replace one top-level key in the settings frontmatter, keeping everything else as written.
export function setSettingsField(text, key, value) {
  const line = `${key}: ${JSON.stringify(value)}`;
  const re = new RegExp(`^${key}:.*$`, 'm');
  const end = text.indexOf('\n---', 3);
  if (re.test(text.slice(0, end))) return text.replace(re, line);
  return `${text.slice(0, end)}\n${line}${text.slice(end)}`;
}

export async function configure(vault, { appId, appSecret, chatId }, env = process.env) {
  const written = {};
  if (appId || appSecret) {
    const file = paths(env).env;
    await mkdir(paths(env).home, { recursive: true });
    const current = existsSync(file) ? parseEnvFile(await readFile(file, 'utf8')) : {};
    if (appId) current.FEISHU_APP_ID = appId;
    if (appSecret) current.FEISHU_APP_SECRET = appSecret;
    const body = Object.entries(current).map(([k, v]) => `${k}=${v}`).join('\n');
    await writeFile(file, `${body}\n`, { encoding: 'utf8', mode: 0o600 });
    await chmod(file, 0o600);
    if (appId) written.app_id = appId;
    if (appSecret) written.app_secret = mask(appSecret, [appSecret]);
  }
  if (chatId) {
    const file = join(vault, SETTINGS_FILE);
    await writeFile(file, setSettingsField(await readFile(file, 'utf8'), 'feishu_chat_id', chatId), 'utf8');
    written.feishu_chat_id = chatId;
  }
  if (Object.keys(written).length === 0) {
    return { ok: false, error: 'invalid_arguments', message: 'Usage: kb config [--app-id <id>] [--app-secret <secret>] [--chat-id <oc_...>]' };
  }
  return { ok: true, written };
}

export async function recordLint(vault, env = process.env, now = new Date()) {
  const state = await readState(vault, env);
  state.last_lint = localDate(now);
  await writeState(vault, state, env);
  return state.last_lint;
}
