import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.mjs';
import { createClient, FeishuError } from '../src/feishu/client.mjs';
import { mask, parseEnvFile } from '../src/feishu/config.mjs';
import { extractUrls, mapMessage, postToText } from '../src/feishu/messages.mjs';
import { pull } from '../src/feishu/pull.mjs';
import { react } from '../src/feishu/react.mjs';
import { readState, writeState } from '../src/state.mjs';
import { fileEntry } from '../src/vault/file.mjs';
import { parseMarkdown } from '../src/vault/frontmatter.mjs';
import { DEFAULT_SETTINGS } from '../src/vault/settings.mjs';
import { CREDS, PDF, PNG, fakeFeishu, fixture } from './feishu-fake.mjs';
import { get, inboxMarkdown, makeVault, put } from './helpers.mjs';

const SETTINGS = { ...DEFAULT_SETTINGS, feishu_chat_id: 'oc_fixture_chat' };
const items = () => [...fixture('messages-page1.json').data.items, ...fixture('messages-page2.json').data.items];
const item = (id) => items().find((m) => m.message_id === id);

let v;
afterEach(() => v?.cleanup());

describe('message mapping', () => {
  it('turns each URL into a link entry and keeps the rest as note', () => {
    expect(mapMessage(item('om_fx_01')).entries).toEqual([{ kind: 'link', url: 'https://example.com/a', note: '这篇讲长上下文的 值得看', body: '' }]);
    const two = mapMessage(item('om_fx_02')).entries;
    expect(two.map((e) => e.url)).toEqual(['https://example.com/b', 'https://example.org/c']);
    expect(two[0].note).toBe('两篇对比： 和 。');
  });

  it('keeps text without URLs verbatim as a thought', () => {
    expect(mapMessage(item('om_fx_03')).entries).toEqual([{ kind: 'thought', body: '今天想到：周报应该先写结论，再写过程。\n' }]);
  });

  it('flattens rich text and finds its links', () => {
    expect(postToText(JSON.parse(item('om_fx_04').body.content))).toBe('分享\n推荐 这个工具 https://example.com/tool\n以后整理笔记可能用得上');
    expect(postToText({ zh_cn: { title: 'T', content: [[{ tag: 'text', text: 'x' }]] } })).toBe('T\nx');
    expect(mapMessage(item('om_fx_04')).entries[0]).toMatchObject({ kind: 'link', url: 'https://example.com/tool' });
  });

  it('marks files named like meeting notes as meetings', () => {
    expect(mapMessage(item('om_fx_05')).entries[0]).toMatchObject({ kind: 'meeting', resource: { key: 'file_v3_fixture_pdf', type: 'file', name: '周会纪要.pdf' } });
    expect(mapMessage(item('om_fx_06')).entries[0].kind).toBe('file');
  });

  it('expands forwarded chats into one thought', () => {
    const children = fixture('message-om_fx_08.json').data.items;
    expect(mapMessage(item('om_fx_08'), { children }).entries[0]).toEqual({
      kind: 'thought',
      note: '合并转发的聊天记录',
      body: '示例成员 A：周五的分享改到下午三点\n\n示例成员 B：好的，我来订会议室\n\n[图片]\n',
    });
  });

  it('skips bots, system messages, deleted messages and unsupported types', () => {
    expect(mapMessage(item('om_fx_09')).skip).toBe('bot');
    expect(mapMessage(item('om_fx_10')).skip).toBe('system');
    expect(mapMessage(item('om_fx_11')).skip).toBe('unsupported:sticker');
    expect(mapMessage(item('om_fx_12')).skip).toBe('deleted');
  });

  it('resolves @mentions and detects a meeting first line', () => {
    expect(mapMessage(item('om_fx_13')).entries[0].body).toBe('@示例同事 看看这个想法：会议纪要要当天发\n');
    const meeting = { ...item('om_fx_03'), body: { content: JSON.stringify({ text: '会议：示例项目\n决定上线' }) } };
    expect(mapMessage(meeting).entries[0].kind).toBe('meeting');
  });

  it('extracts URLs without trailing punctuation', () => {
    expect(extractUrls('看 https://example.com/x)。还有 https://example.com/y, 和 https://example.com/x')).toEqual(['https://example.com/x', 'https://example.com/y']);
  });
});

