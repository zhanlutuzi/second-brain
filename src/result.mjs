// Every kb subcommand returns one of these plain objects; the CLI prints it as a
// single line of JSON on stdout so skills can parse it without guessing.

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_NOT_IMPLEMENTED = 2;

export function ok(data = {}) {
  return { ok: true, ...data };
}

export function fail(error, message, extra = {}) {
  return { ok: false, error, message, ...extra };
}

export function notImplemented(command, stage) {
  return fail('not_implemented', `kb ${command} is planned for stage ${stage}`, { command, stage });
}

export function exitCodeFor(result) {
  if (result.ok) return EXIT_OK;
  return result.error === 'not_implemented' ? EXIT_NOT_IMPLEMENTED : EXIT_ERROR;
}
