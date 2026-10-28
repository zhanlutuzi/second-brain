// Minimal Feishu Open Platform client: the four endpoints kb needs.
// `fetch` is injectable so tests run against fixtures without a network.

const BASE_URL = 'https://open.feishu.cn';
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

export class FeishuError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function createClient({ appId, appSecret, fetch = globalThis.fetch, baseUrl = BASE_URL, now = Date.now }) {
  let cached = null;

  async function token() {
    if (cached && now() < cached.expiresAt) return cached.value;
    const res = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const json = await readJson(res);
    if (json.code !== 0) throw new FeishuError(`auth failed: ${json.msg}`, { code: json.code, status: res.status });
    // Refresh 5 minutes before the token expires.
    cached = { value: json.tenant_access_token, expiresAt: now() + json.expire * 1000 - TOKEN_MARGIN_MS };
    return cached.value;
  }

  async function call(method, path, { query, body } = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const res = await fetch(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await readJson(res);
    if (json.code !== 0) throw new FeishuError(`${method} ${path}: ${json.msg}`, { code: json.code, status: res.status });
    return json.data ?? {};
  }

  return {
    token,

    // One page of chat history, oldest first. startTime is in seconds.
    listMessages: ({ chatId, startTime, pageToken, pageSize = 50 }) =>
      call('GET', '/open-apis/im/v1/messages', {
        query: {
          container_id_type: 'chat',
          container_id: chatId,
          start_time: startTime,
          sort_type: 'ByCreateTimeAsc',
          page_size: pageSize,
          page_token: pageToken,
        },
      }),

    // A message by id; for a merge_forward message the items include its children.
    getMessage: (messageId) => call('GET', `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`),

    async downloadResource(messageId, fileKey, type) {
      const url = new URL(`${baseUrl}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}`);
      url.searchParams.set('type', type);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${await token()}` } });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || contentType.includes('application/json')) {
        const json = await readJson(res).catch(() => ({}));
        throw new FeishuError(`download ${fileKey}: ${json.msg ?? `HTTP ${res.status}`}`, { code: json.code, status: res.status });
      }
      return { data: Buffer.from(await res.arrayBuffer()), contentType };
    },

    addReaction: (messageId, emojiType) =>
      call('POST', `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions`, {
        body: { reaction_type: { emoji_type: emojiType } },
      }),
  };
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new FeishuError(`unexpected response (HTTP ${res.status})`, { status: res.status });
  }
}
