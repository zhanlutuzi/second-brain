import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeDir, mergeStates, paths, readState, resolveVault, statePath, writeState } from '../src/state.mjs';

describe('paths', () => {
  it('defaults to ~/.second-brain', () => {
    expect(homeDir({})).toBe(join(homedir(), '.second-brain'));
  });

  it('honours SECOND_BRAIN_HOME', () => {
    expect(paths({ SECOND_BRAIN_HOME: '/tmp/sb' })).toEqual({
      home: '/tmp/sb',
      legacyState: '/tmp/sb/state.json',
      env: '/tmp/sb/.env',
      vaultGit: '/tmp/sb/vault.git',
      browser: '/tmp/sb/browser',
    });
  });

  it('keeps processing state inside the vault', () => {
    expect(statePath('/v')).toBe('/v/.kb/state.json');
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
  let tmp;
  let vault;
  let env;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'kb-state-'));
    vault = join(tmp, 'vault');
    env = { SECOND_BRAIN_HOME: join(tmp, 'home') };
  });
  afterEach(() => rm(tmp, { recursive: true, force: true }));

  it('reads as empty when missing', async () => {
    expect(await readState(vault, env)).toEqual({});
  });

  it('round-trips through <vault>/.kb/state.json', async () => {
    const state = { feishu: { cursor_time: 1761611411, cursor_ids: ['om_example'] }, last_lint: '2026-10-01' };
    await writeState(vault, state, env);
    expect(await readState(vault, env)).toEqual(state);
    expect(JSON.parse(await readFile(join(vault, '.kb/state.json'), 'utf8'))).toEqual(state);
    expect(existsSync(join(tmp, 'home', 'state.json'))).toBe(false);
  });

  it('migrates the v0.1.0 state from ~/.second-brain once', async () => {
    await mkdir(join(tmp, 'home'), { recursive: true });
    await writeFile(join(tmp, 'home', 'state.json'), JSON.stringify({ feishu: { cursor_time: 5, cursor_ids: ['a'], pending_ok: ['x'] }, last_lint: '2026-10-01' }));
    await writeState(vault, { feishu: { cursor_time: 3, cursor_ids: ['b'], pending_ok: ['y'] }, last_lint: '2026-10-20' }, { SECOND_BRAIN_HOME: join(tmp, 'other') });

    expect(await readState(vault, env)).toEqual({ feishu: { cursor_time: 5, cursor_ids: ['a'], pending_ok: ['y', 'x'] }, last_lint: '2026-10-20' });
    expect(existsSync(join(tmp, 'home', 'state.json'))).toBe(false);
    expect(existsSync(join(tmp, 'home', 'state.json.migrated'))).toBe(true);
  });

  it('merges states without losing queued work', () => {
    expect(mergeStates({ feishu: { cursor_time: 7, cursor_ids: ['a'], marked_failed: ['f1'] } }, { feishu: { cursor_time: 7, cursor_ids: ['b'], marked_failed: ['f2'] }, pending_question: { text: 'q' } }))
      .toEqual({ feishu: { cursor_time: 7, cursor_ids: ['a', 'b'], marked_failed: ['f1', 'f2'] }, pending_question: { text: 'q' } });
  });
});
