// agentkit field manual. One scroll engine: write --p per stage, CSS does the rest.
// The request dot (#baton) hops between real content anchors by scroll position.
(() => {
'use strict';

const CLONE = 'git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit && cd ~/agentkit && ';
const CHANNELS = [
  CLONE + './install.sh',
  'git clone https://github.com/jthiruveedula/agentkit.git $HOME\\agentkit\ncd $HOME\\agentkit; .\\install.ps1',
  'npx github:jthiruveedula/agentkit',
  'uvx --from git+https://github.com/jthiruveedula/agentkit agentkit',
  CLONE + 'make install',
];
const SPOTLIGHT = 'ext-meta-muse';

const $ = id => document.getElementById(id);
const all = s => [...document.querySelectorAll(s)];
const clamp = x => Math.min(1, Math.max(0, x));
const root = document.documentElement;
const q = new URLSearchParams(location.search), tp = q.get('tempo');
const tempo = +{ calm: .6, live: 1, overdrive: 1.6 }[tp] || 1;
const acc = { proof: '#D1242F', ink: 'var(--ink)' }[q.get('accent')];
if (typeof acc === 'string') root.style.setProperty('--reg', acc);
root.style.setProperty('--tempo', tp === 'still' ? 0 : tempo);
if (q.get('hud') === '0') $('tb').hidden = true;
const mq = matchMedia('(prefers-reduced-motion: reduce)');
// small, short or zoomed viewports get the flat manual (the pinned plates need the room)
const film = () => !mq.matches && tp !== 'still' && innerWidth >= 900 && innerHeight >= 560;
const mo = film(), w0 = innerWidth;
mq.addEventListener('change', () => location.reload());
if (mo) root.classList.add('mo');
function set(el, k, v) {
  const c = el._c || (el._c = {});
  v = String(v);
  if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); }
}
function txt(el, s) { s = String(s); if (el._t !== s) { el._t = s; el.textContent = s; } }
function mk(tag, parent, text, cls) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}
function reel(host, n, dot) {
  host.textContent = '';
  const r = [];
  for (let k = 0; k < n; k++) {
    if (dot && k === n - 1) mk('span', host, '.');
    const s = mk('b', mk('span', host, null, 'rl'));
    for (let d = 0; d < 11; d++) mk('i', s, d % 10);
    r.push(s);
  }
  return r;
}
const spin = (r, n) => r.forEach((s, k) => {
  const p = r.length - 1 - k;
  set(s, '--v', (Math.floor(n / 10 ** p) % 10 + (p ? Math.max(0, (n / 10 ** (p - 1)) % 10 - 9) : n % 1)).toFixed(2));
});

