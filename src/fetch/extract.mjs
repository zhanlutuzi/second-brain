// HTML → Markdown article with metadata, via Defuddle on a linkedom document.

import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';

const VERIFICATION = ['环境异常', '完成验证', '验证码', '请在微信客户端打开', '访问过于频繁', 'Just a moment', 'verify you are human', 'Access denied'];
export const MIN_CHARS = 200;

// Page fixes Defuddle cannot know about.
function prepare(document) {
  // WeChat (mp.weixin.qq.com): the body is hidden until JS runs, images use data-src.
  const wx = document.querySelector('#js_content');
  if (wx) wx.removeAttribute('style');
  // Wikipedia: navigation boxes and edit links are not article content.
  for (const el of document.querySelectorAll('.navbox, .mw-editsection')) el.remove();
  for (const img of document.querySelectorAll('img[data-src]')) {
    if (!img.getAttribute('src') || img.getAttribute('src').startsWith('data:')) img.setAttribute('src', img.getAttribute('data-src'));
  }
}

const datePart = (v) => String(v ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';

export async function extractArticle(html, url) {
  const { document } = parseHTML(html);
  prepare(document);
  const r = await Defuddle(document, url, { markdown: true, useAsync: false });
  return {
    title: (r.title ?? '').trim(),
    author: (r.author ?? '').trim(),
    published: datePart(r.published),
    site: (r.site ?? '').trim(),
    markdown: (r.content ?? '').trim(),
  };
}

const visibleChars = (text) => [...String(text).replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[\s#*>_`|-]/g, '')].length;

// Why an extraction does not count as the article, or null if it does.
export function judge(article) {
  const text = article.markdown;
  if (VERIFICATION.some((w) => text.includes(w)) && visibleChars(text) < 2000) return 'verification_page';
  if (visibleChars(text) < MIN_CHARS) return 'too_short';
  return null;
}
