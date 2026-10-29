// Processing state lives in the vault, so every computer can continue where
// another one stopped:  <vault>/.kb/state.json  (cursor, pending reactions,
// pending question, last lint, last run). Synced by iCloud; Obsidian hides it.
//
// Per-machine data stays in ~/.second-brain (never synced):
//   .env         Feishu App Secret
//   browser/     Playwright persistent profile
//   vault.git    optional local version history
// SECOND_BRAIN_HOME overrides the base directory (used by tests).

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function homeDir(env = process.env) {
  return env.SECOND_BRAIN_HOME ? resolve(env.SECOND_BRAIN_HOME) : join(homedir(), '.second-brain');
}

export function paths(env = process.env) {
  const home = homeDir(env);
  return {
    home,
    // Where v0.1.0 kept the state; migrated into the vault on first use.
    legacyState: join(home, 'state.json'),
    env: join(home, '.env'),
    vaultGit: join(home, 'vault.git'),
    browser: join(home, 'browser'),
  };
}

export const statePath = (vault) => join(vault, '.kb', 'state.json');

export function machineName(env = process.env) {
  return env.KB_MACHINE || hostname();
}

// Vault location: --vault flag first, then KB_VAULT, then the current directory
// (skills run kb from inside the vault).
export function resolveVault(flag, env = process.env, cwd = process.cwd()) {
  return resolve(flag || env.KB_VAULT || cwd);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Combine two states without losing anything: newest cursor and dates, union of queues.
export function mergeStates(a, b) {
  const fa = a.feishu ?? {};
  const fb = b.feishu ?? {};
  const union = (x = [], y = []) => [...new Set([...x, ...y])];
  const feishu = { ...fb, ...fa };
  if (fa.cursor_time !== undefined || fb.cursor_time !== undefined) {
    const newer = (fa.cursor_time ?? -1) >= (fb.cursor_time ?? -1) ? fa : fb;
    feishu.cursor_time = newer.cursor_time;
    feishu.cursor_ids = fa.cursor_time === fb.cursor_time ? union(fa.cursor_ids, fb.cursor_ids) : newer.cursor_ids ?? [];
  }
  if (fa.pending_ok || fb.pending_ok) feishu.pending_ok = union(fa.pending_ok, fb.pending_ok);
  if (fa.marked_failed || fb.marked_failed) feishu.marked_failed = union(fa.marked_failed, fb.marked_failed);
  const out = { ...b, ...a };
  if (Object.keys(feishu).length) out.feishu = feishu;
  const later = (x, y) => (!x ? y : !y ? x : x >= y ? x : y);
  if (a.last_lint || b.last_lint) out.last_lint = later(a.last_lint, b.last_lint);
  return out;
}

async function writeAtomic(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

// Move this machine's old ~/.second-brain/state.json into the vault (once).
export async function migrateLegacyState(vault, env = process.env) {
  const legacy = paths(env).legacyState;
  if (!existsSync(legacy)) return false;
  const old = (await readJson(legacy)) ?? {};
  const current = (await readJson(statePath(vault))) ?? {};
  await writeAtomic(statePath(vault), mergeStates(current, old));
  await rename(legacy, `${legacy}.migrated`);
  return true;
}

export async function readState(vault, env = process.env) {
  await migrateLegacyState(vault, env);
  return (await readJson(statePath(vault))) ?? {};
}

// Write to a temp file and rename, so a crash never leaves a half-written state.
export async function writeState(vault, state, env = process.env) {
  await migrateLegacyState(vault, env);
  await writeAtomic(statePath(vault), state);
}
