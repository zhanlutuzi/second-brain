// Drawing toolkit: easing, seeded randomness and hand-drawn shapes on a 2D canvas.
// Every function here is a pure function of its arguments and SB.boil, so a
// frame depends only on its time and the video renders identically every run.
(function () {
  const SB = (window.SB = window.SB || {});

  SB.W = 1920;
  SB.H = 1080;
  SB.FPS = 30;

  SB.C = {
    paper: '#F6EFE2',
    ink: '#2B2A33',
    soft: '#7A7480',
    white: '#FFFDF8',
    coral: '#E07A5F',
    teal: '#5BB5A2',
    yellow: '#F2C14E',
    blue: '#6C9BD2',
    sky: '#DCEBFA',
    pink: '#F4A7B9',
    rose: '#D9798F',
    purple: '#9D8BD6',
    green: '#7BC67E',
    grey: '#D8D0C3',
  };

  SB.FONT = {
    body: '"LXGW WenKai", sans-serif',
    mono: '"LXGW WenKai Mono", monospace',
  };

  // ---------- math ----------

  SB.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  SB.lerp = (a, b, t) => a + (b - a) * t;
  /** 0 → 1 as t goes from start to start + dur. */
  SB.prog = (t, start, dur) => SB.clamp((t - start) / dur);

  SB.ease = {
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => {
      const c = 1.9;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
  };

  /** Scale for an element popping in at `start`: 0 → overshoot → 1. */
  SB.pop = (t, start, dur = 0.45) => SB.ease.back(SB.prog(t, start, dur));
  /** Opacity for an element shown during [start, end), with short fades. */
  SB.span = (t, start, end, fade = 0.25) =>
    Math.min(SB.prog(t, start, fade), 1 - SB.prog(t, end - fade, fade));

  // ---------- seeded randomness ----------

  SB.hash = (...nums) => {
    let h = 2166136261;
    for (const n of nums) {
      h ^= Math.round(n * 1000);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  SB.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Lines "boil" like hand-drawn animation: the jitter changes 8 times a second.
  SB.boil = 0;

  // ---------- hand-drawn shapes ----------

  function jitter(points, amp, seed) {
    const r = SB.rng(SB.hash(seed, SB.boil));
    return points.map(([x, y]) => [x + (r() - 0.5) * 2 * amp, y + (r() - 0.5) * 2 * amp]);
  }

  function tracePath(ctx, pts, closed) {
    ctx.beginPath();
    if (!closed) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      return;
    }
    const n = pts.length;
    const mid = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = mid(0);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 1; i <= n; i++) {
      const m = mid(i);
      ctx.quadraticCurveTo(pts[i % n][0], pts[i % n][1], m[0], m[1]);
    }
    ctx.closePath();
  }

  function pathLength(pts, closed) {
    let len = 0;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return len;
  }

  /** Insert points so no segment is longer than `step`, giving the jitter room to wobble. */
  function subdivide(pts, closed, step) {
    const out = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let j = 0; j < k; j++) out.push([SB.lerp(a[0], b[0], j / k), SB.lerp(a[1], b[1], j / k)]);
    }
    if (!closed) out.push(pts[pts.length - 1]);
    return out;
  }

  /**
   * Draw a wobbly path through `points`.
   * opts: fill, stroke, lw, closed, amp (jitter px), seed, shadow, draw (0..1 draw-on), alpha
   */
  SB.shape = (ctx, points, opts = {}) => {
    const { fill = null, stroke = SB.C.ink, lw = 4, closed = true, amp = 1.6, seed = 1, shadow = false, draw = 1 } = opts;
    if (draw <= 0) return;
    const pts = jitter(subdivide(points, closed, 50), amp, seed);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    if (shadow && closed) {
      ctx.save();
      ctx.translate(7, 9);
      tracePath(ctx, pts, true);
      ctx.fillStyle = 'rgba(43,42,51,0.13)';
      ctx.fill();
      ctx.restore();
    }
    if (fill && closed) {
      tracePath(ctx, jitter(pts, amp * 0.8, seed + 7), true);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && lw > 0) {
      tracePath(ctx, pts, closed);
      if (draw < 1) {
        const len = pathLength(pts, closed) * 1.05;
        ctx.setLineDash([len, len]);
        ctx.lineDashOffset = len * (1 - draw);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.restore();
  };

  function roundRectPoints(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    const pts = [];
    const corner = (cx, cy, a0) => {
      for (let i = 0; i <= 4; i++) {
        const a = a0 + (i / 4) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    };
    corner(x + w - r, y + r, -Math.PI / 2);
    corner(x + w - r, y + h - r, 0);
    corner(x + r, y + h - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    return pts;
  }

  SB.rect = (ctx, x, y, w, h, opts = {}) =>
    SB.shape(ctx, roundRectPoints(x, y, w, h, opts.r ?? 18), { seed: SB.hash(w, h), ...opts });

  SB.ellipse = (ctx, cx, cy, rx, ry, opts = {}) => {
    const n = Math.max(16, Math.round((rx + ry) / 6));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    SB.shape(ctx, pts, { seed: SB.hash(rx, ry), amp: 1.2, ...opts });
  };

  SB.circle = (ctx, cx, cy, r, opts = {}) => SB.ellipse(ctx, cx, cy, r, r, opts);

  SB.line = (ctx, x1, y1, x2, y2, opts = {}) =>
    SB.shape(ctx, [[x1, y1], [x2, y2]], { closed: false, seed: SB.hash(x2 - x1, y2 - y1), ...opts });

  /** A curved arrow from (x1,y1) to (x2,y2); `bend` pushes the middle sideways. */
  SB.arrow = (ctx, x1, y1, x2, y2, opts = {}) => {
    const { bend = 0.2, draw = 1, color = SB.C.ink, lw = 4 } = opts;
    const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
    const my = (y1 + y2) / 2 + (x2 - x1) * bend;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12;
      pts.push([
        (1 - s) * (1 - s) * x1 + 2 * (1 - s) * s * mx + s * s * x2,
        (1 - s) * (1 - s) * y1 + 2 * (1 - s) * s * my + s * s * y2,
      ]);
    }
    const seed = SB.hash(x2 - x1, y2 - y1, 3);
    SB.shape(ctx, pts, { closed: false, stroke: color, lw, draw, seed, amp: 1.2 });
    if (draw < 0.95) return;
    const a = Math.atan2(y2 - pts[10][1], x2 - pts[10][0]);
    const head = 20;
    SB.shape(
      ctx,
      [
        [x2 - Math.cos(a - 0.5) * head, y2 - Math.sin(a - 0.5) * head],
        [x2, y2],
        [x2 - Math.cos(a + 0.5) * head, y2 - Math.sin(a + 0.5) * head],
      ],
      { closed: false, stroke: color, lw, seed: seed + 1, amp: 1 },
    );
  };

  /** A highlighter swash behind text, drawn left to right. */
  SB.highlight = (ctx, x, y, w, h, opts = {}) => {
    const { color = SB.C.yellow, draw = 1 } = opts;
    if (draw <= 0) return;
    ctx.save();
    ctx.globalAlpha *= 0.55;
    SB.rect(ctx, x, y, w * draw, h, { fill: color, stroke: null, r: h / 2, amp: 2, seed: 11 });
    ctx.restore();
  };

  /** A scribbled underline that draws itself on. */
  SB.underline = (ctx, x, y, w, opts = {}) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([x + (w * i) / 8, y + Math.sin(i * 1.3) * 3]);
    SB.shape(ctx, pts, { closed: false, stroke: opts.color || SB.C.coral, lw: opts.lw || 7, draw: opts.draw ?? 1, seed: SB.hash(w, 5) });
  };

  // ---------- text ----------

  SB.setFont = (ctx, size, opts = {}) => {
    ctx.font = `${opts.bold ? 700 : 400} ${size}px ${opts.mono ? SB.FONT.mono : SB.FONT.body}`;
  };

  SB.measure = (ctx, str, size, opts = {}) => {
    SB.setFont(ctx, size, opts);
    return ctx.measureText(str).width;
  };

  /**
   * Draw text. opts: size, color, bold, mono, align, reveal (0..1 typewriter), alpha, halo (outline colour).
   * Returns the full width of the string.
   */
  SB.text = (ctx, str, x, y, opts = {}) => {
    const { size = 40, color = SB.C.ink, align = 'left', reveal = 1 } = opts;
    ctx.save();
    SB.setFont(ctx, size, opts);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    const chars = Array.from(str);
    const shown = chars.slice(0, Math.round(chars.length * SB.clamp(reveal))).join('');
    const full = ctx.measureText(str).width;
    const left = align === 'center' ? x - full / 2 : align === 'right' ? x - full : x;
    ctx.textAlign = 'left';
    if (opts.halo) {
      ctx.strokeStyle = opts.halo;
      ctx.lineWidth = size * 0.3;
      ctx.lineJoin = 'round';
      ctx.strokeText(shown, left, y);
    }
    ctx.fillText(shown, left, y);
    ctx.restore();
    return full;
  };

  /** Run `fn` with the canvas moved to (x,y), scaled by s and rotated by rot. */
  SB.at = (ctx, x, y, s, rot, fn) => {
    if (s <= 0.001) return;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(s, s);
    fn();
    ctx.restore();
  };

  // ---------- paper background ----------

  const papers = new Map();
  /** Paper texture for a w×h canvas (default: the video frame). */
  SB.paper = (ctx, w = SB.W, h = SB.H) => {
    const key = `${w}x${h}`;
    if (!papers.has(key)) {
      const paper = document.createElement('canvas');
      paper.width = w;
      paper.height = h;
      const p = paper.getContext('2d');
      p.fillStyle = SB.C.paper;
      p.fillRect(0, 0, w, h);
      const r = SB.rng(42);
      for (let i = 0; i < Math.round((9000 * w * h) / (SB.W * SB.H)); i++) {
        p.fillStyle = r() < 0.5 ? 'rgba(120,100,80,0.06)' : 'rgba(255,255,255,0.25)';
        p.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      const g = p.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(90,70,50,0.12)');
      p.fillStyle = g;
      p.fillRect(0, 0, w, h);
      papers.set(key, paper);
    }
    ctx.drawImage(papers.get(key), 0, 0);
  };
})();
