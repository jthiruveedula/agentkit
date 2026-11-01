import { useEffect, useRef } from "react";

// Caustic background ported from site/fx.js: folded-light web on a low-res 2D canvas scaled by CSS.
// Decorative (aria-hidden, no pointer events). ~30fps; one static frame under reduced motion; idle when the tab is hidden.
const MAXPX = 40000;

function web(x: number, y: number, tt: number) {
  const qx = x * 1.7 - 250, qy = y * 1.7 - 250;
  let ix = qx, iy = qy, c = 1;
  for (let n = 0; n < 4; n++) {
    const k = tt * (1 - 3.5 / (n + 1));
    ix = qx + Math.cos(k - ix) + Math.sin(k + iy);
    iy = qy + Math.sin(k - iy) + Math.cos(k + ix);
    c += 1 / Math.hypot(qx / (Math.sin(ix + k) / 0.0048), qy / (Math.cos(iy + k) / 0.0048));
  }
  c = 1.17 - Math.pow(c / 4, 1.4);
  return Math.pow(Math.abs(c), 9);
}

export function Caustic() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.("2d");   // null in jsdom / no canvas: the paper stands alone
    if (!cv || !ctx || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0, h = 0, scale = 6, img: ImageData, rgb = [0, 0, 0], maxA = 40, raf = 0, rs = 0, t = 0, last = 0, reduced = mq.matches;

    const colors = () => {
      const cs = getComputedStyle(document.documentElement);
      const hex = cs.getPropertyValue("--fx").trim();
      rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
      maxA = (parseFloat(cs.getPropertyValue("--fxa")) || 0.15) * 255;
    };
    const size = () => {
      scale = Math.max(6, Math.ceil(innerWidth / 320));
      if (innerWidth < 768) scale = Math.max(scale, 8);
      while (Math.ceil(innerWidth / scale) * Math.ceil(innerHeight / scale) > MAXPX) scale++;
      w = Math.max(24, Math.ceil(innerWidth / scale)); h = Math.max(24, Math.ceil(innerHeight / scale));
      cv.width = w; cv.height = h;
      img = ctx.createImageData(w, h);
    };
    const frame = () => {
      const d = img.data;
      for (let j = 0, p = 0; j < h; j++) {
        for (let i = 0; i < w; i++, p += 4) {
          const v = Math.min(1, Math.max(0, web(i / 9, j / 9, t * 0.42 + 23)));
          d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = v * maxA;
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 33) return;
      t += Math.min(ts - last, 100) / 1000; last = ts;
      frame();
    };
    const run = () => {
      cancelAnimationFrame(raf); raf = 0;
      if (reduced || document.hidden) return frame();
      last = performance.now(); raf = requestAnimationFrame(loop);
    };
    const onResize = () => { if (!rs) rs = requestAnimationFrame(() => { rs = 0; size(); frame(); }); };
    const onMotion = (e: MediaQueryListEvent) => { reduced = e.matches; run(); };
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", run);
    mq.addEventListener("change", onMotion);
    colors(); size(); run();
    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(rs);
      removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", run);
      mq.removeEventListener("change", onMotion);
    };
  }, []);
  return <canvas ref={ref} className="caustic" aria-hidden="true" />;
}
