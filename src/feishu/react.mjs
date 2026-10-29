// kb react: mark processed Feishu messages with an emoji reaction.
// kb file queues filed message ids in state.feishu.pending_ok; failed fetches
// are found in inbox/ and marked once (state.feishu.marked_failed).

import { readFile } from 'node:fs/promises';
import { readState, writeState } from '../state.mjs';
import { inboxEntries } from '../vault/status.mjs';
import { FeishuError } from './client.mjs';

export async function queueReaction(vault, messageId, env) {
  const state = await readState(vault, env);
  const feishu = state.feishu ?? {};
  const pending = feishu.pending_ok ?? [];
  if (pending.includes(messageId)) return;
  state.feishu = { ...feishu, pending_ok: [...pending, messageId] };
  await writeState(vault, state, env);
}

async function failedInInbox(vault) {
  const { entries } = await inboxEntries(vault);
  return [...new Set(entries.filter((e) => e.source === 'feishu' && e.fetch_status === 'failed' && e.message_id).map((e) => e.message_id))];
}

export async function pendingReactions(vault, env, resultFile) {
  const state = await readState(vault, env);
  const feishu = state.feishu ?? {};
  const ok = new Set(feishu.pending_ok ?? []);
  const failedNow = await failedInInbox(vault);
  const marked = new Set(feishu.marked_failed ?? []);
  const failed = new Set(failedNow.filter((id) => !marked.has(id)));
  if (resultFile) {
    const extra = JSON.parse(await readFile(resultFile, 'utf8'));
    for (const id of extra.ok ?? []) ok.add(id);
    for (const id of extra.failed ?? []) failed.add(id);
  }
  return { ok: [...ok], failed: [...failed].filter((id) => !ok.has(id)), failedNow };
}

export async function react(vault, { client, env, settings, resultFile }) {
  const { ok, failed, failedNow } = await pendingReactions(vault, env, resultFile);
  const result = { ok: true, reacted_ok: 0, reacted_failed: 0, errors: [] };
  if (ok.length === 0 && failed.length === 0) return result;
  if (!client) return { ok: false, error: 'missing_credentials', message: 'FEISHU_APP_ID / FEISHU_APP_SECRET are not set in ~/.second-brain/.env' };

  const done = new Set();
  const markedNow = new Set();
  async function tryReact(id, emoji) {
    try {
      await client.addReaction(id, emoji);
      return true;
    } catch (err) {
      result.errors.push({ message_id: id, error: err.message, code: err.code ?? null });
      // An API error (withdrawn message, no permission...) will not fix itself: drop it.
      // Network errors keep the id queued for the next run.
      return err instanceof FeishuError && err.code !== undefined;
    }
  }

  for (const id of ok) {
    const reacted = await tryReact(id, settings.reaction_ok);
    if (reacted) done.add(id);
    if (reacted && !result.errors.some((e) => e.message_id === id)) result.reacted_ok++;
  }
  for (const id of failed) {
    const reacted = await tryReact(id, settings.reaction_failed);
    if (reacted) markedNow.add(id);
    if (reacted && !result.errors.some((e) => e.message_id === id)) result.reacted_failed++;
  }

  const state = await readState(vault, env);
  const feishu = state.feishu ?? {};
  const stillFailed = new Set(failedNow);
  state.feishu = {
    ...feishu,
    pending_ok: (feishu.pending_ok ?? []).filter((id) => !done.has(id)),
    // Forget failures that left the inbox, so a re-sent message can be marked again.
    marked_failed: [...new Set([...(feishu.marked_failed ?? []), ...markedNow])].filter((id) => stillFailed.has(id)),
  };
  await writeState(vault, state, env);
  return result;
}
