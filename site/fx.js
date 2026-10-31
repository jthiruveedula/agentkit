// Caustic background: sun through moving water, drawn on a 2D canvas at ~1/6 resolution and
// scaled up by CSS (soft by design). Decorative: aria-hidden, pointer-events none.
// Static single frame under prefers-reduced-motion; pausable with #fxpause; stops when the tab is hidden.
(() => {
  const cv = document.getElementById('fx');
  const ctx = cv && cv.getContext && cv.getContext('2d');
  if (!ctx) return; // no canvas: the paper background stands alone
  const btn = document.getElementById('fxpause');
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const MAXPX = 40000, ripples = [];
  let SCALE = 6;
  let w, h, img, rgb, maxA, raf = 0, paused = mq.matches, t = 0, last = 0;

  function theme() {
    const cs = getComputedStyle(document.documentElement);
    const hex = cs.getPropertyValue('--fx').trim();
    rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
    maxA = (parseFloat(cs.getPropertyValue('--fxa')) || .15) * 255;
  }
  function size() {
    // adaptive: coarser on narrow/touch screens, and never more than MAXPX canvas pixels
    SCALE = Math.max(6, Math.ceil(innerWidth / 320));
    if (innerWidth < 768 || matchMedia('(pointer: coarse)').matches) SCALE = Math.max(SCALE, 8);
    while (Math.ceil(innerWidth / SCALE) * Math.ceil(innerHeight / SCALE) > MAXPX) SCALE++;
    w = Math.max(24, Math.ceil(innerWidth / SCALE));
    h = Math.max(24, Math.ceil(innerHeight / SCALE));
    cv.width = w; cv.height = h;
    img = ctx.createImageData(w, h);
  }
  // folded-light web (iterated sine warp), brightest where folds cross
  function web(x, y, tt) {
    const qx = x * 1.7 - 250, qy = y * 1.7 - 250;
    let ix = qx, iy = qy, c = 1;
    for (let n = 0; n < 4; n++) {
      const k = tt * (1 - 3.5 / (n + 1));
      ix = qx + Math.cos(k - ix) + Math.sin(k + iy);
      iy = qy + Math.sin(k - iy) + Math.cos(k + ix);
      c += 1 / Math.hypot(qx / (Math.sin(ix + k) / .0048), qy / (Math.cos(iy + k) / .0048));
    }
    c = 1.17 - Math.pow(c / 4, 1.4);
    return Math.pow(Math.abs(c), 9);
  }
  function frame() {
    const d = img.data, now = performance.now() / 1000;
    for (let j = 0, p = 0; j < h; j++) {
      for (let i = 0; i < w; i++, p += 4) {
        let v = web(i / 9, j / 9, t * .42 + 23);
        for (const r of ripples) { // pointer ripple: a ring that runs out and fades
          const age = now - r.t, dd = Math.hypot(i * SCALE - r.x, j * SCALE - r.y), f = dd - age * 210;
          v += .5 * Math.sin(f * .07) * Math.exp(-f * f / 12000 - age * .9 - dd / 700);
        }
        v = Math.min(1, Math.max(0, v));
        d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = v * maxA;
      }
    }
    ctx.putImageData(img, 0, 0);
    while (ripples.length && now - ripples[0].t > 3.5) ripples.shift();
  }
  function loop(ts) {
    raf = 0;
    if (paused) return;
    raf = requestAnimationFrame(loop);
    if (ts - last < 33) return; // ~30fps cap: the effect is slow and the frame is CPU-drawn
    t += Math.min(ts - last, 100) / 1000; last = ts;
    frame();
  }
  function run() {
    cancelAnimationFrame(raf); raf = 0;
    if (paused || document.hidden) return frame();
    last = performance.now(); raf = requestAnimationFrame(loop);
  }
  function set(p) {
    paused = p;
    if (btn) btn.setAttribute('aria-pressed', p); // fixed label; aria-pressed carries the state
    run();
  }
  let rs = 0;
  addEventListener('resize', () => { // one resize per frame
    if (!rs) rs = requestAnimationFrame(() => { rs = 0; size(); frame(); });
  });
  new MutationObserver(() => { theme(); frame(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', run);
  mq.addEventListener('change', e => set(e.matches));
  addEventListener('pointerdown', e => { if (!paused && ripples.length < 4) ripples.push({ x: e.clientX, y: e.clientY, t: performance.now() / 1000 }); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { theme(); frame(); });
  if (btn) { btn.hidden = false; btn.addEventListener('click', () => set(!paused)); }
  theme(); size(); set(paused);
})();
