import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.mjs';
import { BrowserUnavailable, fetchWithBrowser } from '../src/fetch/browser.mjs';
import { decode } from '../src/fetch/direct.mjs';
import { extractArticle, judge } from '../src/fetch/extract.mjs';
import { fetchEntry, useBrowserFirst } from '../src/fetch/index.mjs';
import { fileEntry } from '../src/vault/file.mjs';
import { parseMarkdown } from '../src/vault/frontmatter.mjs';
import { DEFAULT_SETTINGS } from '../src/vault/settings.mjs';
import { vaultStatus } from '../src/vault/status.mjs';
import { get, makeVault, put } from './helpers.mjs';

const DIR = fileURLToPath(new URL('./fixtures/sites/', import.meta.url));
const html = (name) => readFileSync(join(DIR, `${name}.html`), 'utf8');
const CASES = JSON.parse(readFileSync(join(DIR, 'cases.json'), 'utf8'));
const SETTINGS = { ...DEFAULT_SETTINGS, browser_domains: ['mp.weixin.qq.com'] };

describe('article extraction from 10 common sites', () => {
  it('has 10 site fixtures', () => {
    expect(Object.keys(CASES)).toHaveLength(10);
  });

  it.each(Object.entries(CASES))('%s: extracts the article body without page chrome', async (name, c) => {
    const a = await extractArticle(html(name), c.url);
    expect(judge(a)).toBeNull();
    expect(a.title).not.toBe('');
    for (const s of c.expect_in_body) expect(a.markdown).toContain(s);
    for (const s of c.expect_not_in_body) expect(a.markdown).not.toContain(s);
  });

  it('keeps metadata when the page provides it', async () => {
    expect(await extractArticle(html('sspai'), CASES.sspai.url)).toMatchObject({ title: '整理比收集更难', author: '示例作者', published: '2026-10-18', site: '少数派' });
  });

  it('shows the hidden WeChat body and its lazy images', async () => {
    const a = await extractArticle(html('weixin'), CASES.weixin.url);
    expect(a.markdown).toContain('https://mmbiz.example.com/fixture.png');
  });

  it('rejects verification pages and near-empty pages', async () => {
    expect(judge(await extractArticle(html('weixin-verify'), 'https://mp.weixin.qq.com/s/x'))).toBe('verification_page');
    expect(judge(await extractArticle(html('short'), 'https://example.com/s'))).toBe('too_short');
  });

  it('decodes GBK pages', async () => {
    const raw = readFileSync(join(DIR, 'gbk.html'));
    const text = decode(new Uint8Array(raw), 'text/html');
    expect(text).toContain('很多人以为知识管理的难点在于收集');
    expect(decode(new Uint8Array(Buffer.from('<p>你好</p>')), 'text/html; charset=utf-8')).toBe('<p>你好</p>');
  });
});

