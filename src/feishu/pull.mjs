// kb pull: Feishu chat history → inbox/ entries, then advance the cursor.
// The cursor only moves after every entry was written, so a failed run can be
// repeated safely: existing feishu-<id>.md files and cursor_ids are skipped.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { machineName, readState, writeState } from '../state.mjs';
import { isoLocal } from '../util/date.mjs';
import { stringifyMarkdown } from '../vault/frontmatter.mjs';
import { sanitizeName } from '../vault/layout.mjs';
import { mapMessage, textFileKind } from './messages.mjs';

const TEXT_FILES = new Set(['.md', '.markdown', '.txt', '.csv']);
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp', 'image/heic': '.heic' };

function attachmentName(messageId, resource, contentType) {
  if (resource.type === 'image') return `feishu-${messageId}${IMAGE_EXT[contentType.split(';')[0].trim()] ?? '.png'}`;
  const ext = extname(resource.name ?? '');
  const base = sanitizeName(ext ? resource.name.slice(0, -ext.length) : resource.name);
  return `feishu-${messageId}-${base}${ext.replace(/[^.\w]/g, '')}`;
}

function entryName(messageId, i) {
  return i === 0 ? `feishu-${messageId}.md` : `feishu-${messageId}-${i + 1}.md`;
}

export async function pull(vault, { client, env, settings, dryRun = false, since, now = Date.now() }) {
  const chatId = settings.feishu_chat_id;
  if (!chatId) return { ok: false, error: 'missing_chat_id', message: 'feishu_chat_id is empty in 我的设置.md; run /setup' };

  const state = await readState(vault, env);
  if (!dryRun) {
    // Tell other computers this vault is being processed right now.
    state.last_run = { machine: machineName(env), at: isoLocal(now) };
    await writeState(vault, state, env);
  }
  const feishu = state.feishu ?? {};
  let startTime = feishu.cursor_time;
  if (startTime === undefined && since) {
    const t = Date.parse(`${since}T00:00:00`);
    if (Number.isNaN(t)) return { ok: false, error: 'invalid_arguments', message: '--since must be YYYY-MM-DD' };
    startTime = Math.floor(t / 1000);
  }
  const seen = new Set(feishu.cursor_ids ?? []);
  const inbox = join(vault, 'inbox');

  const created = [];
  const skipped = [];
  let cursorTime = feishu.cursor_time ?? null;
  let cursorIds = [...seen];
  let pageToken;

  do {
    const page = await client.listMessages({ chatId, startTime, pageToken });
    pageToken = page.has_more ? page.page_token : undefined;

    for (const item of page.items ?? []) {
      const id = item.message_id;
      const sec = Math.floor(Number(item.create_time) / 1000);
      // Track the newest second seen and every id inside it.
      if (cursorTime === null || sec > cursorTime) {
        cursorTime = sec;
        cursorIds = [id];
      } else if (sec === cursorTime && !cursorIds.includes(id)) {
        cursorIds.push(id);
      }

      if (seen.has(id) || existsSync(join(inbox, entryName(id, 0)))) continue;

      const children = item.msg_type === 'merge_forward' ? (await client.getMessage(id)).items ?? [] : [];
      const mapped = mapMessage(item, { children });
      if (mapped.skip) {
        if (!['bot', 'system', 'deleted', 'empty'].includes(mapped.skip)) skipped.push({ message_id: id, reason: mapped.skip });
        continue;
      }

      const sentAt = isoLocal(item.create_time);
      // Write attachments first so an entry never points at a missing file.
      const files = [];
      for (const [i, entry] of mapped.entries.entries()) {
        let body = entry.body;
        let kind = entry.kind;
        let attachment;
        if (entry.resource && !dryRun) {
          const { data, contentType } = await client.downloadResource(id, entry.resource.key, entry.resource.type);
          attachment = attachmentName(id, entry.resource, contentType);
          await mkdir(inbox, { recursive: true });
          await writeFile(join(inbox, attachment), data);
          if (TEXT_FILES.has(extname(attachment).toLowerCase())) {
            body = data.toString('utf8');
            kind = textFileKind(kind, body);
          } else {
            body = `![[${attachment}]]\n`;
          }
        }
        const data = {
          source: 'feishu',
          message_id: id,
          sent_at: sentAt,
          kind,
          ...(entry.url ? { url: entry.url } : {}),
          note: entry.note ?? '',
          // Links still need kb fetch; everything else is complete.
          ...(kind === 'link' ? {} : { fetch_status: 'skipped' }),
          fetch_error: '',
          ...(attachment ? { attachment } : {}),
        };
        files.push({ name: entryName(id, i), text: stringifyMarkdown(data, body), kind, url: entry.url });
      }

      for (const f of files) {
        if (!dryRun) {
          await mkdir(inbox, { recursive: true });
          await writeFile(join(inbox, f.name), f.text, 'utf8');
        }
        created.push({ path: `inbox/${f.name}`, kind: f.kind, message_id: id, ...(f.url ? { url: f.url } : {}) });
      }
    }
  } while (pageToken);

  if (!dryRun && cursorTime !== null) {
    const latest = await readState(vault, env);
    latest.feishu = { ...(latest.feishu ?? {}), cursor_time: cursorTime, cursor_ids: cursorIds };
    await writeState(vault, latest, env);
  }

  return { ok: true, dry_run: dryRun, new: created, skipped, cursor: { cursor_time: cursorTime, cursor_ids: cursorIds } };
}
