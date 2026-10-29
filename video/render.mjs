#!/usr/bin/env node
// Renders index.html to an MP4: headless Chromium draws each frame at an exact
// time, FFmpeg stitches the PNGs and muxes the synthesised soundtrack.
//
//   node video/render.mjs                    full video → video/second-brain.mp4
//   node video/render.mjs --stills 3,16.5    PNG stills → video/build/stills/
//   node video/render.mjs --audio            soundtrack only → video/build/soundtrack.wav
//
// Options: --out <file>, --workers <n> (parallel browser pages, default 4)

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { soundtrack } from './src/soundtrack.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BUILD = join(ROOT, 'build');
const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: join(ROOT, 'second-brain.mp4') },
    stills: { type: 'string' },
    audio: { type: 'boolean', default: false },
    workers: { type: 'string', default: '4' },
  },
});

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => {
    console.error(e);
    process.exit(1);
  });
  await page.goto(pathToFileURL(join(ROOT, 'index.html')).href + '?render');
  await page.evaluate(() => window.VIDEO.ready);
  return page;
}

const frame = (page, t) =>
  page.evaluate((t) => window.VIDEO.frame(t), t).then((url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

function ffmpeg(argv) {
  const p = spawn('ffmpeg', argv, { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((ok, fail) =>
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))),
  );
  p.on('error', () => {
    console.error('FFmpeg not found. Install it first, e.g. `brew install ffmpeg`.');
    process.exit(1);
  });
  return { stdin: p.stdin, done };
}

const browser = await chromium.launch();
try {
  const page = await openPage(browser);
  const { fps, duration, cues } = await page.evaluate(() => window.VIDEO);
  mkdirSync(BUILD, { recursive: true });

  const wav = join(BUILD, 'soundtrack.wav');
  writeFileSync(wav, soundtrack({ duration, cues }));
  console.log(`soundtrack: ${wav}`);

  if (args.stills) {
    mkdirSync(join(BUILD, 'stills'), { recursive: true });
    for (const t of args.stills.split(',').map(Number)) {
      const file = join(BUILD, 'stills', `${t.toFixed(2).padStart(6, '0')}.png`);
      writeFileSync(file, await frame(page, t));
      console.log(`still: ${file}`);
    }
  } else if (!args.audio) {
    const out = resolve(args.out);
    const total = Math.round(duration * fps);
    const pages = [page];
    for (let i = 1; i < Number(args.workers); i++) pages.push(await openPage(browser));

    const enc = ffmpeg([
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-tune', 'animation',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
      out,
    ]);

    // Each page renders every n-th frame; frames are written in order with a small look-ahead.
    const queue = pages.map(() => Promise.resolve());
    const pending = new Map();
    const request = (k) => {
      if (k >= total || pending.has(k)) return;
      const w = k % pages.length;
      const p = queue[w].then(() => frame(pages[w], k / fps));
      queue[w] = p.catch(() => {});
      pending.set(k, p);
    };
    const started = Date.now();
    for (let k = 0; k < total; k++) {
      for (let j = k; j < k + pages.length * 3; j++) request(j);
      const png = await pending.get(k);
      pending.delete(k);
      if (!enc.stdin.write(png)) await new Promise((ok) => enc.stdin.once('drain', ok));
      if (k % fps === 0 || k === total - 1) {
        process.stdout.write(`\rframe ${k + 1}/${total} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
      }
    }
    enc.stdin.end();
    await enc.done;
    console.log(`\nvideo: ${out}`);
  }
} finally {
  await browser.close();
}