describe('useBrowserFirst', () => {
  it.each([
    ['https://mp.weixin.qq.com/s/abc', true],
    ['https://www.xiaohongshu.com/explore/1', true],
    ['https://notmp.weixin.qq.com.example.com/', false],
    ['https://example.com/', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(useBrowserFirst(url, ['mp.weixin.qq.com', 'xiaohongshu.com'])).toBe(expected);
  });
});

// Fake network: URL → [status, fixture name] for direct requests and the browser.
function fakeWeb(routes, browserRoutes = routes) {
  const calls = { direct: [], browser: [] };
  const fetch = async (url) => {
    calls.direct.push(url);
    const r = routes[url];
    if (!r) throw new TypeError('fetch failed');
    if (r === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const body = r[1] ? readFileSync(join(DIR, `${r[1]}.html`)) : '';
    return new Response(body, { status: r[0], headers: { 'content-type': r[1] === 'gbk' ? 'text/html; charset=gbk' : 'text/html; charset=utf-8' } });
  };
  const browser = async (url) => {
    calls.browser.push(url);
    const r = browserRoutes[url];
    if (r === 'unavailable') throw new BrowserUnavailable('playwright is not installed');
    if (!r) throw new Error('net::ERR_NAME_NOT_RESOLVED');
    return { status: r[0], html: r[1] ? html(r[1]) : '', finalUrl: url };
  };
  return { fetch, browser, calls };
}

let v;
afterEach(() => v?.cleanup());

const entry = (url, extra = '') => `---\nsource: feishu\nmessage_id: om_fetch_1\nsent_at: 2026-10-28T09:00:00+08:00\nkind: link\nurl: ${url}\nnote: 看看\nfetch_error: ""\n${extra}---\n`;

describe('kb fetch', () => {
  beforeEach(async () => {
    v = await makeVault();
  });
  const run = (web, name = 'inbox/a.md', settings = SETTINGS) => fetchEntry(v.vault, name, { settings, env: v.env, fetch: web.fetch, browser: web.browser });

  it('fetches directly and writes the article back into the entry', async () => {
    const url = CASES.sspai.url;
    await put(v.vault, 'inbox/a.md', entry(url));
    const web = fakeWeb({ [url]: [200, 'sspai'] });
    expect(await run(web)).toMatchObject({ ok: true, status: 'ok', method: 'direct', title: '整理比收集更难' });
    expect(web.calls.browser).toEqual([]);

    const { data, body } = parseMarkdown(await get(v.vault, 'inbox/a.md'));
    expect(data).toMatchObject({ fetch_status: 'ok', fetch_error: '', title: '整理比收集更难', author: '示例作者', published: '2026-10-18', site: '少数派', note: '看看', message_id: 'om_fetch_1' });
    expect(body).toContain('很多人以为知识管理的难点在于收集');

    // Now it can be filed, and status no longer asks for a fetch.
    expect((await vaultStatus(v.vault, v.env)).inbox.needs_fetch).toBe(0);
    expect(await fileEntry(v.vault, 'inbox/a.md', { summary: 's', env: v.env })).toMatchObject({ ok: true, title: '整理比收集更难' });
  });

  it('falls back to the browser when the direct request fails', async () => {
    const url = 'https://example.com/blocked';
    await put(v.vault, 'inbox/a.md', entry(url));
    const web = fakeWeb({ [url]: [403, 'short'] }, { [url]: [200, 'zhihu'] });
    expect(await run(web)).toMatchObject({ status: 'ok', method: 'browser' });
    expect(web.calls).toEqual({ direct: [url], browser: [url] });
  });

  it('goes straight to the browser for listed domains', async () => {
    const url = CASES.weixin.url;
    await put(v.vault, 'inbox/a.md', entry(url));
    const web = fakeWeb({}, { [url]: [200, 'weixin'] });
    expect(await run(web)).toMatchObject({ status: 'ok', method: 'browser' });
    expect(web.calls.direct).toEqual([]);
  });

  it('marks the entry failed with the reason from each level', async () => {
    const url = CASES.weixin.url;
    await put(v.vault, 'inbox/a.md', entry(url));
    const r = await run(fakeWeb({}, { [url]: [200, 'weixin-verify'] }));
    expect(r).toMatchObject({ ok: true, status: 'failed', reason: 'browser: verification_page', url });
    const { data, body } = parseMarkdown(await get(v.vault, 'inbox/a.md'));
    expect(data).toMatchObject({ fetch_status: 'failed', fetch_error: 'browser: verification_page' });
    expect(body).toBe('');
    // A failed entry stays in the inbox.
    expect(await fileEntry(v.vault, 'inbox/a.md', { env: v.env })).toMatchObject({ error: 'fetch_failed' });
    expect((await vaultStatus(v.vault, v.env)).inbox.failed).toBe(1);
  });

  it.each([
    [{ 'https://example.com/x': [404, null] }, {}, 'direct: http_404; browser: network_error'],
    [{ 'https://example.com/x': [200, 'short'] }, { 'https://example.com/x': 'unavailable' }, 'direct: too_short; browser: browser_unavailable'],
    [{ 'https://example.com/x': 'timeout' }, { 'https://example.com/x': [500, null] }, 'direct: timeout; browser: http_500'],
  ])('reports %j / %j as "%s"', async (routes, browserRoutes, reason) => {
    await put(v.vault, 'inbox/a.md', entry('https://example.com/x'));
    expect((await run(fakeWeb(routes, browserRoutes))).reason).toBe(reason);
  });

  it('can retry an entry that failed before', async () => {
    const url = 'https://example.com/retry';
    await put(v.vault, 'inbox/a.md', entry(url, 'fetch_status: failed\n'));
    expect(await run(fakeWeb({ [url]: [200, 'wordpress'] }))).toMatchObject({ status: 'ok' });
  });

  it('decodes GBK responses', async () => {
    const url = 'https://example.com/gbk';
    await put(v.vault, 'inbox/a.md', entry(url));
    expect(await run(fakeWeb({ [url]: [200, 'gbk'] }))).toMatchObject({ status: 'ok', title: 'GBK 编码页面' });
  });

  it('skips entries that are already fetched and refuses non-links', async () => {
    await put(v.vault, 'inbox/a.md', entry('https://example.com/done', 'fetch_status: ok\n') + '正文\n');
    const web = fakeWeb({});
    expect(await run(web)).toMatchObject({ ok: true, already: true });
    expect(web.calls).toEqual({ direct: [], browser: [] });
    await put(v.vault, 'inbox/t.md', '---\nkind: thought\n---\n想法\n');
    expect(await run(web, 'inbox/t.md')).toMatchObject({ ok: false, error: 'not_a_link' });
    expect(await run(web, 'inbox/none.md')).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('runs through the CLI', async () => {
    const url = CASES.juejin.url;
    await put(v.vault, 'inbox/a.md', entry(url));
    const web = fakeWeb({ [url]: [200, 'juejin'] });
    let out = '';
    const code = await main(['fetch', 'inbox/a.md'], { stdout: { write: (s) => { out += s; } }, fetch: web.fetch, browser: web.browser }, { ...v.env, KB_VAULT: v.vault });
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ ok: true, status: 'ok', method: 'direct' });
  });
});

// A real Chromium against a local HTTP server (no internet). Skipped where
// Playwright or its browser is not installed.
async function browserAvailable() {
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.launch();
    await b.close();
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!(await browserAvailable()))('level 2 with a real browser', () => {
  let server;
  let base;
  beforeAll(async () => {
    server = createServer((req, res) => {
      // The article is rendered by JavaScript, like many modern sites.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><title>动态渲染</title></head><body><main id="app"></main><script>
        document.getElementById('app').innerHTML = '<article><h1>动态渲染的文章</h1>' + '<p>${'这段正文由浏览器里的脚本生成，直接请求只能拿到空壳。'.repeat(10)}</p></article>';
      </script></body></html>`);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('renders JavaScript pages that the direct request cannot read', async () => {
    v = await makeVault();
    const page = await fetchWithBrowser(`${base}/post`, { profileDir: join(v.tmp, 'browser') });
    expect(page.status).toBe(200);
    const a = await extractArticle(page.html, page.finalUrl);
    expect(judge(a)).toBeNull();
    expect(a.markdown).toContain('这段正文由浏览器里的脚本生成');

    const direct = await extractArticle(await (await fetch(`${base}/post`)).text(), `${base}/post`);
    expect(judge(direct)).toBe('too_short');
  }, 60_000);
});
