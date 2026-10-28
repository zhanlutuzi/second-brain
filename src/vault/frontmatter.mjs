// Read and write Markdown files with a YAML frontmatter block.
// The body is kept byte-for-byte so its hash stays stable across rewrites.

import { parse, stringify } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

export function parseMarkdown(text) {
  const m = text.match(FRONTMATTER);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  const data = parse(m[1]) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter is not a YAML mapping');
  }
  return { data, body: text.slice(m[0].length), hasFrontmatter: true };
}

export function stringifyMarkdown(data, body) {
  const yaml = stringify(data, { lineWidth: 0 });
  return `---\n${yaml}---\n${body}`;
}
