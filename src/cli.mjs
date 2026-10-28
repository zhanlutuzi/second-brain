// kb command-line front end: parses argv, dispatches to a subcommand and prints
// its result as one line of JSON. Help and version go to stdout as plain text.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { COMMANDS, findCommand } from './commands/index.mjs';
import { EXIT_OK, exitCodeFor, fail } from './result.mjs';
import { resolveVault } from './state.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Options accepted by every subcommand.
const GLOBAL_OPTIONS = {
  vault: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

export function helpText() {
  const width = Math.max(...COMMANDS.map((c) => c.usage.length));
  const lines = COMMANDS.map((c) => `  ${c.usage.padEnd(width)}  ${c.summary}`);
  return [
    `kb ${pkg.version} — second-brain-kit command line`,
    '',
    'Usage: kb <command> [options]',
    '',
    'Commands:',
    ...lines,
    '',
    'Global options:',
    '  --vault <path>  Vault directory (default: $KB_VAULT, then the current directory)',
    '  -h, --help      Show help (also: kb <command> --help)',
    '  -v, --version   Show version',
    '',
    'Every command prints a single JSON object to stdout.',
    '',
  ].join('\n');
}

function commandHelp(cmd) {
  return `${cmd.usage}\n\n${cmd.summary}\n`;
}

function printJson(io, result) {
  io.stdout.write(`${JSON.stringify(result)}\n`);
  return exitCodeFor(result);
}

export async function main(argv, io = process, env = process.env) {
  const [name, ...rest] = argv;

  if (name === undefined || name === '-h' || name === '--help' || name === 'help') {
    io.stdout.write(helpText());
    return EXIT_OK;
  }
  if (name === '-v' || name === '--version') {
    io.stdout.write(`${pkg.version}\n`);
    return EXIT_OK;
  }

  const cmd = findCommand(name);
  if (!cmd) {
    return printJson(io, fail('unknown_command', `Unknown command "${name}". Run "kb --help".`, { command: name }));
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: { ...GLOBAL_OPTIONS, ...cmd.options },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    return printJson(io, fail('invalid_arguments', err.message, { command: name }));
  }

  if (parsed.values.help) {
    io.stdout.write(commandHelp(cmd));
    return EXIT_OK;
  }

  const ctx = {
    command: name,
    args: parsed.values,
    positionals: parsed.positionals,
    vault: resolveVault(parsed.values.vault, env),
    env,
  };

  try {
    return printJson(io, await cmd.run(ctx));
  } catch (err) {
    return printJson(io, fail('internal_error', err.message, { command: name }));
  }
}
