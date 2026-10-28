// A fake Feishu Open Platform for tests, serving the JSON fixtures in
// test/fixtures/feishu. Records every call so tests can assert on them.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./fixtures/feishu/', import.meta.url));
export const fixture = (name) => JSON.parse(readFileSync(DIR + name, 'utf8'));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export const PDF = Buffer.from('%PDF-1.4 fixture');
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function fakeFeishu({ pages = [fixture('messages-page1.json'), fixture('messages-page2.json')], failReactions = {}, networkError = false } = {}) {
  const calls = [];
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const call = { method: init.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers?.Authorization };
    calls.push(call);
    if (networkError) throw new TypeError('fetch failed');
    const p = u.pathname;

    if (p === '/open-apis/auth/v3/tenant_access_token/internal') {
      if (call.body.app_secret !== 'fixture-secret-value') return json({ code: 10014, msg: `app secret invalid: ${call.body.app_secret}` });
      return json(fixture('token.json'));
    }
    if (call.auth !== 'Bearer t-fixture-token') return json({ code: 99991663, msg: 'invalid access token' }, 400);

    if (p === '/open-apis/im/v1/messages') {
      // Emulate start_time (seconds, inclusive) and page_token over the fixture pages.
      const index = call.query.page_token ? pages.findIndex((pg, i) => i > 0 && pages[i - 1].data.page_token === call.query.page_token) : 0;
      const pg = structuredClone(pages[index]);
      const start = Number(call.query.start_time ?? 0) * 1000;
      pg.data.items = pg.data.items.filter((m) => Number(m.create_time) >= start);
      return json(pg);
    }
    let m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/resources\/([^/]+)$/);
    if (m) {
      const key = decodeURIComponent(m[2]);
      if (key === 'file_v3_fixture_pdf') return new Response(PDF, { headers: { 'content-type': 'application/pdf' } });
      if (key === 'file_v3_fixture_txt') return new Response(readFileSync(DIR + 'notes.txt'), { headers: { 'content-type': 'text/plain' } });
      if (key === 'img_v3_fixture_png') return new Response(PNG, { headers: { 'content-type': 'image/png' } });
      return json({ code: 234003, msg: 'file not found' }, 400);
    }
    m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reactions$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (failReactions[id]) return json({ code: failReactions[id], msg: 'message has been recalled' }, 400);
      return json(fixture('reaction.json'));
    }
    m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)$/);
    if (m) return json(fixture(`message-${decodeURIComponent(m[1])}.json`));
    return json({ code: 404, msg: `no fixture for ${p}` }, 404);
  }
  const of = (re) => calls.filter((c) => re.test(c.path));
  return { fetch, calls, of };
}

export const CREDS = { appId: 'cli_fixture_app', appSecret: 'fixture-secret-value' };
