// The cast and props: the brain mascot, phone, laptop, folders, chat bubbles and icons.
// Each draws itself around a given point; motion comes from the scene via SB.at().
(function () {
  const SB = window.SB;
  const { C } = SB;

  // ---------- mascot ----------

  /**
   * The mascot, centred on (0,0) with body radius R.
   * opts: t (seconds, for blinking and bobbing), mood ('happy' | 'joy' | 'dizzy' | 'wow' | 'think'),
   *       look ([dx, dy] in -1..1), wave (0..1 arm wave), legs (default true)
   */
  SB.brain = (ctx, R, opts = {}) => {
    const { t = 0, mood = 'happy', look = [0, 0], wave = 0, legs = true } = opts;
    const bob = Math.sin(t * Math.PI * 1.6) * R * 0.03;
    ctx.save();
    ctx.translate(0, bob);

    // legs and arms sit behind the body
    if (legs) {
      for (const s of [-1, 1]) {
        SB.line(ctx, s * R * 0.35, R * 0.75, s * R * 0.4, R * 1.12, { lw: 6, seed: 20 + s });
        SB.ellipse(ctx, s * R * 0.47, R * 1.15, R * 0.16, R * 0.08, { fill: C.ink, lw: 0, stroke: null, seed: 22 + s });
      }
    }
    const arm = (s, angle, len = 0.45) => {
      const x0 = s * R * 1.0;
      const y0 = R * 0.25;
      const x1 = x0 + Math.cos(angle) * R * len * s;
      const y1 = y0 + Math.sin(angle) * R * len;
      SB.line(ctx, x0, y0, x1, y1, { lw: 6, seed: 30 + s });
      SB.circle(ctx, x1, y1, R * 0.09, { fill: C.pink, lw: 4, seed: 32 + s });
    };
    arm(-1, 0.7);
    if (!wave) arm(1, 0.7);

    // body: a bumpy cloud
    const pts = [];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + 0.055 * Math.cos(a * 9);
      pts.push([Math.cos(a) * R * 1.12 * r, Math.sin(a) * R * 0.92 * r]);
    }
    SB.shape(ctx, pts, { fill: C.pink, lw: 5, seed: 40, amp: 1.4, shadow: true });

    // folds
    const fold = (p, seed) => SB.shape(ctx, p, { closed: false, stroke: C.rose, lw: 4, seed, amp: 1 });
    fold([[0, -R * 0.88], [-R * 0.06, -R * 0.62], [R * 0.05, -R * 0.42], [0, -R * 0.22]], 41);
    fold([[-R * 0.75, -R * 0.35], [-R * 0.5, -R * 0.5], [-R * 0.3, -R * 0.38]], 42);
    fold([[-R * 0.55, -R * 0.72], [-R * 0.42, -R * 0.55]], 43);
    fold([[R * 0.75, -R * 0.35], [R * 0.5, -R * 0.52], [R * 0.3, -R * 0.4]], 44);
    fold([[R * 0.5, -R * 0.75], [R * 0.4, -R * 0.58]], 45);

    // a waving arm goes in front of the body
    if (wave) arm(1, -0.75 + Math.sin(t * 12) * 0.4 * wave, 0.62);

    // cheeks
    ctx.save();
    ctx.globalAlpha *= 0.5;
    SB.ellipse(ctx, -R * 0.62, R * 0.35, R * 0.13, R * 0.08, { fill: C.coral, stroke: null, seed: 46 });
    SB.ellipse(ctx, R * 0.62, R * 0.35, R * 0.13, R * 0.08, { fill: C.coral, stroke: null, seed: 47 });
    ctx.restore();

    // eyes
    const ex = R * 0.32;
    const ey = R * 0.1;
    const blinking = t % 3.2 > 3.05;
    for (const s of [-1, 1]) {
      const x = s * ex;
      if (mood === 'joy') {
        SB.shape(ctx, [[x - R * 0.13, ey + R * 0.04], [x, ey - R * 0.1], [x + R * 0.13, ey + R * 0.04]], { closed: false, lw: 6, seed: 50 + s });
      } else if (mood === 'dizzy') {
        const sp = [];
        for (let i = 0; i < 24; i++) {
          const a = i * 0.55 + t * 6 * s;
          const rr = (i / 24) * R * 0.15;
          sp.push([x + Math.cos(a) * rr, ey + Math.sin(a) * rr]);
        }
        SB.circle(ctx, x, ey, R * 0.17, { fill: C.white, lw: 4, seed: 52 + s });
        SB.shape(ctx, sp, { closed: false, lw: 3.5, amp: 0.4, seed: 54 + s });
      } else if (blinking) {
        SB.line(ctx, x - R * 0.13, ey, x + R * 0.13, ey, { lw: 6, seed: 56 + s });
      } else {
        const big = mood === 'wow' ? 1.18 : 1;
        SB.ellipse(ctx, x, ey, R * 0.16 * big, R * 0.18 * big, { fill: C.white, lw: 4, seed: 58 + s });
        const lx = look[0] * R * 0.06;
        const ly = (mood === 'think' ? -0.7 : look[1]) * R * 0.06;
        SB.circle(ctx, x + lx, ey + ly + R * 0.02, R * 0.085 * big, { fill: C.ink, stroke: null, seed: 60 + s });
        SB.circle(ctx, x + lx + R * 0.03, ey + ly - R * 0.02, R * 0.03, { fill: C.white, stroke: null, seed: 62 + s });
      }
    }

    // mouth
    const my = R * 0.42;
    if (mood === 'wow') {
      SB.ellipse(ctx, 0, my, R * 0.08, R * 0.1, { fill: C.ink, lw: 3, seed: 70 });
    } else if (mood === 'dizzy') {
      const w = [];
      for (let i = 0; i <= 8; i++) w.push([-R * 0.16 + (i / 8) * R * 0.32, my + Math.sin(i * 1.6) * R * 0.035]);
      SB.shape(ctx, w, { closed: false, lw: 4, amp: 0.6, seed: 71 });
    } else if (mood === 'think') {
      SB.line(ctx, -R * 0.05, my, R * 0.1, my - R * 0.03, { lw: 5, seed: 72 });
    } else {
      const open = mood === 'joy' ? 0.2 : 0.1;
      const m = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (i / 10);
        m.push([-Math.cos(a) * R * 0.17, my - R * 0.03 + Math.sin(a) * R * open]);
      }
      SB.shape(ctx, m, { closed: mood === 'joy', fill: mood === 'joy' ? C.coral : null, lw: 5, amp: 0.6, seed: 73 });
    }
    ctx.restore();
  };

  // ---------- devices ----------

  /** A phone centred on (0,0); `screen(w, h)` draws with (0,0) at the screen's top-left, clipped. */
  SB.phone = (ctx, w, h, screen) => {
    SB.rect(ctx, -w / 2, -h / 2, w, h, { r: 46, fill: C.ink, lw: 5, shadow: true });
    const sx = -w / 2 + 16;
    const sy = -h / 2 + 16;
    const sw = w - 32;
    const sh = h - 32;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, 32);
    ctx.fillStyle = C.white;
    ctx.fill();
    ctx.clip();
    ctx.translate(sx, sy);
    screen(sw, sh);
    ctx.restore();
    SB.rect(ctx, -46, -h / 2 + 22, 92, 22, { r: 11, fill: C.ink, stroke: null });
  };

  /** Chat header shown at the top of the phone screen. */
  SB.chatHeader = (ctx, w, title, badge) => {
    ctx.fillStyle = '#EFE8DC';
    ctx.fillRect(0, 0, w, 120);
    SB.line(ctx, 0, 120, w, 120, { lw: 3, stroke: C.grey });
    SB.text(ctx, title, w / 2, 82, { size: 32, bold: true, align: 'center' });
    if (badge) {
      const bw = Math.max(48, SB.measure(ctx, badge, 26, { bold: true }) + 26);
      SB.rect(ctx, w - bw - 16, 62, bw, 42, { r: 21, fill: C.coral, stroke: null });
      SB.text(ctx, badge, w - bw / 2 - 16, 84, { size: 26, bold: true, color: C.white, align: 'center' });
    }
  };

  /** A laptop centred on its screen's middle; `screen(w, h)` draws into the dark display. */
  SB.laptop = (ctx, w, h, screen) => {
    SB.rect(ctx, -w / 2 - 24, -h / 2 - 24, w + 48, h + 48, { r: 26, fill: '#3A3944', lw: 5, shadow: true });
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.clip();
    ctx.translate(-w / 2, -h / 2);
    screen(w, h);
    ctx.restore();
    const by = h / 2 + 24;
    SB.shape(
      ctx,
      [[-w / 2 - 70, by], [w / 2 + 70, by], [w / 2 + 110, by + 46], [-w / 2 - 110, by + 46]],
      { fill: C.grey, lw: 5, seed: 80, shadow: true },
    );
    SB.rect(ctx, -70, by + 8, 140, 14, { r: 7, fill: '#BFB6A8', stroke: null });
  };

  // ---------- paper props ----------

  /** A chat bubble at (x, y) with top-left origin. */
  SB.bubble = (ctx, x, y, w, h, fill = C.sky) => SB.rect(ctx, x, y, w, h, { r: 22, fill, lw: 4, seed: SB.hash(w, h, 9) });

  /** A folder at (x, y) top-left; `count` badge and `bump` (0..1 squash) are optional. */
  SB.folder = (ctx, x, y, w, h, label, color, opts = {}) => {
    const { count = null, bump = 0 } = opts;
    const s = 1 + Math.sin(bump * Math.PI) * 0.08;
    SB.at(ctx, x + w / 2, y + h, s, 0, () => {
      const X = -w / 2;
      const Y = -h;
      SB.shape(ctx, [[X, Y + 26], [X, Y], [X + w * 0.38, Y], [X + w * 0.46, Y + 26]], { fill: color, lw: 4, seed: 100 });
      SB.rect(ctx, X, Y + 24, w, h - 24, { r: 16, fill: color, lw: 5, shadow: true });
      SB.text(ctx, label, 0, Y + 24 + (h - 24) / 2, { size: 52, bold: true, color: C.ink, align: 'center' });
      if (count !== null && count > 0) {
        SB.circle(ctx, X + w - 6, Y + 26, 30, { fill: C.coral, lw: 4 });
        SB.text(ctx, String(count), X + w - 6, Y + 28, { size: 32, bold: true, color: C.white, align: 'center' });
      }
    });
  };

  /** A small note card centred on (0,0), with a coral source tag. */
  SB.noteCard = (ctx, title, color) => {
    SB.rect(ctx, -130, -70, 260, 140, { r: 14, fill: C.white, lw: 4, shadow: true, seed: 110 });
    ctx.fillStyle = color;
    ctx.fillRect(-114, -52, 12, 34);
    SB.text(ctx, title, -92, -34, { size: 26, bold: true });
    SB.line(ctx, -112, 4, 100, 4, { lw: 3, stroke: C.grey, seed: 111 });
    SB.line(ctx, -112, 28, 60, 28, { lw: 3, stroke: C.grey, seed: 112 });
    SB.rect(ctx, 66, 14, 54, 34, { r: 8, fill: C.coral, stroke: null, seed: 113 });
    SB.text(ctx, '出处', 93, 32, { size: 20, bold: true, color: C.white, align: 'center' });
  };

  /** A four-point sparkle. */
  SB.sparkle = (ctx, x, y, r, color = C.yellow) => {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.32;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    SB.shape(ctx, pts, { fill: color, lw: 3.5, amp: 0.8, seed: SB.hash(r, 7) });
  };

  // ---------- icons (centred on (0,0), about 2r wide) ----------

  SB.icon = (ctx, kind, r = 28, color = C.ink) => {
    const o = { lw: Math.max(3, r / 8), stroke: color, amp: 0.7 };
    if (kind === 'link') {
      ctx.save();
      ctx.rotate(-Math.PI / 4);
      SB.rect(ctx, -r * 1.0, -r * 0.36, r * 1.15, r * 0.72, { ...o, r: r * 0.36, seed: 120 });
      SB.rect(ctx, -r * 0.15, -r * 0.36, r * 1.15, r * 0.72, { ...o, r: r * 0.36, seed: 121 });
      ctx.restore();
    } else if (kind === 'idea') {
      SB.circle(ctx, 0, -r * 0.2, r * 0.6, { ...o, fill: C.yellow, seed: 122 });
      SB.rect(ctx, -r * 0.28, r * 0.42, r * 0.56, r * 0.42, { ...o, r: 4, fill: C.grey, seed: 123 });
    } else if (kind === 'file') {
      SB.shape(ctx, [[-r * 0.6, -r * 0.85], [r * 0.25, -r * 0.85], [r * 0.6, -r * 0.5], [r * 0.6, r * 0.85], [-r * 0.6, r * 0.85]], { ...o, fill: C.white, seed: 124 });
      SB.line(ctx, -r * 0.3, -r * 0.1, r * 0.3, -r * 0.1, { ...o, seed: 125 });
      SB.line(ctx, -r * 0.3, r * 0.3, r * 0.3, r * 0.3, { ...o, seed: 126 });
    } else if (kind === 'meeting') {
      for (const s of [-1, 1]) {
        SB.circle(ctx, s * r * 0.42, -r * 0.35, r * 0.26, { ...o, fill: C.white, seed: 127 + s });
        SB.shape(ctx, [[s * r * 0.42 - r * 0.42, r * 0.7], [s * r * 0.42 - r * 0.36, r * 0.1], [s * r * 0.42 + r * 0.36, r * 0.1], [s * r * 0.42 + r * 0.42, r * 0.7]], { ...o, fill: C.white, seed: 129 + s });
      }
    } else if (kind === 'check') {
      SB.shape(ctx, [[-r * 0.5, 0], [-r * 0.1, r * 0.4], [r * 0.55, -r * 0.45]], { ...o, closed: false, seed: 131 });
    }
  };
})();
