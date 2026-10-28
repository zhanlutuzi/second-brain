// Machine state lives outside the vault (never synced to iCloud, never committed):
//   ~/.second-brain/state.json   cursor, last lint date, pending question
//   ~/.second-brain/.env         Feishu App Secret
//   ~/.second-brain/vault.git    the vault's separate git dir
//   ~/.second-brain/browser      Playwright persistent profile
// SECOND_BRAIN_HOME overrides the base directory (used by tests).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function homeDir(env = process.env) {
  return env.SECOND_BRAIN_HOME ? resolve(env.SECOND_BRAIN_HOME) : join(homedir(), '.second-brain');
}

export function paths(env = process.env) {
  const home = homeDir(env);
  return {
    home,
    state: join(home, 'state.json'),
    env: join(home, '.env'),
    vaultGit: join(home, 'vault.git'),
    browser: join(home, 'browser'),
  };
}

// Vault location: --vault flag first, then KB_VAULT, then the current directory
// (skills run kb from inside the vault).
export function resolveVault(flag, env = process.env, cwd = process.cwd()) {
  return resolve(flag || env.KB_VAULT || cwd);
}

export async function readState(env = process.env) {
  try {
    return JSON.parse(await readFile(paths(env).state, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

// Write to a temp file and rename, so a crash never leaves a half-written state.
export async function writeState(state, env = process.env) {
  const file = paths(env).state;
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}
