#!/usr/bin/env node
// Assembles the GitHub Pages site into site/dist/: the page itself, plus the
// promo video and the mascot drawing code, copied from video/ so nothing is
// duplicated in the repository. Run by .github/workflows/pages.yml; locally:
//
//   node site/build.mjs && open site/dist/index.html

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const dist = root('site/dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(`${dist}/js`, { recursive: true });

for (const f of ['index.html', 'style.css', 'main.js', 'poster.jpg']) cpSync(root(`site/${f}`), `${dist}/${f}`);
cpSync(root('video/second-brain.mp4'), `${dist}/second-brain.mp4`);
for (const f of ['engine.js', 'characters.js']) cpSync(root(`video/src/${f}`), `${dist}/js/${f}`);

console.log(`site: ${dist}`);
