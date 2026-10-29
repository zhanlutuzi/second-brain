// The storyboard (see STORYBOARD.md). Each scene is a function of its local time t
// in seconds; `cues` lists the sound effects on the same clock, and `out` says where
// the colour blob of the transition into the next scene starts.
(function () {
  const SB = window.SB;
  const { C, prog, pop, span, ease, lerp } = SB;

  // ---------- shared pieces ----------

  /** Fade + slide up, for text that appears at `start`. */
  const rise = (ctx, t, start, fn) => {
    const p = ease.out(prog(t, start, 0.4));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(0, (1 - p) * 24);
    fn();
    ctx.restore();
  };

  /** Bottom caption on a highlighter swash, shown during [start, end). */
  const caption = (ctx, t, str, start, end = Infinity) => {
    const a = span(t, start, end);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    const size = 50;
    const w = SB.measure(ctx, str, size, { bold: true }) + 60;
    SB.highlight(ctx, SB.W / 2 - w / 2, 1010 - 34, w, 68, { draw: ease.out(prog(t, start, 0.5)) });
    SB.text(ctx, str, SB.W / 2, 1012, { size, bold: true, align: 'center' });
    ctx.restore();
  };

  /** "① 收集" style step badge in the top-left corner. */
  const badge = (ctx, t, n, label) => {
    SB.at(ctx, 120, 110, pop(t, 0.3), 0, () => {
      SB.circle(ctx, 0, 0, 52, { fill: C.coral, lw: 5, shadow: true });
      SB.text(ctx, String(n), 0, 4, { size: 60, bold: true, color: C.white, align: 'center' });
      SB.text(ctx, label, 80, 2, { size: 66, bold: true });
    });
  };

  /** Draw a message bubble with an icon and a title, top-left at (x, y). */
  const message = (ctx, x, y, w, h, kind, title, size = 28) => {
    SB.bubble(ctx, x, y, w, h);
    SB.at(ctx, x + 44, y + h / 2, 1, 0, () => SB.icon(ctx, kind, 20));
    SB.text(ctx, title, x + 80, y + h / 2 + 2, { size });
  };

  const scenes = [];

  // ---------- 1. hook: the inbox nobody reads ----------

  const FEED = [
    ['link', '长上下文会取代 RAG'],
    ['link', '间隔重复入门'],
    ['idea', '整块时间留给上午'],
    ['link', '深度工作怎么做'],
    ['file', '会议纪要.docx'],
    ['link', '本地优先软件'],
    ['link', '纯文本最长寿'],
    ['idea', '读书会加个打卡'],
    ['link', '提示词三要素'],
    ['link', '咖啡因与睡眠'],
    ['link', 'ripgrep 好用'],
    ['link', '护照换发清单'],
    ['link', 'Dataview 插件'],
  ];
  const feedTimes = [];
  for (let a = 0.3, k = 0; a < 4.0; k++) {
    feedTimes.push(a);
    a += Math.max(0.07, 0.62 * Math.pow(0.8, k));
  }

  scenes.push({
    id: 'hook',
    dur: 7,
    out: { x: 560, y: 540, color: C.yellow },
    cues: [
      ...feedTimes.filter((a, i) => i < 10).map((a) => [a, 'pop']),
      [4.6, 'stamp'],
    ],
    draw(ctx, t) {
      SB.at(ctx, 560, 540, 1, 0, () =>
        SB.phone(ctx, 420, 800, (w, h) => {
          const bottom = h - 40;
          const shown = feedTimes.filter((a) => a <= t);
          shown.forEach((a, k) => {
            let y = bottom - 88;
            for (let j = k + 1; j < shown.length; j++) y -= 104 * ease.out(prog(t, shown[j], 0.18));
            const enter = ease.out(prog(t, a, 0.18));
            if (y < 40) return;
            ctx.save();
            ctx.globalAlpha *= enter;
            const [kind, title] = FEED[k % FEED.length];
            message(ctx, 24, y + (1 - enter) * 40, w - 48, 88, kind, title, 26);
            ctx.restore();
          });
          const p = prog(t, 0.3, 3.7);
          const n = t >= 4 ? '999+' : String(Math.round(Math.exp(Math.log(999) * Math.pow(p, 1.6))));
          SB.chatHeader(ctx, w, '我的收件箱', n);
          const dim = 0.5 * prog(t, 4.2, 0.8);
          if (dim > 0) {
            ctx.fillStyle = `rgba(120,112,104,${dim})`;
            ctx.fillRect(0, 0, w, h);
          }
        }),
      );
      // zZ floating out of the forgotten phone
      for (let i = 0; i < 3; i++) {
        const s = 4.7 + i * 0.55;
        const p = prog(t, s, 1.6);
        if (p <= 0 || p >= 1) continue;
        SB.text(ctx, 'z', 700 + p * 90 + i * 30, 170 - p * 120, {
          size: 50 + i * 18,
          bold: true,
          color: C.soft,
          alpha: Math.sin(p * Math.PI),
        });
      }

      const x = 1000;
      rise(ctx, t, 0.6, () => SB.text(ctx, '看到好文章，', x, 360, { size: 84, bold: true }));
      rise(ctx, t, 1.5, () => SB.text(ctx, '先发群里存着。', x, 470, { size: 84, bold: true }));
      rise(ctx, t, 3.6, () => SB.text(ctx, '然后……', x, 650, { size: 84, bold: true, color: C.coral }));
      const last = '就再也没打开过。';
      const lw = SB.measure(ctx, last, 96, { bold: true });
      SB.at(ctx, x + lw / 2, 770, pop(t, 4.6, 0.4), 0, () => {
        SB.text(ctx, last, 0, 0, { size: 96, bold: true, align: 'center' });
      });
      SB.underline(ctx, x, 840, lw, { draw: ease.out(prog(t, 5.0, 0.5)) });
    },
  });

  // ---------- 2. problem: a dizzy brain ----------

  const PAINS = [
    ['只有堆砌，没有结构', '同一个主题，散落在聊天记录各处'],
    ['只有输入，没有输出', '收藏完很少回看，想法也没留下'],
    ['想用的时候，找不到', '只能在群里一页一页往上翻'],
  ];

  scenes.push({
    id: 'problem',
    dur: 7,
    out: { x: 500, y: 600, color: C.pink },
    cues: [[0.4, 'boing'], [0.6, 'pop'], [1.5, 'pop'], [2.5, 'pop'], [3.5, 'pop']],
    draw(ctx, t) {
      const orbit = (front) => {
        for (let i = 0; i < 6; i++) {
          const a = t * 1.1 + (i / 6) * Math.PI * 2;
          if (Math.sin(a) > 0 !== front) continue;
          const x = 500 + Math.cos(a) * 290;
          const y = 380 + Math.sin(a) * 70;
          SB.at(ctx, x, y, pop(t, 0.6 + i * 0.08) * (0.85 + Math.sin(a) * 0.15), Math.sin(a * 2 + i) * 0.3, () => {
            SB.rect(ctx, -46, -32, 92, 64, { r: 10, fill: C.white, lw: 4, seed: 200 + i });
            SB.icon(ctx, ['link', 'idea', 'file', 'link', 'meeting', 'link'][i], 16);
          });
        }
      };
      orbit(false);
      SB.at(ctx, 500, 640, pop(t, 0.4, 0.6), 0, () => SB.brain(ctx, 150, { t, mood: 'dizzy' }));
      orbit(true);

      SB.at(ctx, 960, 150, pop(t, 0.6), 0, () =>
        SB.text(ctx, '收藏越多，脑子越乱？', 0, 0, { size: 84, bold: true, align: 'center' }),
      );
      PAINS.forEach(([title, sub], i) => {
        const y = 290 + i * 210;
        SB.at(ctx, 1370, y + 85, pop(t, 1.5 + i), (i - 1) * 0.012, () => {
          SB.rect(ctx, -390, -85, 780, 170, { r: 22, fill: C.white, lw: 5, shadow: true, seed: 210 + i });
          SB.circle(ctx, -315, 0, 44, { fill: C.coral, lw: 4 });
          SB.text(ctx, String(i + 1), -315, 4, { size: 52, bold: true, color: C.white, align: 'center' });
          SB.text(ctx, title, -240, -26, { size: 52, bold: true });
          SB.text(ctx, sub, -240, 40, { size: 32, color: C.soft });
        });
      });
    },
  });

  // ---------- 3. intro: meet the second brain ----------

  const TAGS = [
    ['飞书', C.sky],
    ['Claude Code', '#F8D9CF'],
    ['Obsidian', '#E3DCF6'],
  ];

  scenes.push({
    id: 'intro',
    dur: 6,
    out: { x: 960, y: 720, color: C.teal },
    cues: [[0.3, 'boing'], [0.9, 'ding'], [3.0, 'pop'], [3.2, 'pop'], [3.4, 'pop']],
    draw(ctx, t) {
      const sp = [[700, 230, 34], [1230, 200, 28], [1290, 470, 40], [640, 520, 26], [800, 120, 20], [1130, 90, 22]];
      sp.forEach(([x, y, r], i) => {
        const s = pop(t, 0.7 + i * 0.1) * (0.85 + Math.sin(t * 5 + i) * 0.15);
        SB.at(ctx, x, y, s, t * 0.4 + i, () => SB.sparkle(ctx, 0, 0, r, i % 2 ? C.yellow : C.teal));
      });
      SB.at(ctx, 960, 400, pop(t, 0.3, 0.6), 0, () => SB.brain(ctx, 150, { t, mood: 'joy', wave: prog(t, 1.2, 0.3) }));

      const tp = pop(t, 0.9, 0.5);
      SB.at(ctx, 960, 720, 0.6 + 0.4 * tp, 0, () => {
        ctx.globalAlpha *= SB.clamp(tp * 2);
        SB.text(ctx, '第二大脑', 0, 0, { size: 150, bold: true, align: 'center' });
      });
      SB.underline(ctx, 960 - 300, 812, 600, { draw: ease.out(prog(t, 1.3, 0.6)) });
      SB.text(ctx, '随手丢进聊天框，AI 每天帮你整理成个人 wiki', 960, 880, {
        size: 48,
        align: 'center',
        reveal: prog(t, 1.9, 1.0),
      });

      const widths = TAGS.map(([s]) => SB.measure(ctx, s, 36, { bold: true }) + 64);
      let x = 960 - (widths.reduce((a, b) => a + b, 0) + 30 * (TAGS.length - 1)) / 2;
      TAGS.forEach(([label, fill], i) => {
        const w = widths[i];
        SB.at(ctx, x + w / 2, 985, pop(t, 3.0 + i * 0.2), 0, () => {
          SB.rect(ctx, -w / 2, -30, w, 60, { r: 30, fill, lw: 4, seed: 300 + i });
          SB.text(ctx, label, 0, 2, { size: 36, bold: true, align: 'center' });
        });
        x += w + 30;
      });
    },
  });

  // ---------- 4. step 1: collect ----------

  const KINDS = [
    ['link', '长上下文会取代 RAG 吗', '链接', '自动抓取正文，公众号也行', C.teal],
    ['idea', '读书会可以加个打卡功能', '想法', '原话保留，一字不改', C.yellow],
    ['file', '间隔重复.pdf', '文件和图片', '下载归档，交给 Claude 阅读', C.blue],
    ['meeting', '会议：读书会小程序', '会议纪要', '决策和待办，追加到项目页', C.purple],
  ];

  scenes.push({
    id: 'collect',
    dur: 9,
    out: { x: 520, y: 560, color: C.blue },
    cues: [[0.3, 'pop'], ...KINDS.flatMap((_, i) => [[0.9 + i * 1.2, 'pop'], [1.5 + i * 1.2, 'tick']]), [6.2, 'ding']],
    draw(ctx, t) {
      badge(ctx, t, 1, '收集');
      SB.at(ctx, 520, 560, 1, 0, () =>
        SB.phone(ctx, 420, 800, (w) => {
          KINDS.forEach(([kind, title], i) => {
            const a = 0.9 + i * 1.2;
            const e = ease.out(prog(t, a, 0.25));
            if (e <= 0) return;
            ctx.save();
            ctx.globalAlpha *= e;
            message(ctx, 24, 150 + i * 135 + (1 - e) * 40, w - 48, 110, kind, title, 22);
            ctx.restore();
          });
          SB.chatHeader(ctx, w, '我的收件箱');
        }),
      );
      KINDS.forEach(([kind, , label, sub, color], i) => {
        const a = 0.9 + i * 1.2;
        const rowY = 300 + i * 165;
        SB.arrow(ctx, 700, 381 + i * 135, 940, rowY, { draw: ease.inOut(prog(t, a + 0.3, 0.4)), bend: -0.12, color: C.soft });
        SB.at(ctx, 1010, rowY, pop(t, a + 0.6), 0, () => {
          SB.circle(ctx, 0, 0, 50, { fill: color, lw: 5 });
          SB.icon(ctx, kind, 24);
        });
        rise(ctx, t, a + 0.7, () => {
          SB.text(ctx, label, 1090, rowY - 22, { size: 52, bold: true });
          SB.text(ctx, sub, 1090, rowY + 34, { size: 34, color: C.soft });
        });
      });
      caption(ctx, t, '不打标签，不挑格式，不改习惯。', 6.2);
    },
  });

  // ---------- 5. step 2: organize ----------

  const LOG = [
    [2.0, '拉取 12 条新消息'],
    [2.6, '抓取正文 11/12'],
    [3.2, '编译进 Obsidian'],
    [7.6, '更新 index.md 和 log.md'],
    [8.2, '给飞书消息加表情 OK'],
  ];
  const FOLDERS = [
    ['主题', C.teal, 1130, 190],
    ['项目', C.blue, 1480, 190],
    ['生活', C.yellow, 1130, 450],
    ['思考', C.purple, 1480, 450],
  ];
  const CARDS = [
    [0, '长上下文与 RAG'],
    [1, '读书会小程序'],
    [2, '咖啡因与睡眠'],
    [0, '间隔重复'],
    [3, '2026-10'],
    [0, '深度工作'],
    [1, '打卡功能延期'],
    [2, '护照换发'],
  ];
  const launch = (i) => 3.5 + i * 0.5;
  const LAND = 0.75;

  scenes.push({
    id: 'organize',
    dur: 12,
    out: { x: 1630, y: 555, color: C.purple },
    cues: [
      [0.3, 'pop'],
      ...Array.from('处理收件箱').map((_, i) => [0.7 + i * 0.2, 'type']),
      ...LOG.map(([a]) => [a, 'tick']),
      ...CARDS.map((_, i) => [launch(i) + LAND, 'pop']),
      [8.8, 'ding'],
    ],
    draw(ctx, t) {
      badge(ctx, t, 2, '整理');

      SB.at(ctx, 560, 520, 1, 0, () =>
        SB.laptop(ctx, 720, 440, () => {
          const o = { size: 34, mono: true, color: C.paper };
          SB.text(ctx, '>', 36, 60, { ...o, color: C.yellow });
          SB.text(ctx, '处理收件箱', 76, 60, { ...o, reveal: prog(t, 0.7, 1.0) });
          let y = 60;
          LOG.forEach(([a, line]) => {
            if (t < a) return;
            y += 60;
            SB.at(ctx, 52, y, 1, 0, () => SB.icon(ctx, 'check', 18, C.green));
            SB.text(ctx, line, 86, y, o);
          });
          if (t >= 8.8) {
            y += 60;
            SB.text(ctx, '完成 · 有 1 个追问等你回答', 36, y, { ...o, color: C.coral });
          }
          if (Math.floor(t * 2) % 2 === 0) {
            ctx.fillStyle = C.paper;
            ctx.fillRect(t < 2 ? 76 + 34 * 5 * prog(t, 0.7, 1.0) + 6 : 36, (t < 2 ? 60 : y + 60) - 18, 18, 36);
          }
        }),
      );
      const mood = t < 3.4 ? 'think' : t < 8.8 ? 'happy' : 'joy';
      SB.at(ctx, 960, 780, pop(t, 0.5), 0, () => SB.brain(ctx, 72, { t, mood, look: [1, -0.3] }));

      const landed = CARDS.filter((_, i) => t >= launch(i) + LAND);
      FOLDERS.forEach(([label, color, x, y], f) => {
        const mine = CARDS.map((c, i) => [c, i]).filter(([c]) => c[0] === f);
        const count = mine.filter(([, i]) => t >= launch(i) + LAND).length;
        const last = mine.filter(([, i]) => t >= launch(i) + LAND).pop();
        const bump = last ? prog(t, launch(last[1]) + LAND, 0.3) : 0;
        SB.at(ctx, x + 150, y + 105, pop(t, 0.6 + f * 0.12), 0, () =>
          SB.folder(ctx, -150, -105, 300, 210, label, color, { count, bump: bump < 1 ? bump : 0 }),
        );
      });

      // raw/: every card leaves its original behind
      SB.at(ctx, 1455, 790, pop(t, 1.1), 0, () => {
        SB.rect(ctx, -325, -70, 650, 140, { r: 18, fill: '#EDE6D9', lw: 5, shadow: true, seed: 400 });
        SB.text(ctx, 'raw/', -290, -16, { size: 40, bold: true, mono: true });
        SB.text(ctx, '原文 · 只增不改', -290, 34, { size: 32, color: C.soft });
        landed.forEach((_, i) => {
          SB.at(ctx, 60 + i * 30, 6 - i * 4, 1, (i % 3 - 1) * 0.06, () =>
            SB.rect(ctx, -34, -44, 68, 88, { r: 6, fill: C.white, lw: 3, seed: 410 + i }),
          );
        });
      });

      CARDS.forEach(([f, title], i) => {
        const p = prog(t, launch(i), LAND);
        if (p <= 0 || p >= 1) return;
        const e = ease.inOut(p);
        const [, color, fx, fy] = FOLDERS[f];
        const x = lerp(560, fx + 150, e);
        const y = lerp(470, fy + 120, e) - Math.sin(e * Math.PI) * 200;
        const s = Math.sin(p * Math.PI) * 0.7 + 0.3;
        SB.at(ctx, x, y, s, (1 - e) * -0.3, () => SB.noteCard(ctx, title, color));
      });

      caption(ctx, t, '说一句「处理收件箱」，剩下的交给 Claude Code', 0.9, 6.3);
      caption(ctx, t, '要点编进主题、项目、生活页，每条都标明出处', 6.4);
    },
  });

  // ---------- 6. step 3: think ----------

  const ASK = ['追问：「把知识编译一次」这篇，', '你同意它哪一点？'];
  const REPLY = ['个人知识库先编译成 wiki，', '比每次重新检索更省心。'];
  const REPLY_AT = [3.8, 5.6];

  scenes.push({
    id: 'think',
    dur: 9,
    out: { x: 1400, y: 840, color: C.teal },
    cues: [
      [0.3, 'pop'],
      [0.5, 'pop'],
      [0.9, 'tick'],
      [1.2, 'tick'],
      [1.5, 'tick'],
      [1.8, 'tick'],
      [2.0, 'pop'],
      [3.7, 'pop'],
      ...Array.from({ length: 16 }, (_, i) => [REPLY_AT[0] + i * 0.11, 'type']),
      [6.0, 'whoosh'],
      [5.9, 'pop'],
      [7.0, 'stamp'],
    ],
    draw(ctx, t) {
      badge(ctx, t, 3, '思考');

      SB.at(ctx, 430, 490, pop(t, 0.5, 0.5), -0.02, () => {
        SB.rect(ctx, -290, -280, 580, 560, { r: 20, fill: C.white, lw: 5, shadow: true, seed: 500 });
        SB.text(ctx, '处理报告', -240, -210, { size: 54, bold: true });
        SB.line(ctx, -240, -160, 240, -160, { lw: 3, stroke: C.grey });
        const row = (a, y, dot, str, sub) =>
          rise(ctx, t, a, () => {
            SB.circle(ctx, -225, y, 13, { fill: dot, lw: 3 });
            SB.text(ctx, str, -195, y, { size: 42, bold: true });
            if (sub) SB.text(ctx, sub, -195, y + 46, { size: 28, color: C.soft });
          });
        row(0.9, -90, C.teal, '已入库 12 条');
        row(1.2, 10, C.coral, '失败 1 条', '用 Web Clipper 补剪藏');
        row(1.5, 130, C.grey, '还有 3 条留到下次');
        row(1.8, 220, C.purple, '追问 1 个 →');
      });

      const mood = t < 5.8 ? 'think' : 'joy';
      SB.at(ctx, 900, 330, pop(t, 0.3), 0, () => SB.brain(ctx, 80, { t, mood, look: [1, 0] }));

      SB.at(ctx, 1405, 305, pop(t, 2.0), 0, () => {
        SB.bubble(ctx, -395, -95, 790, 190, C.white);
        SB.text(ctx, ASK[0], -355, -34, { size: 38, bold: true, reveal: prog(t, 2.1, 0.7) });
        SB.text(ctx, ASK[1], -355, 34, { size: 38, bold: true, reveal: prog(t, 2.8, 0.4) });
      });

      // the reply is typed, then a copy is filed into 思考/
      SB.at(ctx, 1405, 540, pop(t, 3.7), 0, () => {
        SB.bubble(ctx, -395, -80, 790, 160, C.sky);
        const per = (REPLY_AT[1] - REPLY_AT[0]) / Array.from(REPLY.join('')).length;
        const n0 = Array.from(REPLY[0]).length;
        SB.text(ctx, REPLY[0], -355, -30, { size: 38, reveal: prog(t, REPLY_AT[0], per * n0) });
        SB.text(ctx, REPLY[1], -355, 32, { size: 38, reveal: prog(t, REPLY_AT[0] + per * n0, REPLY_AT[1] - REPLY_AT[0] - per * n0) });
      });
      const fly = prog(t, 6.0, 0.8);
      if (fly > 0 && fly < 1) {
        const e = ease.inOut(fly);
        SB.at(ctx, lerp(1405, 1400, e), lerp(540, 830, e) - Math.sin(e * Math.PI) * 120, lerp(0.45, 0.15, e), e * 0.6, () => {
          SB.rect(ctx, -395, -80, 790, 160, { r: 22, fill: C.sky, lw: 8, seed: 540 });
          SB.line(ctx, -340, -25, 300, -25, { lw: 14, stroke: C.soft, seed: 541 });
          SB.line(ctx, -340, 30, 150, 30, { lw: 14, stroke: C.soft, seed: 542 });
        });
      }

      SB.at(ctx, 1400, 840, pop(t, 5.9), 0, () => {
        const bump = Math.sin(prog(t, 6.8, 0.25) * Math.PI) * 0.08;
        ctx.scale(1 + bump, 1 - bump);
        SB.rect(ctx, -190, -80, 380, 160, { r: 14, fill: C.purple, lw: 5, shadow: true, seed: 510 });
        for (let i = 0; i < 4; i++) SB.circle(ctx, -190, -48 + i * 32, 9, { fill: C.paper, lw: 3, seed: 520 + i });
        SB.text(ctx, '思考/2026-10.md', 10, 2, { size: 38, bold: true, color: C.white, align: 'center' });
      });

      const st = prog(t, 7.0, 0.18);
      if (st > 0) {
        SB.at(ctx, 1690, 690, lerp(2.2, 1, ease.out(st)), -0.12, () => {
          ctx.globalAlpha *= st;
          SB.rect(ctx, -150, -44, 300, 88, { r: 12, stroke: C.coral, lw: 6, seed: 530 });
          SB.text(ctx, '原话 · 一字不改', 0, 2, { size: 40, bold: true, color: C.coral, align: 'center' });
        });
      }

      caption(ctx, t, '每次只问你一个问题，AI 不代写你的观点', 7.1);
    },
  });

  // ---------- 7. use: browse and ask ----------

  const NODES = [
    ['长上下文与 RAG', 540, 520, C.teal, 26],
    ['间隔重复', 290, 330, C.teal, 20],
    ['记忆卡片', 220, 590, C.teal, 18],
    ['深度工作', 790, 290, C.teal, 20],
    ['注意力残留', 900, 470, C.teal, 16],
    ['本地优先', 380, 790, C.teal, 18],
    ['纯文本', 660, 820, C.teal, 16],
    ['读书会小程序', 860, 670, C.blue, 24],
    ['咖啡因与睡眠', 160, 830, C.yellow, 16],
    ['思考 · 2026-10', 540, 210, C.purple, 20],
  ];
  const EDGES = [[0, 9], [0, 5], [0, 6], [1, 2], [1, 9], [3, 4], [3, 9], [4, 7], [5, 6], [0, 2], [7, 9], [3, 0], [2, 8], [5, 8]];
  const nodeAt = (i) => 0.3 + i * 0.17;
  const ANSWER = [
    ['10-26', '后端接口还没联调完 [1]'],
    ['决策', '上线从 10/30 推迟到 11/06 [1]'],
    ['待办', 'B 在 11/01 前完成联调 [1]'],
  ];

  scenes.push({
    id: 'use',
    dur: 8,
    out: { x: 960, y: 540, color: C.yellow },
    cues: [
      ...NODES.map((_, i) => [nodeAt(i), 'tick']),
      [2.6, 'pop'],
      [3.4, 'pop'],
      [3.6, 'ding'],
      [3.9, 'tick'],
      [4.3, 'tick'],
      [4.7, 'tick'],
    ],
    draw(ctx, t) {
      const pos = NODES.map(([, x, y], i) => [x + Math.sin(t * 1.2 + i) * 6, y + Math.cos(t * 1.0 + i * 2) * 6]);
      EDGES.forEach(([a, b]) => {
        const start = Math.max(nodeAt(a), nodeAt(b)) + 0.1;
        SB.line(ctx, pos[a][0], pos[a][1], pos[b][0], pos[b][1], {
          lw: 3,
          stroke: C.soft,
          draw: ease.out(prog(t, start, 0.4)),
          seed: a * 31 + b,
        });
      });
      const hl = prog(t, 3.6, 0.6);
      NODES.forEach(([label, , , color, r], i) => {
        const [x, y] = pos[i];
        if (i === 7 && hl > 0) {
          SB.circle(ctx, x, y, r + 10 + hl * 26, { stroke: C.coral, lw: 6 * (1.2 - hl * 0.5), seed: 600 });
        }
        SB.at(ctx, x, y, pop(t, nodeAt(i)), 0, () => {
          SB.circle(ctx, 0, 0, r, { fill: color, lw: 4, seed: 610 + i });
          SB.text(ctx, label, 0, r + 30, { size: 30, bold: i === 7, align: 'center', color: i === 7 && hl > 0 ? C.coral : C.ink, halo: C.paper });
        });
      });

      SB.at(ctx, 1430, 225, pop(t, 2.6), 0, () => {
        SB.bubble(ctx, -370, -55, 740, 110, C.sky);
        SB.text(ctx, '读书会的打卡功能为什么延期？', 0, 2, { size: 40, bold: true, align: 'center' });
      });

      SB.at(ctx, 1430, 570, pop(t, 3.4), 0, () => {
        SB.rect(ctx, -370, -240, 740, 480, { r: 22, fill: C.white, lw: 5, shadow: true, seed: 620 });
        SB.line(ctx, -270, -150, -270, 50, { lw: 4, stroke: C.grey, draw: ease.out(prog(t, 3.8, 0.9)) });
        ANSWER.forEach(([tag, str], i) => {
          const y = -150 + i * 100;
          rise(ctx, t, 3.9 + i * 0.4, () => {
            SB.rect(ctx, -330, y - 28, 120, 56, { r: 28, fill: i === 0 ? '#F8D9CF' : C.sky, lw: 4, seed: 630 + i });
            SB.text(ctx, tag, -270, y + 2, { size: 30, bold: true, align: 'center' });
            SB.text(ctx, str, -180, y + 2, { size: 34 });
          });
        });
        rise(ctx, t, 5.1, () => {
          SB.line(ctx, -330, 130, 330, 130, { lw: 3, stroke: C.grey });
          SB.text(ctx, '[1] 会议纪要 · 读书会小程序 · 2026-10-26', -330, 180, { size: 28, color: C.soft });
        });
      });

      caption(ctx, t, '每个说法都附出处；知识库里没有，就直说没有', 4.9);
    },
  });

  // ---------- 8. outro ----------

  const CONFETTI = (() => {
    const r = SB.rng(808);
    const colors = [C.coral, C.teal, C.yellow, C.blue, C.pink, C.purple];
    return Array.from({ length: 90 }, () => ({
      x: r() * SB.W,
      delay: r() * 2.5,
      speed: 220 + r() * 260,
      sway: 20 + r() * 40,
      spin: (r() - 0.5) * 8,
      color: colors[Math.floor(r() * colors.length)],
      w: 12 + r() * 14,
      h: 8 + r() * 8,
    }));
  })();
  const CMD = ['$ git clone https://github.com/zhanlutuzi/second-brain', '$ claude    →  /setup'];

  scenes.push({
    id: 'outro',
    dur: 7,
    cues: [
      [0.3, 'boing'],
      [0.9, 'ding'],
      ...Array.from({ length: 10 }, (_, i) => [1.7 + i * 0.1, 'type']),
      ...Array.from({ length: 5 }, (_, i) => [2.9 + i * 0.1, 'type']),
      [3.7, 'pop'],
    ],
    draw(ctx, t) {
      CONFETTI.forEach((c, i) => {
        const tt = t - 0.4 - c.delay;
        if (tt < 0) return;
        const y = -40 + tt * c.speed;
        if (y > SB.H + 40) return;
        ctx.save();
        ctx.translate(c.x + Math.sin(tt * 2 + i) * c.sway, y);
        ctx.rotate(tt * c.spin);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      });

      SB.at(ctx, 960, 320, pop(t, 0.3, 0.6), 0, () => SB.brain(ctx, 140, { t, mood: 'joy', wave: prog(t, 0.6, 0.3) }));
      const tp = pop(t, 0.9, 0.5);
      SB.at(ctx, 960, 590, 0.6 + 0.4 * tp, 0, () => {
        ctx.globalAlpha *= SB.clamp(tp * 2);
        SB.text(ctx, '第二大脑', 0, 0, { size: 120, bold: true, align: 'center' });
      });
      rise(ctx, t, 1.3, () => SB.text(ctx, 'second-brain-kit · MIT 开源', 960, 685, { size: 40, color: C.soft, align: 'center' }));

      SB.at(ctx, 960, 830, pop(t, 1.5), 0, () => {
        SB.rect(ctx, -500, -80, 1000, 160, { r: 22, fill: C.ink, lw: 5, shadow: true, seed: 800 });
        const o = { size: 32, mono: true, color: C.paper };
        SB.text(ctx, CMD[0], -460, -32, { ...o, reveal: prog(t, 1.7, 1.0) });
        SB.text(ctx, CMD[1], -460, 34, { ...o, reveal: prog(t, 2.9, 0.5) });
      });
      SB.at(ctx, 960, 990, pop(t, 3.7), 0, () => {
        SB.highlight(ctx, -200, -32, 400, 64, { color: C.yellow });
        SB.text(ctx, '约 15 分钟装好', 0, 2, { size: 48, bold: true, align: 'center' });
      });
    },
  });

  SB.scenes = scenes;
})();
