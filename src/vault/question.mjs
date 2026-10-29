// kb question: remember (or forget) the one follow-up question per inbox run.

import { readState, writeState } from '../state.mjs';
import { localDate } from '../util/date.mjs';

export async function setQuestion(vault, { text, related, clear }, env = process.env, now = new Date()) {
  if (clear && text) return { ok: false, error: 'invalid_arguments', message: 'Use either --set or --clear' };
  if (!clear && !text?.trim()) {
    return { ok: false, error: 'invalid_arguments', message: 'Usage: kb question --set <text> [--related <page>] | --clear' };
  }
  const state = await readState(vault, env);
  if (clear) {
    delete state.pending_question;
  } else {
    state.pending_question = { asked_at: localDate(now), text: text.trim(), related: related?.trim() ?? '' };
  }
  await writeState(vault, state, env);
  return { ok: true, pending_question: state.pending_question ?? null };
}
