import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { helpText, main } from '../src/cli.mjs';
import { COMMANDS } from '../src/commands/index.mjs';

const KB = fileURLToPath(new URL('../bin/kb.mjs', import.meta.url));
const TEMPLATE = fileURLToPath(new URL('../vault-template', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const EXPECTED = ['pull', 'fetch', 'file', 'index', 'lint', 'react', 'commit', 'status', 'init', 'upgrade', 'config', 'question'];

// Run main() with captured stdout.
async function run(argv, env = {}) {
  let out = '';
  const io = { stdout: { write: (s) => { out += s; } } };
  const code = await main(argv, io, env);
  return { code, out };
}

describe('kb --help', () => {
  it('lists every subcommand from docs/TECH.md', () => {
    expect(COMMANDS.map((c) => c.name).sort()).toEqual([...EXPECTED].sort());
    const text = helpText();
    for (const name of EXPECTED) expect(text).toMatch(new RegExp(`^  kb ${name}\\b`, 'm'));
  });

  it('works end to end through bin/kb.mjs', () => {
    const out = execFileSync(process.execPath, [KB, '--help'], { encoding: 'utf8' });
    for (const name of EXPECTED) expect(out).toContain(`kb ${name}`);
  });

  it.each([[[]], [['-h']], [['help']]])('prints help for %j', async (argv) => {
    const { code, out } = await run(argv);
    expect(code).toBe(0);
    expect(out).toBe(helpText());
  });

  it('prints per-command help', async () => {
    const { code, out } = await run(['commit', '--help']);
    expect(code).toBe(0);
    expect(out).toContain('kb commit -m <message>');
  });
});

describe('kb --version', () => {
  it('matches package.json', async () => {
    const { code, out } = await run(['--version']);
    expect(code).toBe(0);
    expect(out.trim()).toBe(pkg.version);
  });
});

describe('JSON output contract', () => {
  let tmp;
  let env;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'kb-cli-'));
    await cp(TEMPLATE, join(tmp, 'vault'), { recursive: true });
    env = { KB_VAULT: join(tmp, 'vault'), SECOND_BRAIN_HOME: join(tmp, 'home') };
  });
  afterEach(() => rm(tmp, { recursive: true, force: true }));

  it.each(EXPECTED)('kb %s prints exactly one JSON object', async (name) => {
    // Never let a test git-pull this repository.
    const { out } = await run(name === 'upgrade' ? [name, '--no-pull'] : [name], env);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(out)).toHaveProperty('ok');
  });

  it.each(['status', 'index', 'lint', 'commit', 'file', 'fetch', 'pull', 'react'])('kb %s refuses to run outside a vault', async (name) => {
    const { code, out } = await run([name, '-m', 'x'].slice(0, name === 'commit' ? 3 : 1), { ...env, KB_VAULT: tmp });
    expect(code).toBe(1);
    expect(JSON.parse(out).error).toBe('not_a_vault');
  });

  it('reports unknown commands as JSON with a non-zero exit code', async () => {
    const { code, out } = await run(['nope']);
    expect(code).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false, error: 'unknown_command', command: 'nope' });
  });

  it('reports unknown options as JSON with a non-zero exit code', async () => {
    const { code, out } = await run(['status', '--bogus'], env);
    expect(code).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false, error: 'invalid_arguments' });
  });

  it('passes command-specific options through', async () => {
    expect(JSON.parse((await run(['pull', '--dry-run', '--since', '2026-10-01'], env)).out).error).toBe('not_configured');
    expect(JSON.parse((await run(['react'], env)).out).error).toBe('not_configured');
    expect(JSON.parse((await run(['file', 'a', 'b'], env)).out).error).toBe('invalid_arguments');
  });

  it('exits non-zero through bin/kb.mjs when a command fails', () => {
    let status = 0;
    let stdout = '';
    try {
      execFileSync(process.execPath, [KB, 'fetch', 'x'], { encoding: 'utf8', cwd: tmp });
    } catch (err) {
      ({ status, stdout } = err);
    }
    expect(status).toBe(1);
    expect(JSON.parse(stdout).error).toBe('not_a_vault');
  });
});