describe('client', () => {
  it('caches the token until 5 minutes before it expires', async () => {
    const fake = fakeFeishu();
    let t = 0;
    const client = createClient({ ...CREDS, fetch: fake.fetch, now: () => t });
    await client.token();
    t = (7200 - 301) * 1000;
    await client.token();
    expect(fake.of(/tenant_access_token/)).toHaveLength(1);
    t = (7200 - 299) * 1000;
    await client.token();
    expect(fake.of(/tenant_access_token/)).toHaveLength(2);
  });

  it('raises FeishuError with the API code', async () => {
    const client = createClient({ appId: 'x', appSecret: 'wrong-secret', fetch: fakeFeishu().fetch });
    await expect(client.listMessages({ chatId: 'oc' })).rejects.toMatchObject({ name: 'Error', code: 10014 });
    await expect(client.listMessages({ chatId: 'oc' })).rejects.toBeInstanceOf(FeishuError);
  });

  it('reads credentials from a .env file and masks secrets', () => {
    expect(parseEnvFile('# c\nFEISHU_APP_ID=cli_x\nexport FEISHU_APP_SECRET="s3cret value"\nbad line')).toEqual({ FEISHU_APP_ID: 'cli_x', FEISHU_APP_SECRET: 's3cret value' });
    expect(mask('secret is abcd1234 here', ['abcd1234'])).toBe('secret is *** here');
  });
});

