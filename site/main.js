// The mascot from the promo video (video/src), alive on the page: it follows
// the pointer with its eyes and waves when poked. Plus copy buttons.
(function () {
  const SB = window.SB;
  const canvas = document.getElementById('mascot');
  const ctx = canvas.getContext('2d');
  const SIZE = 360;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let look = [0, 0];
  let pokedAt = -10;
  const t0 = performance.now();

  function draw(now) {
    const t = (now - t0) / 1000;
    SB.boil = Math.floor(t * 8);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    const poked = t - pokedAt < 1.6;
    const hop = poked ? Math.abs(Math.sin((t - pokedAt) * 7)) * 14 * (1 - (t - pokedAt) / 1.6) : 0;
    SB.at(ctx, SIZE / 2, SIZE / 2 - 20 - hop, 1, 0, () =>
      SB.brain(ctx, 110, { t, mood: poked ? 'joy' : 'happy', look, wave: poked ? 1 : 0 }),
    );
    if (!still) requestAnimationFrame(draw);
  }

  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.max(1, Math.hypot(dx, dy));
    look = [dx / d, dy / d];
    if (still) draw(performance.now());
  });
  canvas.addEventListener('click', () => {
    pokedAt = (performance.now() - t0) / 1000;
    if (still) draw(performance.now());
  });
  draw(performance.now());

  document.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.previousElementSibling.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '已复制';
      } catch {
        btn.textContent = '请手动复制';
      }
      setTimeout(() => (btn.textContent = '复制'), 1600);
    });
  });
})();
