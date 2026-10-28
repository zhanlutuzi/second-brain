// Level 1: a plain HTTP request with a desktop browser User-Agent.

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const TIMEOUT_MS = 20_000;

function charsetOf(contentType, head) {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;
  return head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8';
}

export function decode(buffer, contentType = '') {
  const head = Buffer.from(buffer.slice(0, 4096)).toString('latin1');
  const charset = charsetOf(contentType, head).toLowerCase();
  try {
    return new TextDecoder(charset === 'gb2312' ? 'gbk' : charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export async function fetchDirect(url, { fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const html = decode(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') ?? '');
  return { status: res.status, html, finalUrl: res.url || url };
}