describe('kb pull', () => {
  beforeEach(async () => {
    v = await makeVault();
  });
  const run = (fake, opts = {}) => pull(v.vault, { client: createClient({ ...CREDS, fetch: fake.fetch }), env: v.env, settings: SETTINGS, ...opts });

  it('writes one inbox entry per link/thought/file/image and advances the cursor', async () => {
    const fake = fakeFeishu();
    const r = await run(fake);
    expect(r.ok).toBe(true);
    expect(r.new.map((e) => `${e.path} ${e.kind}`)).toEqual([
      'inbox/feishu-om_fx_01.md link',
      'inbox/feishu-om_fx_02.md link',
      'inbox/feishu-om_fx_02-2.md link',
      'inbox/feishu-om_fx_03.md thought',
      'inbox/feishu-om_fx_04.md link',
      'inbox/feishu-om_fx_05.md meeting',
      'inbox/feishu-om_fx_06.md meeting',
      'inbox/feishu-om_fx_07.md image',
      'inbox/feishu-om_fx_08.md thought',
      'inbox/feishu-om_fx_13.md thought',
      'inbox/feishu-om_fx_14.md thought',
    ]);
    expect(r.skipped).toEqual([{ message_id: 'om_fx_11', reason: 'unsupported:sticker' }]);
    expect(fake.of(/^\/open-apis\/im\/v1\/messages$/).map((c) => c.query.page_token ?? '')).toEqual(['', 'pt_fixture_2']);
    expect(fake.of(/tenant_access_token/)).toHaveLength(1);

    const state = await readState(v.vault, v.env);
    expect(state.feishu).toEqual({ cursor_time: 1761611540, cursor_ids: ['om_fx_13', 'om_fx_14'] });
    expect(state.last_run.machine).toBe(process.env.KB_MACHINE ?? (await import('node:os')).hostname());
  });

  it('writes entries in the inbox format from docs/TECH.md', async () => {
    await run(fakeFeishu());
    const link = parseMarkdown(await get(v.vault, 'inbox/feishu-om_fx_01.md'));
    expect(link.data).toEqual({
      source: 'feishu',
      message_id: 'om_fx_01',
      sent_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/),
      kind: 'link',
      url: 'https://example.com/a',
      note: '这篇讲长上下文的 值得看',
      fetch_error: '',
    });
    expect(link.body).toBe('');
    expect(new Date(link.data.sent_at).getTime()).toBe(1761611000000);

    const pdf = parseMarkdown(await get(v.vault, 'inbox/feishu-om_fx_05.md'));
    expect(pdf.data).toMatchObject({ kind: 'meeting', fetch_status: 'skipped', attachment: 'feishu-om_fx_05-周会纪要.pdf' });
    expect(pdf.body).toBe('![[feishu-om_fx_05-周会纪要.pdf]]\n');
    expect(await readFile(join(v.vault, 'inbox/feishu-om_fx_05-周会纪要.pdf'))).toEqual(PDF);

    const txt = parseMarkdown(await get(v.vault, 'inbox/feishu-om_fx_06.md'));
    expect(txt.data.kind).toBe('meeting');
    expect(txt.body).toBe('会议：读书会小程序\n\n决定：下周起每周五发布书单。\n');

    expect(await readFile(join(v.vault, 'inbox/feishu-om_fx_07.png'))).toEqual(PNG);
  });

  it('does not duplicate anything when run again, even inside the cursor second', async () => {
    await run(fakeFeishu());
    const before = (await readdir(join(v.vault, 'inbox'))).sort();
    const fake = fakeFeishu();
    const again = await run(fake);
    expect(again.new).toEqual([]);
    expect(fake.of(/^\/open-apis\/im\/v1\/messages$/)[0].query.start_time).toBe('1761611540');
    expect((await readdir(join(v.vault, 'inbox'))).sort()).toEqual(before);
  });

  it('picks up only new messages after the cursor', async () => {
    await run(fakeFeishu());
    const page = fixture('messages-page2.json');
    const newer = { ...page.data.items[0], message_id: 'om_fx_99', msg_type: 'text', create_time: '1761612000000', body: { content: JSON.stringify({ text: '新消息' }) } };
    page.data.items.push(newer);
    const r = await run(fakeFeishu({ pages: [{ ...page, data: { ...page.data, items: [...page.data.items] } }] }));
    expect(r.new.map((e) => e.message_id)).toEqual(['om_fx_99']);
  });

  it('starts from --since when there is no cursor', async () => {
    const fake = fakeFeishu();
    await run(fake, { since: '2026-10-01' });
    expect(fake.of(/^\/open-apis\/im\/v1\/messages$/)[0].query.start_time).toBe(String(Date.parse('2026-10-01T00:00:00') / 1000));
    expect((await run(fakeFeishu(), { since: 'nope', env: { SECOND_BRAIN_HOME: join(v.tmp, 'other') } })).error).toBe('invalid_arguments');
  });

  it('writes nothing in --dry-run mode', async () => {
    const r = await run(fakeFeishu(), { dryRun: true });
    expect(r.new).toHaveLength(11);
    expect(await readdir(join(v.vault, 'inbox'))).toEqual(['.gitkeep']);
    expect(await readState(v.vault, v.env)).toEqual({});
  });

  it('keeps the cursor when a download fails, so the run can be repeated', async () => {
    const fake = fakeFeishu();
    const original = fake.fetch;
    const broken = async (url, init) => (String(url).includes('/resources/img_') ? new Response('{"code":234003,"msg":"file not found"}', { status: 400, headers: { 'content-type': 'application/json' } }) : original(url, init));
    await expect(pull(v.vault, { client: createClient({ ...CREDS, fetch: broken }), env: v.env, settings: SETTINGS })).rejects.toThrow(/file not found/);
    expect((await readState(v.vault, v.env)).feishu).toBeUndefined();
    const r = await run(fakeFeishu());
    expect(r.new.map((e) => e.message_id)).not.toContain('om_fx_01');
    expect(r.new.map((e) => e.message_id)).toContain('om_fx_07');
  });

  it('lets a second computer continue from the shared cursor', async () => {
    const a = { SECOND_BRAIN_HOME: join(v.tmp, 'mac-a'), KB_MACHINE: 'Mac A' };
    const b = { SECOND_BRAIN_HOME: join(v.tmp, 'mac-b'), KB_MACHINE: 'Mac B' };
    const first = await run(fakeFeishu(), { env: a });
    expect(first.new).toHaveLength(11);

    const { vaultStatus } = await import('../src/vault/status.mjs');
    expect(await vaultStatus(v.vault, b)).toMatchObject({ machine: 'Mac B', other_machine_recent: true, last_run: { machine: 'Mac A' } });

    const fake = fakeFeishu();
    const second = await run(fake, { env: b });
    expect(second.new).toEqual([]);
    expect(fake.of(/^\/open-apis\/im\/v1\/messages$/)[0].query.start_time).toBe('1761611540');
  });

  it('requires a chat id', async () => {
    expect(await run(fakeFeishu(), { settings: DEFAULT_SETTINGS })).toMatchObject({ ok: false, error: 'missing_chat_id' });
  });
});

