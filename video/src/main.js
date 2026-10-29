// Timeline: lays the scenes end to end, draws transitions, and exposes
// window.VIDEO for render.mjs. Opened directly, index.html becomes a small player.
(function () {
  const SB = window.SB;
  const TRANSITION = 0.35; // seconds on each side of a cut

  let start = 0;
  const timeline = SB.scenes.map((s) => {
    const item = { ...s, start, end: start + s.dur };
    start += s.dur;
    return item;
  });
  const duration = start;

  const cues = [];
  timeline.forEach((s, i) => {
    for (const [t, type] of s.cues || []) cues.push({ t: s.start + t, type });
    if (i < timeline.length - 1) cues.push({ t: s.end - TRANSITION, type: 'whoosh' });
  });
  cues.sort((a, b) => a.t - b.t);

  const canvas = document.getElementById('stage');
  canvas.width = SB.W;
  canvas.height = SB.H;
  const ctx = canvas.getContext('2d');

  /** A hand-drawn colour blob covering the screen from (x, y); p = 0 → nothing, 1 → full. */
  function blob(out, p) {
    if (p <= 0) return;
    const far = Math.max(
      ...[[0, 0], [SB.W, 0], [0, SB.H], [SB.W, SB.H]].map(([x, y]) => Math.hypot(x - out.x, y - out.y)),
    );
    const r = p * (far + 80);
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const rr = r * (1 + 0.06 * Math.sin(a * 5 + p * 4));
      pts.push([out.x + Math.cos(a) * rr, out.y + Math.sin(a) * rr]);
    }
    SB.shape(ctx, pts, { fill: out.color, lw: 8, amp: 3, seed: 900 });
  }

  function renderFrame(t) {
    t = SB.clamp(t, 0, duration - 1e-6);
    SB.boil = Math.floor(t * 8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    SB.paper(ctx);

    const i = timeline.findIndex((s) => t < s.end);
    const scene = timeline[i];
    const local = t - scene.start;
    ctx.save();
    scene.draw(ctx, local);
    ctx.restore();

    if (i < timeline.length - 1 && t > scene.end - TRANSITION) {
      blob(scene.out, SB.ease.in((t - (scene.end - TRANSITION)) / TRANSITION));
    } else if (i > 0 && local < TRANSITION) {
      blob(timeline[i - 1].out, 1 - SB.ease.out(local / TRANSITION));
    }
  }

  async function loadFonts() {
    const sample = '第二大脑 Aa1';
    await Promise.all([
      document.fonts.load(`400 40px ${SB.FONT.body}`, sample),
      document.fonts.load(`700 40px ${SB.FONT.body}`, sample),
      document.fonts.load(`400 40px ${SB.FONT.mono}`, sample),
    ]);
    await document.fonts.ready;
  }

  window.VIDEO = {
    width: SB.W,
    height: SB.H,
    fps: SB.FPS,
    duration,
    cues,
    scenes: timeline.map(({ id, start, end }) => ({ id, start, end })),
    ready: loadFonts().then(() => true),
    /** Draw time t and return the frame as a PNG data URL. */
    frame(t) {
      renderFrame(t);
      return canvas.toDataURL('image/png');
    },
    covers: SB.covers.map(({ id, w, h }) => ({ id, w, h })),
    /** Draw a still from covers.js and return it as a PNG data URL. */
    cover(id) {
      const c = SB.covers.find((x) => x.id === id);
      canvas.width = c.w;
      canvas.height = c.h;
      SB.boil = 0;
      SB.paper(ctx, c.w, c.h);
      c.draw(ctx, c.w, c.h);
      const url = canvas.toDataURL('image/png');
      canvas.width = SB.W;
      canvas.height = SB.H;
      return url;
    },
  };

  if (new URLSearchParams(location.search).has('render')) {
    document.body.classList.add('render');
    return;
  }

  // ---------- preview player ----------

  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const seek = $('seek');
  seek.max = duration;
  let playing = false;
  let clock = 0;
  let last = 0;
  let audioOk = false;
  audio.addEventListener('canplay', () => (audioOk = true));

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function show(t) {
    clock = t;
    renderFrame(t);
    seek.value = t;
    $('time').textContent = `${fmt(t)} / ${fmt(duration)}`;
  }
  function setPlaying(on) {
    playing = on;
    $('play').textContent = on ? '暂停' : '播放';
    if (audioOk) {
      audio.currentTime = clock;
      if (on) audio.play().catch(() => (audioOk = false));
      else audio.pause();
    }
    last = performance.now();
  }
  function tick(now) {
    if (playing) {
      const t = audioOk && !audio.paused ? audio.currentTime : clock + (now - last) / 1000;
      last = now;
      if (t >= duration) {
        show(duration);
        setPlaying(false);
      } else show(t);
    }
    requestAnimationFrame(tick);
  }

  $('play').onclick = () => {
    if (clock >= duration - 0.05) clock = 0;
    setPlaying(!playing);
  };
  seek.oninput = () => {
    show(Number(seek.value));
    if (audioOk) audio.currentTime = clock;
  };
  const chapters = $('chapters');
  timeline.forEach((s) => {
    const b = document.createElement('button');
    b.textContent = s.id;
    b.onclick = () => {
      show(s.start + 0.4);
      if (audioOk) audio.currentTime = clock;
    };
    chapters.appendChild(b);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      $('play').click();
    }
  });

  window.VIDEO.ready.then(() => {
    show(0);
    requestAnimationFrame(tick);
  });
})();
