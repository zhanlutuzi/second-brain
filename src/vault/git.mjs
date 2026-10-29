// kb commit: optional version history (version_history in 我的设置.md).
// Each computer keeps its own history in ~/.second-brain/vault.git and points
// git at the vault with --work-tree, so nothing git-related lives in the vault
// and iCloud never carries it to another computer.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { paths } from '../state.mjs';

const run = promisify(execFile);

export async function commitVault(vault, message, { env = process.env, settings = {} } = {}) {
  if (!settings.version_history) {
    return { ok: false, error: 'not_configured', message: 'version_history is off in 我的设置.md; nothing committed' };
  }
  if (!message || !message.trim()) {
    return { ok: false, error: 'missing_message', message: 'Usage: kb commit -m <message>' };
  }

  const gitDir = paths(env).vaultGit;
  const work = await realpath(vault);
  const git = async (...args) => (await run('git', ['--git-dir', gitDir, '--work-tree', work, ...args], { cwd: work, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();

  if (!existsSync(gitDir)) {
    await run('git', ['init', '--quiet', gitDir.endsWith('.git') ? '--bare' : '', gitDir].filter(Boolean));
    await git('config', 'core.bare', 'false');
    await git('config', 'kb.vault', work);
  }
  // One history per vault: refuse if this git dir was made for another folder.
  const owner = await git('config', '--get', 'kb.vault').catch(() => '');
  if (owner && owner !== work) {
    return { ok: false, error: 'git_dir_in_use', message: `${gitDir} records ${owner}, not ${work}` };
  }
  if (!owner) await git('config', 'kb.vault', work);

  await git('add', '--all');
  const changed = await git('diff', '--cached', '--name-only');
  if (!changed) return { ok: true, committed: false, message: 'Nothing to commit' };
  try {
    await git('commit', '--quiet', '-m', message.trim());
  } catch (err) {
    return { ok: false, error: 'commit_failed', message: `${(err.stderr || err.message).trim()} (set git user.name / user.email first)` };
  }
  return { ok: true, committed: true, commit: await git('rev-parse', '--short', 'HEAD'), files: changed.split('\n').length };
}
