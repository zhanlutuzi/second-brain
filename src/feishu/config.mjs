// Feishu credentials live in ~/.second-brain/.env (never in the vault):
//   FEISHU_APP_ID=cli_...
//   FEISHU_APP_SECRET=...
// Real environment variables take precedence over the file.

import { readFile } from 'node:fs/promises';
import { paths } from '../state.mjs';

export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export async function loadCredentials(env = process.env) {
  let file = {};
  try {
    file = parseEnvFile(await readFile(paths(env).env, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const appId = env.FEISHU_APP_ID || file.FEISHU_APP_ID || '';
  const appSecret = env.FEISHU_APP_SECRET || file.FEISHU_APP_SECRET || '';
  return { appId, appSecret };
}

// Hide secrets in anything we print.
export function mask(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('***');
  return out;
}