const S = { total: 0, ap: 0, au: null, cu: 0, reel: null };
const ST = all('.stage').map(el => ({ el, t: 0, h: 0, p: 0 }));
const T = all('.term').map(t => [t.lastElementChild, +t.style.getPropertyValue('--s'), +t.style.getPropertyValue('--d')]);
const slips = $('slips'), baton = $('baton'), plates = all('#plates a'), ro = $('readout');
const cnt = reel($('cnt'), 2);
let vh = 0, dh = 0, W = [], Q = [], CP = [0, 0], N4 = [0, 0, 0], raf = 0, cur = -1, ty = 0;
function c(el) {
  let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
  for (let e = el; e && !e.classList.contains('frame'); e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return [x, y];
}
const P = v => () => v;
const fix = el => P(c(el));
// scroll distance behind a stage's --p
const sp = s => Math.max(vh * .5, s.h - vh);

function layout() {
  vh = innerHeight;
  dh = root.scrollHeight;
  ST.forEach(s => { s.t = s.el.getBoundingClientRect().top + scrollY; s.h = s.el.offsetHeight; });
  W = [];
  if (mo) {
    // pinned stages: frame coords are viewport coords. Others scroll, so subtract the scroll at the waypoint.
    const a = (i, f, pt) => {
      const y = ST[i].t + f * sp(ST[i]), off = ST[i].el.classList.contains('pin') ? 0 : y;
      W.push([y, () => { const p = pt(); return [p[0], p[1] - off]; }]);
    };
    const first = slips.firstElementChild || $('cnt'), spot = slips.querySelector('.sp') || first;
    const scale = $('scale'), sc = c(scale), cmd = $('cmd'), cw = cmd.offsetWidth, cm = c(cmd);
    N4 = [sc[0] - scale.offsetWidth / 2, sc[1] - scale.offsetHeight / 2 + 1, scale.offsetWidth];
    const needle = () => [N4[0] + N4[2] * S.ap / 100, N4[1]];
    const n38 = c($('n38'));
    a(0, 0, P([cm[0] - cw / 2 - 18, cm[1]])); a(0, 1, P([n38[0], n38[1] + vh * .06])); // .big drifts 6vh by p=1
    a(1, .08, fix($('cnt'))); a(1, .45, fix(first)); a(1, .92, fix(spot));
    a(2, .05, fix(document.querySelector('.fm')));
    all('.term').forEach((t, i) => a(2, .3 + i * .2, fix(t)));
    const o = $('org'), oc = c(o), ow = o.offsetWidth, oh = o.offsetHeight;
    const ob = (x, y) => P([oc[0] - ow / 2 + x * ow / 100, oc[1] - oh / 2 + y * oh / 62]);
    Q = [document.querySelector('.orch'), ...all('.ag:not(.orch)'), $('res')];
    Q.forEach((e, i) => {
      const f = .06 + .86 * i / 12;
      [0, .02].forEach(d => a(3, f + d, fix(e)));
      if (i === 11 && o.firstElementChild.getClientRects().length) { a(3, f + .035, ob(75, 61)); a(3, f + .05, ob(91.67, 61)); }
    });
    a(4, 0, needle); a(4, 1, needle);
    CP = c($('caret'));
    const ly = dh - vh; // rest = bottom of the page, where the caret is
    W.push([ly, () => [CP[0], CP[1] - ly]]);
  }
  tick();
}

function tick() {
  raf = 0;
  const y = scrollY, max = Math.max(1, dh - vh);
  if (mo) {
    ST.forEach(s => { s.p = clamp((y - s.t) / sp(s)); set(s.el, '--p', s.p.toFixed(3)); });
    spin(cnt, S.total * clamp((ST[1].p - .04) / .67));
    T.forEach(([b, s, d]) => txt(b, ST[2].p > s + d ? 'LINKED' : 'QUEUED'));
    const p3 = ST[3].p, n = p3 > 0 && p3 < 1 ? Math.round(clamp((p3 - .06) / .86) * 12) : -1;
    Q.forEach((e, k) => e.classList.toggle('cur', k === n && k < 12));
    $('res').classList.toggle('hit', p3 >= .92);
    slips.classList.toggle('live', ST[1].p > Math.min(.95, .24 + .0125 * (slips.children.length - 1)));
    if (W.length > 1) {
      let i = 0;
      while (i < W.length - 2 && y >= W[i + 1][0]) i++;
      const t = clamp((y - W[i][0]) / Math.max(1, W[i + 1][0] - W[i][0]));
      const p = W[i][1](), q = W[i + 1][1]();
      set(baton, 'transform', `translate3d(${(p[0] + (q[0] - p[0]) * t).toFixed(1)}px,${(p[1] + (q[1] - p[1]) * t).toFixed(1)}px,0)`);
      const rest = y >= W[W.length - 1][0] - 2;
      baton.classList.toggle('rest', rest);
      root.classList.toggle('br', rest);
    }
    set(root, '--fin', y >= max - 4 ? 1 : 0);
  }
  let k = 0;
  ST.forEach((s, i) => { if (s.t <= y + vh * .5) k = i; });
  if (k !== cur) {
    plates.forEach((a, i) => a.setAttribute('aria-current', i === k));
    txt($('tsh'), k + 1);
    cur = k;
  }
  txt($('tsp'), Math.round(100 * Math.min(1, y / max)));
}
const kick = () => { raf = raf || (document.hidden ? 0 : requestAnimationFrame(tick)); };
addEventListener('scroll', kick, { passive: true });
document.addEventListener('visibilitychange', () => document.hidden || kick());
addEventListener('resize', () => film() !== mo && innerWidth !== w0 ? location.reload() : requestAnimationFrame(layout));
addEventListener('load', layout);
if (document.fonts) document.fonts.ready.then(layout);
fetch('assets/skills.json').then(r => r.json()).then(d => {
  const list = (d.skills || []).sort((a, b) => a.name < b.name ? -1 : 1);
  S.total = d.count || list.length;
  ['g38', 'n38', 'tsk'].forEach(id => txt($(id), S.total));
  list.forEach((s, i) => {
    const li = mk('li', slips, null, s.kind === 'native' ? '' : 'x'), b = mk('button', li, s.name);
    b.type = 'button';
    b.setAttribute('aria-label', s.name + ', ' + s.kind);
    b.dataset.d = (s.description || '').split('. ')[0];
    li.style.setProperty('--i', i);
    if (s.name === SPOTLIGHT) { li.className += ' sp'; li.append($('sp').content.cloneNode(true)); }
  });
  if (!mo) spin(cnt, S.total);
  layout();
}).catch(() => {
  txt($('tsk'), 'n/a');
  ro.children[0].textContent = 'Skill catalog unavailable.';
  ro.dataset.e = 1;
  ro.classList.add('on');
});
txt($('tag'), all('.ag').length);
function loadAudit() {
  fetch('assets/audit.json').then(r => r.json()).then(d => {
    S.au = d;
    const cu = d.current, base = (d.baseline && d.baseline.scores) || {}, aps = $('aps');
    aps.textContent = '';
    const host = mk('span', aps);
    host.setAttribute('aria-hidden', 'true');
    S.reel = reel(host, 3, true);
    mk('span', aps, cu.scores.APS, 'vh');
    $('apsbt').hidden = cu.scores.APS >= cu.targets.APS;
    set(document.querySelector('.vn'), 'left', cu.targets.APS + '%');
    $('nd').hidden = false;
    set($('b0'), 'left', (base.APS || 0) + '%');
    all('.rows li').forEach(li => {
      const k = li.dataset.k, v = cu.scores[k], t = cu.targets[k];
      set(li.querySelector('.bar i'), '--v', v);
      set(li.querySelector('.bar u'), 'left', t + '%');
      li.querySelector('.bt').hidden = v >= t;
    });
    txt($('ptk'), cu.tokens.total.toLocaleString('en-US'));
    txt($('psh'), d.sha);
    txt($('trv'), d.sha);
    txt($('tag'), cu.counts.agents);
    layout();
    climb();
  }).catch(() => {});
}
function paint(g) {
  const cu = S.au.current, b = (S.au.baseline.scores || {}).APS || 0, gr = Math.min(g, 1);
  S.ap = b + (cu.scores.APS - b) * g;
  set($('nd'), 'left', S.ap + '%');
  spin(S.reel, Math.round(Math.min(S.ap, cu.scores.APS) * 10));
  set($('proof'), '--g', gr);
  all('.rows li').forEach(li => txt(li.querySelector('.v'), +(cu.scores[li.dataset.k] * gr).toFixed(1)));
  kick();
}
function climb() {
  if (!S.au || S.cu || (mo && scrollY < ST[4].t - vh * .6)) return;
  S.cu = 1;
  if (!mo) return paint(1);
  let el = 0, last = performance.now();
  const f = now => {
    el += Math.min(now - last, 50); // hidden tab pauses the clock
    last = now;
    const t = Math.min(1, el * tempo / 1400), u = t - 1;
    paint(1 + 1.74 * u * u * u + .74 * u * u);
    if (t < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); loadAudit(); } }, { rootMargin: '150%' }).observe($('proof'));
} else loadAudit();
addEventListener('scroll', climb, { passive: true });
const mn = document.querySelector('main');
function hide() { if (ro.dataset.e) return; all('main .on').forEach(b => b.classList.remove('on')); ro.classList.remove('on'); }
['pointerover', 'focusin', 'click'].forEach(ev => mn.addEventListener(ev, e => {
  const b = e.target.closest('[data-d]');
  hide();
  if (!b || ro.dataset.e) return;
  b.classList.add('on');
  ro.children[0].textContent = b.textContent.toLowerCase();
  ro.children[1].textContent = b.dataset.d;
  ro.children[2].textContent = b.dataset.t ? 'tools: ' + b.dataset.t : '';
  ro.classList.add('on');
}));
['pointerleave', 'focusout'].forEach(ev => mn.addEventListener(ev, hide));
function type(cmd) {
  cancelAnimationFrame(ty);
  const t0 = performance.now(), f = now => {
    const n = mo ? Math.min(cmd.length, (now - t0) * .055 * tempo | 0) : cmd.length;
    txt($('typed'), cmd.slice(0, n));
    CP = c($('caret'));
    if (mo) tick();
    if (n < cmd.length) ty = requestAnimationFrame(f); else layout();
  };
  f(t0);
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const tabs = [...b.parentNode.children], cmd = CHANNELS[tabs.indexOf(b)];
  tabs.forEach(t => t.setAttribute('aria-pressed', t === b));
  $('full').textContent = cmd;
  $('cpy').dataset.cmd = cmd;
  type(cmd);
});
document.addEventListener('click', e => {
  const b = e.target.closest('.cp');
  if (!b) return;
  const lb = b.querySelector('.lb'), old = lb && lb.textContent;
  const done = ok => {
    $('status').textContent = ok ? 'Copied' : 'Copy failed. Select the command text instead.';
    if (!ok) return;
    if (lb) lb.textContent = 'COPIED';
    b.classList.add('ok');
    setTimeout(() => { b.classList.remove('ok'); if (lb) lb.textContent = old; }, 1600);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.cmd).then(() => done(true), () => done(false));
  else done(false);
});
})();
