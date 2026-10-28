import { cp, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATE = fileURLToPath(new URL('../vault-template', import.meta.url));
export const EXAMPLES = fileURLToPath(new URL('../examples/inbox', import.meta.url));

// A fresh vault from vault-template in a temp dir, plus an isolated ~/.second-brain.
export async function makeVault({ examples = false } = {}) {
  const tmp = await mkdtemp(join(tmpdir(), 'kb-test-'));
  const vault = join(tmp, 'vault');
  await cp(TEMPLATE, vault, { recursive: true });
  if (examples) await cp(EXAMPLES, join(vault, 'inbox'), { recursive: true });
  const env = { SECOND_BRAIN_HOME: join(tmp, 'home') };
  return { tmp, vault, env, cleanup: () => rm(tmp, { recursive: true, force: true }) };
}

export async function put(vault, rel, text) {
  const file = join(vault, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
  return file;
}

export const get = (vault, rel) => readFile(join(vault, rel), 'utf8');

export async function inboxMarkdown(vault) {
  return (await readdir(join(vault, 'inbox'))).filter((n) => n.endsWith('.md')).sort();
}

export function page({ type = '主题', title = 'T', summary = 's', sources = [], tags = [], created = '2026-10-28', updated = '2026-10-28' } = {}, body = '') {
  const list = (a) => `[${a.map((x) => JSON.stringify(x)).join(', ')}]`;
  return `---\ntype: ${type}\ntitle: ${title}\nsummary: ${summary}\ncreated: ${created}\nupdated: ${updated}\nsources: ${list(sources)}\ntags: ${list(tags)}\n---\n${body}`;
}
