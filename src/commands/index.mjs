// Registry of kb subcommands. Each entry describes its arguments for --help and
// option parsing; `run` receives a context and returns a result object.
// Stubs report the stage (see docs/TECH.md) in which they get implemented.

import { notImplemented } from '../result.mjs';

const stub = (name, stage) => async () => notImplemented(name, stage);

export const COMMANDS = [
  {
    name: 'pull',
    usage: 'kb pull [--dry-run]',
    summary: 'Pull new Feishu messages into inbox/ and advance the cursor',
    options: { 'dry-run': { type: 'boolean' } },
    stage: 'P2',
    run: stub('pull', 'P2'),
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
    usage: 'kb file <file>',
    summary: 'Move an inbox entry into raw/YYYY/MM/ with a normalized name',
    options: {},
    stage: 'P1',
    run: stub('file', 'P1'),
  },
  {
    name: 'index',
    usage: 'kb index',
    summary: 'Regenerate index.md from wiki page frontmatter',
    options: {},
    stage: 'P1',
    run: stub('index', 'P1'),
  },
  {
    name: 'lint',
    usage: 'kb lint',
    summary: 'Run deterministic checks (dead links, orphans, frontmatter, ...)',
    options: {},
    stage: 'P1',
    run: stub('lint', 'P1'),
  },
  {
    name: 'react',
    usage: 'kb react <result-file>',
    summary: 'Add emoji reactions to Feishu messages based on processing results',
    options: {},
    stage: 'P2',
    run: stub('react', 'P2'),
  },
  {
    name: 'commit',
    usage: 'kb commit -m <message>',
    summary: 'Commit the vault once',
    options: { message: { type: 'string', short: 'm' } },
    stage: 'P1',
    run: stub('commit', 'P1'),
  },
  {
    name: 'status',
    usage: 'kb status',
    summary: 'Show pending inbox entries, last lint date and unanswered question',
    options: {},
    stage: 'P1',
    run: stub('status', 'P1'),
  },
];

export function findCommand(name) {
  return COMMANDS.find((c) => c.name === name);
}
