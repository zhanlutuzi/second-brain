// Still images for social posts, drawn with the same cast as the video:
// a 3:4 Xiaohongshu carousel (cover + five pages) and a 16:9 Bilibili cover.
// Rendered by `node video/render.mjs --covers`.
(function () {
  const SB = window.SB;
  const { C } = SB;
  const T = 1; // a moment with eyes open

  const pill = (ctx, x, y, str, opts = {}) => {
    const { size = 34, fill = C.white, color = C.ink } = opts;
    const w = SB.measure(ctx, str, size, { bold: true }) + size * 1.6;
    const h = size * 1.8;
    SB.rect(ctx, x - w / 2, y - h / 2, w, h, { r: h / 2, fill, lw: 4, seed: SB.hash(w, 77) });
    SB.text(ctx, str, x, y + 2, { size, bold: true, color, align: 'center' });
  };

  /** Big title text on one line, with some words in coral: parts = [[text, highlighted], ...]. */
  const title = (ctx, parts, x, y, size) => {
    const widths = parts.map(([s]) => SB.measure(ctx, s, size, { bold: true }));
    let left = x - widths.reduce((a, b) => a + b, 0) / 2;
    parts.forEach(([s, hot], i) => {
      SB.text(ctx, s, left, y, { size, bold: true, color: hot ? C.coral : C.ink });
      left += widths[i];
    });
  };

  const heading = (ctx, w, str) => {
    const size = 76;
    const tw = SB.measure(ctx, str, size, { bold: true });
    SB.highlight(ctx, w / 2 - tw / 2 - 24, 160 - 30, tw + 48, 66);
    SB.text(ctx, str, w / 2, 152, { size, bold: true, align: 'center' });
  };

  const footer = (ctx, w, h, page) => {
    SB.text(ctx, '第二大脑 · second-brain-kit', 60, h - 60, { size: 28, color: C.soft });
    SB.text(ctx, `${page} / 6`, w - 60, h - 60, { size: 28, color: C.soft, align: 'right' });
  };

  const miniPhone = (ctx, x, y, rot) =>
    SB.at(ctx, x, y, 1, rot, () =>
      SB.phone(ctx, 250, 450, (w, h) => {
        ['link', 'idea', 'file', 'link', 'link'].forEach((kind, i) => {
          SB.bubble(ctx, 16, 110 + i * 64, w - 32, 50);
          SB.at(ctx, 40, 135 + i * 64, 1, 0, () => SB.icon(ctx, kind, 13));
          SB.line(ctx, 64, 135 + i * 64, w - 50 - (i % 3) * 30, 135 + i * 64, { lw: 6, stroke: C.grey, seed: 700 + i });
        });
        SB.chatHeader(ctx, w, '', '999+');
        ctx.fillStyle = 'rgba(120,112,104,0.35)';
        ctx.fillRect(0, 0, w, h);
      }),
    );

  const covers = [];

  // ---------- Xiaohongshu 1: cover ----------

  covers.push({
    id: 'xhs-1-cover',
    w: 1080,
    h: 1440,
    draw(ctx, w) {
      pill(ctx, w / 2, 110, '开源免费 · Claude Code · Obsidian', { size: 32 });
      title(ctx, [['收藏 ', false], ['999+', true]], w / 2, 290, 160);
      title(ctx, [['从来不看？', false]], w / 2, 470, 160);
      SB.underline(ctx, w / 2 - 330, 570, 660, { lw: 9 });

      miniPhone(ctx, 200, 900, -0.14);
      [[350, 690, 30], [790, 650, 36], [700, 1080, 24], [420, 1090, 22]].forEach(([x, y, r], i) =>
        SB.sparkle(ctx, x, y, r, i % 2 ? C.teal : C.yellow),
      );
      SB.at(ctx, 545, 860, 1, 0, () => SB.brain(ctx, 170, { t: T, mood: 'joy', wave: 0.6 }));
      [['主题', C.teal], ['项目', C.blue], ['思考', C.purple]].forEach(([label, color], i) =>
        SB.folder(ctx, 835, 700 + i * 140, 200, 120, label, color),
      );

      const line = '我做了个 AI 第二大脑';
      const lw = SB.measure(ctx, line, 80, { bold: true });
      SB.highlight(ctx, w / 2 - lw / 2 - 30, 1250 - 40, lw + 60, 80);
      SB.text(ctx, line, w / 2, 1252, { size: 80, bold: true, align: 'center' });
      SB.text(ctx, '飞书随手发，AI 每天整理成个人 wiki', w / 2, 1360, { size: 40, color: C.soft, align: 'center' });
    },
  });

  // ---------- Xiaohongshu 2: the problem ----------

  covers.push({
    id: 'xhs-2-problem',
    w: 1080,
    h: 1440,
    draw(ctx, w, h) {
      heading(ctx, w, '收藏越多，脑子越乱？');
      for (let i = 0; i < 6; i++) {
        const a = 0.6 + (i / 6) * Math.PI * 2;
        SB.at(ctx, 540 + Math.cos(a) * 280, 330 + Math.sin(a) * 60, 0.9, Math.sin(a * 2 + i) * 0.3, () => {
          SB.rect(ctx, -46, -32, 92, 64, { r: 10, fill: C.white, lw: 4, seed: 200 + i });
          SB.icon(ctx, ['link', 'idea', 'file', 'link', 'meeting', 'link'][i], 16);
        });
      }
      SB.at(ctx, 540, 500, 1, 0, () => SB.brain(ctx, 130, { t: T, mood: 'dizzy' }));
      [
        ['只有堆砌，没有结构', '同一个主题，散落在聊天记录各处'],
        ['只有输入，没有输出', '收藏完很少回看，想法也没留下'],
        ['想用的时候，找不到', '只能在群里一页一页往上翻'],
      ].forEach(([t, sub], i) => {
        const y = 760 + i * 190;
        SB.rect(ctx, 90, y, 900, 160, { r: 22, fill: C.white, lw: 5, shadow: true, seed: 210 + i });
        SB.circle(ctx, 170, y + 80, 42, { fill: C.coral, lw: 4 });
        SB.text(ctx, String(i + 1), 170, y + 84, { size: 50, bold: true, color: C.white, align: 'center' });
        SB.text(ctx, t, 240, y + 54, { size: 50, bold: true });
        SB.text(ctx, sub, 240, y + 116, { size: 32, color: C.soft });
      });
      footer(ctx, w, h, 2);
    },
  });

  // ---------- Xiaohongshu 3: how it works ----------

  covers.push({
    id: 'xhs-3-how',
    w: 1080,
    h: 1440,
    draw(ctx, w, h) {
      heading(ctx, w, '三步：收集、整理、思考');
      [
        ['link', C.teal, '收集', '随手发进飞书群', '链接、想法、文件、会议纪要，不打标签'],
        ['check', C.blue, '整理', '说一句「处理收件箱」', 'Claude Code 编进 Obsidian 的个人 wiki'],
        ['idea', C.purple, '思考', '只问你一个问题', '你的回答一字不改，记进「思考」'],
      ].forEach(([kind, color, label, t, sub], i) => {
        const y = 300 + i * 330;
        SB.rect(ctx, 90, y, 900, 270, { r: 24, fill: C.white, lw: 5, shadow: true, seed: 220 + i });
        SB.circle(ctx, 200, y + 135, 70, { fill: color, lw: 5 });
        SB.at(ctx, 200, y + 135, 1, 0, () => SB.icon(ctx, kind, 34));
        SB.text(ctx, `${i + 1} ${label}`, 310, y + 68, { size: 36, bold: true, color: C.coral });
        SB.text(ctx, t, 310, y + 135, { size: 52, bold: true });
        SB.text(ctx, sub, 310, y + 202, { size: 32, color: C.soft });
        if (i < 2) SB.arrow(ctx, 540, y + 282, 540, y + 322, { bend: 0, color: C.soft });
      });
      footer(ctx, w, h, 3);
    },
  });

  // ---------- Xiaohongshu 4: organize, with sources ----------

  covers.push({
    id: 'xhs-4-organize',
    w: 1080,
    h: 1440,
    draw(ctx, w, h) {
      heading(ctx, w, '每条要点都有出处');
      SB.at(ctx, 540, 470, 1, 0, () =>
        SB.laptop(ctx, 760, 330, () => {
          const o = { size: 32, mono: true, color: C.paper };
          SB.text(ctx, '>', 34, 52, { ...o, color: C.yellow });
          SB.text(ctx, '处理收件箱', 70, 52, o);
          ['拉取 12 条新消息', '抓取正文 11/12', '编译进 Obsidian', '给飞书消息加表情 OK'].forEach((line, i) => {
            SB.at(ctx, 48, 112 + i * 56, 1, 0, () => SB.icon(ctx, 'check', 16, C.green));
            SB.text(ctx, line, 80, 112 + i * 56, o);
          });
        }),
      );
      [['主题', C.teal, 3], ['项目', C.blue, 2], ['生活', C.yellow, 2], ['思考', C.purple, 1]].forEach(([label, color, count], i) =>
        SB.folder(ctx, 110 + (i % 2) * 450, 790 + Math.floor(i / 2) * 230, 400, 190, label, color, { count }),
      );
      SB.at(ctx, 540, 1000, 1.15, -0.08, () => SB.noteCard(ctx, '长上下文与 RAG', C.teal));
      SB.text(ctx, '原文存进 raw/，只增不改', w / 2, 1300, { size: 40, bold: true, align: 'center' });
      footer(ctx, w, h, 4);
    },
  });

  // ---------- Xiaohongshu 5: your words only ----------

  covers.push({
    id: 'xhs-5-think',
    w: 1080,
    h: 1440,
    draw(ctx, w, h) {
      heading(ctx, w, 'AI 不代写你的观点');
      SB.at(ctx, 170, 400, 1, 0, () => SB.brain(ctx, 85, { t: T, mood: 'think', look: [1, 0] }));
      SB.bubble(ctx, 300, 300, 700, 200, C.white);
      SB.text(ctx, '追问：「把知识编译一次」', 340, 365, { size: 38, bold: true });
      SB.text(ctx, '这篇，你同意它哪一点？', 340, 435, { size: 38, bold: true });
      SB.bubble(ctx, 120, 580, 880, 200, C.sky);
      SB.text(ctx, '个人知识库先编译成 wiki，', 165, 645, { size: 40 });
      SB.text(ctx, '比每次重新检索更省心。', 165, 715, { size: 40 });
      SB.arrow(ctx, 560, 800, 540, 920, { bend: 0.2, color: C.soft });
      SB.rect(ctx, 260, 950, 560, 200, { r: 16, fill: C.purple, lw: 5, shadow: true, seed: 510 });
      for (let i = 0; i < 5; i++) SB.circle(ctx, 260, 980 + i * 35, 10, { fill: C.paper, lw: 3, seed: 520 + i });
      SB.text(ctx, '思考/2026-10.md', 550, 1052, { size: 44, bold: true, color: C.white, align: 'center' });
      SB.at(ctx, 800, 900, 1, -0.12, () => {
        SB.rect(ctx, -160, -46, 320, 92, { r: 12, stroke: C.coral, lw: 6, seed: 530 });
        SB.text(ctx, '原话 · 一字不改', 0, 2, { size: 40, bold: true, color: C.coral, align: 'center' });
      });
      SB.text(ctx, '每次只问一个问题，你的回答原样存档', w / 2, 1270, { size: 38, bold: true, align: 'center' });
      footer(ctx, w, h, 5);
    },
  });

  // ---------- Xiaohongshu 6: install ----------

  covers.push({
    id: 'xhs-6-install',
    w: 1080,
    h: 1440,
    draw(ctx, w, h) {
      heading(ctx, w, '15 分钟装好');
      SB.at(ctx, 540, 420, 1, 0, () => SB.brain(ctx, 125, { t: T, mood: 'joy', wave: 0.7 }));
      SB.rect(ctx, 70, 640, 940, 270, { r: 22, fill: C.ink, lw: 5, shadow: true, seed: 800 });
      const o = { size: 34, mono: true, color: C.paper };
      SB.text(ctx, '$ git clone https://github.com/', 110, 705, o);
      SB.text(ctx, '      zhanlutuzi/second-brain', 110, 775, o);
      SB.text(ctx, '$ claude   →   /setup', 110, 845, { ...o, color: C.yellow });
      SB.text(ctx, '需要：Mac · Node.js · Claude Code · Obsidian', w / 2, 990, { size: 36, color: C.soft, align: 'center' });
      pill(ctx, w / 2, 1120, 'GitHub：zhanlutuzi/second-brain', { size: 42, fill: '#F8D9CF' });
      SB.text(ctx, 'MIT 开源 · 免费 · 内容只存在你自己的 iCloud', w / 2, 1250, { size: 34, bold: true, align: 'center' });
      footer(ctx, w, h, 6);
    },
  });

  // ---------- Bilibili cover ----------

  covers.push({
    id: 'bilibili-cover',
    w: 1920,
    h: 1080,
    draw(ctx) {
      const x = 260;
      const tag = '开源 · Claude Code · Obsidian';
      pill(ctx, x + (SB.measure(ctx, tag, 34, { bold: true }) + 54) / 2, 190, tag, { size: 34 });
      SB.text(ctx, '收藏夹吃灰？', x, 360, { size: 140, bold: true });
      SB.text(ctx, '让 ', x, 540, { size: 140, bold: true });
      const w1 = SB.measure(ctx, '让 ', 140, { bold: true });
      SB.text(ctx, 'AI', x + w1, 540, { size: 140, bold: true, color: C.coral });
      const w2 = SB.measure(ctx, 'AI', 140, { bold: true });
      SB.text(ctx, ' 帮你整理', x + w1 + w2, 540, { size: 140, bold: true });
      const line = '我做了个「第二大脑」';
      const lw = SB.measure(ctx, line, 76, { bold: true });
      SB.highlight(ctx, x - 20, 720 - 40, lw + 40, 80);
      SB.text(ctx, line, x, 722, { size: 76, bold: true });
      SB.text(ctx, '飞书随手发 → Claude Code 编进 Obsidian', x, 840, { size: 44, color: C.soft });

      [[1270, 220, 36], [1650, 180, 28], [1700, 560, 40], [1240, 640, 26]].forEach(([sx, sy, r], i) =>
        SB.sparkle(ctx, sx, sy, r, i % 2 ? C.teal : C.yellow),
      );
      SB.at(ctx, 1480, 470, 1, 0, () => SB.brain(ctx, 190, { t: T, mood: 'joy', wave: 0.6 }));
      SB.at(ctx, 1300, 860, 0.95, -0.12, () => SB.noteCard(ctx, '长上下文与 RAG', C.teal));
      SB.at(ctx, 1600, 870, 0.95, 0.1, () => SB.noteCard(ctx, '读书会小程序', C.blue));
    },
  });

  SB.covers = covers;
})();
