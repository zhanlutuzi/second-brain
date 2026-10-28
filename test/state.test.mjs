import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeDir, paths, readState, resolveVault, writeState } from '../src/state.mjs';

describe('paths', () => {
  it('defaults to ~/.second-brain', () => {
    expect(homeDir({})).toBe(join(homedir(), '.second-brain'));
  });

  it('honours SECOND_BRAIN_HOME', () => {
    const p = paths({ SECOND_BRAIN_HOME: '/tmp/sb' });
    expect(p).toEqual({
      home: '/tmp/sb',
      state: '/tmp/sb/state.json',
      env: '/tmp/sb/.env',
      vaultGit: '/tmp/sb/vault.git',
      browser: '/tmp/sb/browser',
    });
  });
});

describe('resolveVault', () => {
  it('prefers --vault, then KB_VAULT, then cwd', () => {
    expect(resolveVault('/a', { KB_VAULT: '/b' }, '/c')).toBe('/a');
    expect(resolveVault(undefined, { KB_VAULT: '/b' }, '/c')).toBe('/b');
    expect(resolveVault(undefined, {}, '/c')).toBe('/c');
    expect(resolveVault('rel', {}, '/c')).toBe(resolve('rel'));
  });
});

describe('state file', () => {
  let env;
  beforeEach(async () => {
    env = { SECOND_BRAIN_HOME: join(await mkdtemp(join(tmpdir(), 'kb-state-')), 'home') };
  });
  afterEach(async () => {
    await rm(resolve(env.SECOND_BRAIN_HOME, '..'), { recursive: true, force: true });
  });

  it('reads as empty when missing', async () => {
    expect(await readState(env)).toEqual({});
  });

  it('round-trips and creates the directory', async () => {
    const state = { feishu: { cursor_time: 1761611411, last_message_id: 'om_example' }, last_lint: '2026-10-01' };
    await writeState(state, env);
    expect(await readState(env)).toEqual(state);
    expect(await readFile(paths(env).state, 'utf8')).toMatch(/\n$/);
  });
});