describe('kb file with Feishu entries', () => {
  beforeEach(async () => {
    v = await makeVault();
    await pull(v.vault, { client: createClient({ ...CREDS, fetch: fakeFeishu().fetch }), env: v.env, settings: SETTINGS });
  });

  it('moves attachments to raw/assets and queues reactions', async () => {
    const r = await fileEntry(v.vault, 'inbox/feishu-om_fx_05.md', { summary: '周会纪要', env: v.env });
    expect(r.ok).toBe(true);
    const { data, body } = parseMarkdown(await get(v.vault, r.path));
    expect(data.attachment).toBe('raw/assets/feishu-om_fx_05-周会纪要.pdf');
    expect(body).toBe('![[feishu-om_fx_05-周会纪要.pdf]]\n');
    expect(existsSync(join(v.vault, 'raw/assets/feishu-om_fx_05-周会纪要.pdf'))).toBe(true);
    expect(existsSync(join(v.vault, 'inbox/feishu-om_fx_05-周会纪要.pdf'))).toBe(false);
    expect((await readState(v.vault, v.env)).feishu.pending_ok).toEqual(['om_fx_05']);
  });

  it('files two links from one message separately, but never the same URL twice', async () => {
    await put(v.vault, 'inbox/feishu-om_fx_02.md', (await get(v.vault, 'inbox/feishu-om_fx_02.md')).replace(/\n$/, '') + '正文 B\n');
    await put(v.vault, 'inbox/feishu-om_fx_02-2.md', (await get(v.vault, 'inbox/feishu-om_fx_02-2.md')) + '正文 C\n');
    const a = await fileEntry(v.vault, 'inbox/feishu-om_fx_02.md', { env: v.env });
    const b = await fileEntry(v.vault, 'inbox/feishu-om_fx_02-2.md', { env: v.env });
    expect([a.duplicate, b.duplicate]).toEqual([false, false]);
    await put(v.vault, 'inbox/again.md', '---\nsource: feishu\nmessage_id: om_fx_77\nkind: link\nurl: https://example.org/c/\nfetch_status: ok\n---\n正文\n');
    expect(await fileEntry(v.vault, 'inbox/again.md', { env: v.env })).toMatchObject({ duplicate: true, path: b.path });
    expect((await readState(v.vault, v.env)).feishu.pending_ok).toEqual(['om_fx_02', 'om_fx_77']);
  });

  it('leaves unfetched links in the inbox', async () => {
    expect(await fileEntry(v.vault, 'inbox/feishu-om_fx_01.md', { env: v.env })).toMatchObject({ error: 'not_fetched' });
  });
});

