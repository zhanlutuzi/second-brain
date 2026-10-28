// Registry of kb subcommands. Each entry describes its arguments for --help and
// option parsing; `run` receives a context and returns a result object.
// Stubs report the stage (see docs/TECH.md) in which they get implemented.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../feishu/client.mjs';
import { loadCredentials, mask } from '../feishu/config.mjs';
import { pull } from '../feishu/pull.mjs';
import { react } from '../feishu/react.mjs';
import { lintVault } from '../lint/index.mjs';
import { fail, notImplemented, ok } from '../result.mjs';
import { fileEntry } from '../vault/file.mjs';
import { commitVault } from '../vault/git.mjs';
import { writeIndex } from '../vault/indexer.mjs';
import { SETTINGS_FILE } from '../vault/layout.mjs';
import { readSettings } from '../vault/settings.mjs';
import { setQuestion } from '../vault/question.mjs';
import { vaultStatus } from '../vault/status.mjs';

const stub = (name, stage) => async () => notImplemented(name, stage);

// Vault commands refuse to run anywhere that is not a vault (e.g. the kit repo),
// so a stray `kb commit` can never commit someone else's files.
const inVault = (fn) => async (ctx) => {
  if (!existsSync(join(ctx.vault, SETTINGS_FILE))) {
    return fail('not_a_vault', `${ctx.vault} is not a vault (no ${SETTINGS_FILE}); cd into the vault or pass --vault`);
  }
  return fn(ctx);
};

// Build a Feishu client from ~/.second-brain/.env; ctx.fetch lets tests inject fixtures.
async function feishu(ctx) {
  const creds = await loadCredentials(ctx.env);
  const client = creds.appId && creds.appSecret ? createClient({ ...creds, fetch: ctx.fetch ?? globalThis.fetch }) : null;
  return { client, secrets: [creds.appSecret] };
}

// Run a Feishu call and turn API/network errors into JSON results with secrets masked.
async function withFeishu(ctx, fn) {
  const { client, secrets } = await feishu(ctx);
  try {
    return await fn(client);
  } catch (err) {
    return fail('feishu_error', mask(err.message, secrets), { code: err.code ?? null });
  }
}

// Feishu is optional: a vault fed only by Web Clipper has no credentials and no chat id.
const notConfigured = () => fail('not_configured', 'Feishu is not configured (no credentials, no feishu_chat_id); skipped');

function onePositional(ctx, label) {
  if (ctx.positionals.length !== 1) return fail('invalid_arguments', `Usage: kb ${ctx.command} <${label}>`);
  return null;
}

export const COMMANDS = [
  {
    name: 'pull',
    usage: 'kb pull [--dry-run] [--since <YYYY-MM-DD>]',
    summary: 'Pull new Feishu messages into inbox/ and advance the cursor',
    options: { 'dry-run': { type: 'boolean' }, since: { type: 'string' } },
    stage: 'P2',
    run: inVault((ctx) =>
      withFeishu(ctx, async (client) => {
        const settings = await readSettings(ctx.vault);
        if (!client && !settings.feishu_chat_id) return notConfigured();
        if (!client) return fail('missing_credentials', 'FEISHU_APP_ID / FEISHU_APP_SECRET are not set in ~/.second-brain/.env');
        return pull(ctx.vault, { client, env: ctx.env, settings, dryRun: ctx.args['dry-run'], since: ctx.args.since });
      })),
  },
  {
    name: 'fetch',
    usage: 'kb fetch <file>',
    summary: 'Fetch the linked page of an inbox entry and write the body back',
    options: {},
    stage: 'P3',
    run: stub('fetch', 'P3'),
  },
  {
    name: 'file',
    usage: 'kb file <file> [--title <t>] [--summary <s>]',
    summary: 'Move an inbox entry into raw/YYYY/MM/ with a normalized name',
    options: { title: { type: 'string' }, summary: { type: 'string' } },
    stage: 'P1',
    run: inVault(async (ctx) =>
      onePositional(ctx, 'file') ??
      fileEntry(ctx.vault, ctx.positionals[0], { title: ctx.args.title, summary: ctx.args.summary, env: ctx.env })),
  },
  {
    name: 'index',
    usage: 'kb index',
    summary: 'Regenerate index.md from wiki page frontmatter',
    options: {},
    stage: 'P1',
    run: inVault(async (ctx) => ok(await writeIndex(ctx.vault))),
  },
  {
    name: 'lint',
    usage: 'kb lint',
    summary: 'Run deterministic checks (dead links, orphans, frontmatter, ...)',
    options: {},
    stage: 'P1',
    run: inVault(async (ctx) => ok(await lintVault(ctx.vault))),
  },
  {
    name: 'react',
    usage: 'kb react [<result-file>]',
    summary: 'Add emoji reactions to Feishu messages based on processing results',
    options: {},
    stage: 'P2',
    run: inVault((ctx) =>
      withFeishu(ctx, async (client) => {
        const settings = await readSettings(ctx.vault);
        if (!client && !settings.feishu_chat_id) return notConfigured();
        return react(ctx.vault, { client, env: ctx.env, settings, resultFile: ctx.positionals[0] });
      })),
  },
  {
    name: 'commit',
    usage: 'kb commit -m <message>',
    summary: 'Commit the vault once',
    options: { message: { type: 'string', short: 'm' } },
    stage: 'P1',
    run: inVault(async (ctx) => commitVault(ctx.vault, ctx.args.message)),
  },
  {
    name: 'status',
    usage: 'kb status',
    summary: 'Show pending inbox entries, last lint date and unanswered question',
    options: {},
    stage: 'P1',
    run: inVault(async (ctx) => vaultStatus(ctx.vault, ctx.env)),
  },
  {
    name: 'question',
    usage: 'kb question --set <text> [--related <page>] | --clear',
    summary: 'Remember or clear the follow-up question asked after an inbox run',
    options: { set: { type: 'string' }, related: { type: 'string' }, clear: { type: 'boolean' } },
    stage: 'P1',
    run: async (ctx) => setQuestion({ text: ctx.args.set, related: ctx.args.related, clear: ctx.args.clear }, ctx.env),
  },
];

export function findCommand(name) {
  return COMMANDS.find((c) => c.name === name);
}
