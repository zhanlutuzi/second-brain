// This is a public repository: fail the build if anything that looks like a real
// Feishu ID, token or secret is committed. Placeholders like oc_xxx are fine.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'coverage', 'package-lock.json']);

const PATTERNS = [
  ['Feishu ID', /\b(?:oc|om|ou|on|cli)_[0-9a-f]{16,}\b/],
  ['Feishu access token', /\b[tu]-[0-9A-Za-z_-]{30,}/],
  ['App Secret value', /(?:app_?secret|FEISHU_APP_SECRET)["']?\s*[:=]\s*["']?[0-9A-Za-z]{16,}/i],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{30,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('no secrets or real IDs in the repository', () => {
  const all = files(ROOT);

  it('scans a meaningful number of files', () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it.each(PATTERNS)('contains no %s', (_label, re) => {
    const hits = all
      .filter((p) => re.test(readFileSync(p, 'utf8')))
      .map((p) => relative(ROOT, p));
    expect(hits).toEqual([]);
  });

  it('detects the patterns it is meant to catch', () => {
    const samples = [
      'oc_' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      't-' + 'g1044abcdefghijklmnopqrstuvwxyz0123',
      'FEISHU_APP_SECRET=' + 'AbCdEf0123456789AbCdEf',
    ];
    for (const s of samples) expect(PATTERNS.some(([, re]) => re.test(s)), s).toBe(true);
    expect(PATTERNS.some(([, re]) => re.test('oc_xxx om_xxx'))).toBe(false);
  });
});
