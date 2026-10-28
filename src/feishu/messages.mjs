// Map Feishu messages to inbox entries (docs/TECH.md "消息到条目的映射").
// Pure functions: no I/O, so every message shape can be tested from fixtures.

const URL_RE = /https?:\/\/[^\s<>"'`，。！？；、）】」》]+/g;
const TRAILING = /[.,;:!?)\]}'"]+$/;

const MEETING_FILE = /会议|纪要/;
const MEETING_LINE = /^\s*会议[:：]/;

export const UNSUPPORTED = new Set(['audio', 'media', 'sticker', 'share_chat', 'share_user', 'interactive', 'location', 'video_chat', 'todo', 'vote', 'hongbao', 'share_calendar_event', 'calendar', 'general_calendar']);

export function parseContent(item) {
  try {
    return JSON.parse(item.body?.content ?? '{}');
  } catch {
    return {};
  }
}

export function extractUrls(text) {
  const urls = [];
  for (const m of String(text).matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING, '');
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

// Replace @_user_1 placeholders with the mentioned names.
function resolveMentions(text, mentions = []) {
  let out = text;
  for (const m of mentions) out = out.split(m.key).join(`@${m.name}`);
  return out;
}

// Rich text ("post") → plain text. Content may be wrapped in a locale key.
export function postToText(content) {
  let post = content;
  if (!Array.isArray(post.content)) {
    const locale = Object.values(content).find((v) => v && Array.isArray(v.content));
    post = locale ?? { content: [] };
  }
  const lines = [];
  if (post.title) lines.push(post.title);
  for (const paragraph of post.content) {
    const parts = [];
    for (const el of paragraph ?? []) {
      if (el.tag === 'text' || el.tag === 'md') parts.push(el.text ?? '');
      else if (el.tag === 'a') parts.push(el.href && el.text && el.text !== el.href ? `${el.text} ${el.href}` : el.href ?? el.text ?? '');
      else if (el.tag === 'at') parts.push(`@${el.user_name ?? el.user_id ?? ''}`);
      else if (el.tag === 'code_block') parts.push(el.text ?? '');
      else if (el.tag === 'img') parts.push('[图片]');
      else if (el.tag === 'media') parts.push('[视频]');
    }
    lines.push(parts.join(''));
  }
  return lines.join('\n').trim();
}

export function messageText(item) {
  const content = parseContent(item);
  if (item.msg_type === 'text') return resolveMentions(content.text ?? '', item.mentions);
  if (item.msg_type === 'post') return resolveMentions(postToText(content), item.mentions);
  return '';
}

// Text or rich text → one link entry per URL, or a thought.
function textEntries(text) {
  const urls = extractUrls(text);
  if (urls.length === 0) return [{ kind: 'thought', body: `${text.trim()}\n` }];
  let note = text;
  for (const url of urls) note = note.split(url).join(' ');
  note = note.replace(/\s+/g, ' ').trim();
  return urls.map((url) => ({ kind: 'link', url, note, body: '' }));
}

const isMeetingText = (text) => MEETING_LINE.test(String(text).split('\n').find((l) => l.trim()) ?? '');

// Returns { entries } or { skip: reason }. `children` are the sub-messages of a
// merge_forward message (from getMessage).
export function mapMessage(item, { botIds = [], children = [] } = {}) {
  if (item.deleted) return { skip: 'deleted' };
  const senderType = item.sender?.sender_type;
  if (senderType === 'app' || botIds.includes(item.sender?.id)) return { skip: 'bot' };
  if (item.msg_type === 'system') return { skip: 'system' };

  const content = parseContent(item);
  switch (item.msg_type) {
    case 'text':
    case 'post': {
      const text = messageText(item);
      if (!text.trim()) return { skip: 'empty' };
      const entries = textEntries(text);
      if (entries.length === 1 && entries[0].kind === 'thought' && isMeetingText(text)) entries[0].kind = 'meeting';
      return { entries };
    }
    case 'file': {
      const name = content.file_name || content.file_key;
      return {
        entries: [{
          kind: MEETING_FILE.test(name) ? 'meeting' : 'file',
          note: `文件名：${name}`,
          body: '',
          resource: { key: content.file_key, type: 'file', name },
        }],
      };
    }
    case 'image':
      return { entries: [{ kind: 'image', note: '', body: '', resource: { key: content.image_key, type: 'image', name: null } }] };
    case 'merge_forward': {
      const lines = children
        .filter((c) => c.message_id !== item.message_id)
        .map((c) => {
          const who = c.sender?.sender_name ? `${c.sender.sender_name}：` : '';
          const text = messageText(c) || { image: '[图片]', file: '[文件]' }[c.msg_type] || `[${c.msg_type}]`;
          return `${who}${text}`;
        });
      if (lines.length === 0) return { skip: 'empty' };
      return { entries: [{ kind: 'thought', note: '合并转发的聊天记录', body: `${lines.join('\n\n')}\n` }] };
    }
    default:
      return { skip: UNSUPPORTED.has(item.msg_type) ? `unsupported:${item.msg_type}` : `unknown:${item.msg_type}` };
  }
}

// After downloading a text file, upgrade it to a meeting if its first line says so.
export function textFileKind(kind, text) {
  return kind === 'file' && isMeetingText(text) ? 'meeting' : kind;
}
