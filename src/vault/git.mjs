// kb commit: one commit per inbox/lint run (docs/TECH.md "版本控制").

import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function git(vault, args) {
  const { stdout } = await run('git', args, { cwd: vault, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

export async function commitVault(vault, message) {
  if (!message || !message.trim()) {
    return { ok: false, error: 'missing_message', message: 'Usage: kb commit -m <message>' };
  }
  let top;
  try {
    top = await git(vault, ['rev-parse', '--show-toplevel']);
  } catch {
    return { ok: false, error: 'not_a_git_repo', message: `${vault} is not a git repository; run /setup first` };
  }
  // Never commit on behalf of a parent repository that happens to contain the vault.
  if ((await realpath(top)) !== (await realpath(vault))) {
    return { ok: false, error: 'vault_not_git_root', message: `${vault} is inside the git repository at ${top}, not its root` };
  }

  await git(vault, ['add', '--all']);
  const changed = await git(vault, ['diff', '--cached', '--name-only']);
  if (!changed) return { ok: true, committed: false, message: 'Nothing to commit' };

  try {
    await git(vault, ['commit', '--quiet', '-m', message.trim()]);
  } catch (err) {
    return { ok: false, error: 'commit_failed', message: (err.stderr || err.message).trim() };
  }
  return {
    ok: true,
    committed: true,
    commit: await git(vault, ['rev-parse', '--short', 'HEAD']),
    files: changed.split('\n').length,
  };
}