describe('kb react', () => {
  beforeEach(async () => {
    v = await makeVault();
  });
  const run = (fake, opts = {}) => react(v.vault, { client: createClient({ ...CREDS, fetch: fake.fetch }), env: v.env, settings: SETTINGS, ...opts });
  const reactions = (fake) => fake.of(/\/reactions$/).map((c) => `${c.path.split('/')[5]} ${c.body.reaction_type.emoji_type}`);

  it('marks filed messages OK and failed fetches CRY, once each', async () => {
    await writeState(v.vault, { feishu: { cursor_time: 1, pending_ok: ['om_fx_01', 'om_fx_03'] } }, v.env);
    await put(v.vault, 'inbox/feishu-om_fx_04.md', '---\nsource: feishu\nmessage_id: om_fx_04\nkind: link\nurl: https://example.com/tool\nfetch_status: failed\nfetch_error: http 403\n---\n');
    const fake = fakeFeishu();
    expect(await run(fake)).toEqual({ ok: true, reacted_ok: 2, reacted_failed: 1, errors: [] });
    expect(reactions(fake)).toEqual(['om_fx_01 OK', 'om_fx_03 OK', 'om_fx_04 CRY']);
    expect((await readState(v.vault, v.env)).feishu).toEqual({ cursor_time: 1, pending_ok: [], marked_failed: ['om_fx_04'] });

    const again = fakeFeishu();
    expect(await run(again)).toEqual({ ok: true, reacted_ok: 0, reacted_failed: 0, errors: [] });
    expect(again.calls).toEqual([]);
  });

  it('uses the emoji types from 我的设置', async () => {
    await writeState(v.vault, { feishu: { pending_ok: ['om_fx_01'] } }, v.env);
    const fake = fakeFeishu();
    await run(fake, { settings: { ...SETTINGS, reaction_ok: 'DONE' } });
    expect(reactions(fake)).toEqual(['om_fx_01 DONE']);
  });

  it('drops messages the API rejects but keeps them on network errors', async () => {
    await writeState(v.vault, { feishu: { pending_ok: ['om_fx_01', 'om_fx_03'] } }, v.env);
    const r = await run(fakeFeishu({ failReactions: { om_fx_01: 231003 } }));
    expect(r).toMatchObject({ reacted_ok: 1, errors: [{ message_id: 'om_fx_01', code: 231003 }] });
    expect((await readState(v.vault, v.env)).feishu.pending_ok).toEqual([]);

    await writeState(v.vault, { feishu: { pending_ok: ['om_fx_03'] } }, v.env);
    const failing = createClient({ ...CREDS, fetch: fakeFeishu().fetch });
    failing.addReaction = async () => { throw new TypeError('fetch failed'); };
    await react(v.vault, { client: failing, env: v.env, settings: SETTINGS });
    expect((await readState(v.vault, v.env)).feishu.pending_ok).toEqual(['om_fx_03']);
  });

  it('accepts an explicit result file', async () => {
    const file = join(v.tmp, 'result.json');
    await writeFile(file, JSON.stringify({ ok: ['om_fx_05'], failed: ['om_fx_06'] }));
    const fake = fakeFeishu();
    await run(fake, { resultFile: file });
    expect(reactions(fake)).toEqual(['om_fx_05 OK', 'om_fx_06 CRY']);
  });
});

describe('kb pull / kb react through the CLI', () => {
  beforeEach(async () => {
    v = await makeVault();
    await put(v.vault, '我的设置.md', (await get(v.vault, '我的设置.md')).replace('feishu_chat_id: ""', 'feishu_chat_id: oc_fixture_chat'));
  });

  async function cli(argv, env, fetch) {
    let out = '';
    const code = await main(argv, { stdout: { write: (s) => { out += s; } }, fetch }, { ...v.env, KB_VAULT: v.vault, ...env });
    return { code, result: JSON.parse(out) };
  }

  it('reads credentials from ~/.second-brain/.env', async () => {
    await put(v.tmp, 'home/.env', `FEISHU_APP_ID=${CREDS.appId}\nFEISHU_APP_SECRET=${CREDS.appSecret}\n`);
    const { code, result } = await cli(['pull'], {}, fakeFeishu().fetch);
    expect(code).toBe(0);
    expect(result.new).toHaveLength(11);
    expect(await inboxMarkdown(v.vault)).toHaveLength(11);
  });

  it('reports missing credentials when a chat id is set', async () => {
    expect((await cli(['pull'], {}, fakeFeishu().fetch)).result.error).toBe('missing_credentials');
  });

  it('never prints the App Secret', async () => {
    const secret = 'wrong-secret-0123456789';
    const { code, result } = await cli(['pull'], { FEISHU_APP_ID: 'cli_x', FEISHU_APP_SECRET: secret }, fakeFeishu().fetch);
    expect(code).toBe(1);
    expect(result).toMatchObject({ ok: false, error: 'feishu_error', code: 10014 });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('reports network failures as JSON', async () => {
    const { result } = await cli(['pull'], { FEISHU_APP_ID: CREDS.appId, FEISHU_APP_SECRET: CREDS.appSecret }, fakeFeishu({ networkError: true }).fetch);
    expect(result).toMatchObject({ ok: false, error: 'feishu_error', message: 'fetch failed' });
  });
});
