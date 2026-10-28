import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { helpText, main } from '../src/cli.mjs';
import { COMMANDS } from '../src/commands/index.mjs';

const KB = fileURLToPath(new URL('../bin/kb.mjs', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const EXPECTED = ['pull', 'fetch', 'file', 'index', 'lint', 'react', 'commit', 'status'];

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
  it.each(EXPECTED)('kb %s prints one JSON object', async (name) => {
    const { code, out } = await run([name, 'some-arg']);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.trim().split('\n')).toHaveLength(1);
    const result = JSON.parse(out);
    // P0: every command is a stub that names the stage implementing it.
    expect(result).toMatchObject({ ok: false, error: 'not_implemented', command: name });
    expect(result.stage).toMatch(/^P[1-4]$/);
    expect(code).toBe(2);
  });

  it('reports unknown commands as JSON with a non-zero exit code', async () => {
    const { code, out } = await run(['nope']);
    expect(code).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false, error: 'unknown_command', command: 'nope' });
  });

  it('reports unknown options as JSON with a non-zero exit code', async () => {
    const { code, out } = await run(['status', '--bogus']);
    expect(code).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false, error: 'invalid_arguments' });
  });

  it('accepts command-specific options', async () => {
    expect(JSON.parse((await run(['commit', '-m', 'msg'])).out).error).toBe('not_implemented');
    expect(JSON.parse((await run(['pull', '--dry-run'])).out).error).toBe('not_implemented');
  });

  it('exits with the stub code through bin/kb.mjs', () => {
    let status = 0;
    let stdout = '';
    try {
      execFileSync(process.execPath, [KB, 'status'], { encoding: 'utf8' });
    } catch (err) {
      ({ status, stdout } = err);
    }
    expect(status).toBe(2);
    expect(JSON.parse(stdout).error).toBe('not_implemented');
  });
});
