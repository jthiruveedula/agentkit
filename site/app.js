(() => {
const CLONE = 'git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit && cd ~/agentkit && ';
const CHANNELS = [
  CLONE + './install.sh',
  'git clone https://github.com/jthiruveedula/agentkit.git $HOME\\agentkit\ncd $HOME\\agentkit; .\\install.ps1',
  'npx github:jthiruveedula/agentkit',
  'uvx --from git+https://github.com/jthiruveedula/agentkit agentkit',
  CLONE + 'make install',
];

const $ = id => document.getElementById(id);
const all = s => [...document.querySelectorAll(s)];
const clamp = x => Math.min(1, Math.max(0, x));
const root = document.documentElement;
const tp = new URLSearchParams(location.search).get('tempo');
const tempo = +{ calm: .6, overdrive: 1.6 }[tp] || 1;
root.style.setProperty('--tempo', tp === 'still' ? 0 : tempo);
const mq = matchMedia('(prefers-reduced-motion: reduce)');
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

const S = { total: 0, ap: 0 };
const ST = all('.stage').map(el => ({ el }));
const T = all('.term').map(t => [t.lastElementChild, +t.style.getPropertyValue('--s'), +t.style.getPropertyValue('--d')]);
const slips = $('slips'), baton = $('baton'), plates = all('#plates a'), ro = $('readout');
const cnt = reel($('cnt'), 2);
let vh, dh, W = [], Q = [], CP, N4, raf, cur = -1, ty;
function c(el) {
  let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
  for (let e = el; e && !e.classList.contains('frame'); e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return [x, y];
}
const P = v => () => v;
const fix = el => P(c(el));
const svg = (el, vb) => { const m = c(el), w = el.offsetWidth, h = el.offsetHeight; return (x, y) => P([m[0] - w / 2 + x * w / 100, m[1] - h / 2 + y * h / vb]); };
const sp = s => Math.max(vh * .5, s.h - vh);

function layout() {
  vh = innerHeight;
  dh = root.scrollHeight;
  ST.forEach(s => { s.t = s.el.offsetTop; s.h = s.el.offsetHeight; });
  W = [];
  if (mo) {
    const a = (i, f, pt) => {
      W.push([ST[i].t + f * sp(ST[i]), pt]);
    };
    const first = slips.firstElementChild || $('cnt'), spot = slips.querySelector('.sp') || first;
    const scale = $('scale'), sc = c(scale), cmd = $('cmd'), cw = cmd.offsetWidth, cm = c(cmd);
    N4 = [sc[0] - scale.offsetWidth / 2, sc[1] - scale.offsetHeight / 2 + 1, scale.offsetWidth];
    const needle = () => [N4[0] + N4[2] * S.ap / 100, N4[1]];
    const n38 = c($('n38'));
    a(0, 0, P([cm[0] - cw / 2 - 18, cm[1]])); a(0, 1, P([n38[0], n38[1] + vh * .06]));
    const pc = c(slips), fs = fix(spot);
    [...slips.children].forEach(li => { const x = c(li); set(li, '--dx', pc[0] - x[0]); set(li, '--dy', pc[1] - x[1]); });
    a(1, .08, fix($('cnt'))); a(1, .2, fix(first)); [.62, .92].forEach(f => a(1, f, fs));
    a(2, .05, fix(document.querySelector('.fm')));
    const ws = svg($('wire'), 100);
    all('.wire polyline').forEach((pl, i) => {
      const pt = Array.from(pl.points), [, s, d] = T[i], sq = T[i + 1] ? pt.concat(pt.slice(0, -1).reverse()) : pt;
      let D = 0;
      const cm = sq.map((v, k) => D += k && Math.hypot(v.x - sq[k - 1].x, v.y - sq[k - 1].y));
      sq.forEach((v, k) => a(2, s + d * cm[k] * (T[i + 1] ? 2 : 1) / D, ws(v.x, v.y)));
    });
    const o = $('org'), ob = svg(o, 62);
    Q = [document.querySelector('.orch'), ...all('.ag:not(.orch)'), $('res')];
    Q.forEach((e, i) => {
      const f = .06 + .86 * i / 12;
      [0, .02].forEach(d => a(3, f + d, fix(e)));
      if (i === 11 && o.firstElementChild.getClientRects().length) { a(3, f + .035, ob(75, 61)); a(3, f + .05, ob(91.67, 61)); }
    });
    a(4, 0, needle); a(4, 1, needle);
    CP = c($('caret'));
    const ly = dh - vh;
    W.push([ly, () => [CP[0], CP[1] + ST[5].t - ly]]);
  }
  tick();
}

function tick() {
  raf = 0;
  climb();
  const y = scrollY, max = dh - vh;
  if (mo) {
    const A = ST.map(s => clamp((y - s.t + vh) / vh));
    ST.forEach((s, i) => {
      const o = A[i + 1] || 0;
      s.p = clamp((y - s.t) / sp(s));
      set(s.el, '--p', s.p); set(s.el, '--q', A[i]); set(s.el, '--o', o);
      s.el.classList.toggle('tr', A[i] % 1 + o % 1 > 0);
    });
    spin(cnt, S.total * clamp((ST[1].p - .15) / .45));
    T.forEach(([b, s, d]) => txt(b, ST[2].p > s + d ? 'LINKED' : 'QUEUED'));
    const p3 = ST[3].p, n = p3 > 0 && p3 < 1 ? Math.round(clamp((p3 - .06) / .86) * 12) : -1;
    Q.forEach((e, k) => e.classList.toggle('cur', k === n && k < 12));
    $('res').classList.toggle('hit', p3 >= .92);
    slips.classList.toggle('live', ST[1].p > .62);
    let i = 0;
    while (i < W.length - 2 && y >= W[i + 1][0]) i++;
    const t = clamp((y - W[i][0]) / Math.max(1, W[i + 1][0] - W[i][0])), p = W[i][1](), q = W[i + 1][1](), rest = y >= W[W.length - 1][0] - 2;
    set(baton, 'transform', `translate3d(${p[0] + (q[0] - p[0]) * t}px,${p[1] + (q[1] - p[1]) * t}px,0)`);
    baton.classList.toggle('rest', rest);
    root.classList.toggle('br', rest);
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
const kick = () => { raf = raf || vh && requestAnimationFrame(tick); };
addEventListener('scroll', kick, { passive: true });
addEventListener('resize', () => film() !== mo && innerWidth !== w0 ? location.reload() : requestAnimationFrame(layout));
addEventListener('load', layout);
document.fonts.ready.then(layout);
// Failed fetch: show a visible role=alert box with a retry button (shared by both loaders).
const fail = (id, run) => {
  const box = $(id);
  box.hidden = false;
  box.querySelector('button').onclick = () => { box.hidden = true; run(); };
  layout();
};
function loadSkills() {
fetch('assets/skills.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => {
  slips.textContent = '';
  const list = d.skills.sort((a, b) => a.name < b.name ? -1 : 1);
  S.total = d.count;
  ['g38', 'n38', 'tsk'].forEach(id => txt($(id), S.total));
  list.forEach((s, i) => {
    const li = mk('li', slips, null, s.kind === 'native' ? '' : 'x'), b = mk('button', li, s.name);
    b.type = 'button';
    b.setAttribute('aria-label', s.name + ', ' + s.kind);
    b.dataset.d = (s.description || '').split('. ')[0];
    li.style.setProperty('--i', i);
    if (s.name === 'ext-meta-muse') { li.className += ' sp'; li.append($('sp').content.cloneNode(true)); }
  });
  if (!mo) spin(cnt, S.total);
  layout();
}).catch(() => { txt($('tsk'), 'n/a'); fail('skerr', loadSkills); });
}
loadSkills();
txt($('tag'), all('.ag').length);
function loadAudit() {
  fetch('assets/audit.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => {
    S.au = d;
    const cu = d.current, aps = $('aps');
    aps.textContent = '';
    const host = mk('span', aps);
    host.setAttribute('aria-hidden', 'true');
    S.reel = reel(host, 3, true);
    mk('span', aps, cu.scores.APS, 'vh');
    $('apsbt').hidden = cu.scores.APS >= cu.targets.APS;
    set(document.querySelector('.vn'), 'left', cu.targets.APS + '%');
    $('nd').hidden = false;
    set($('b0'), 'left', d.baseline.scores.APS + '%');
    all('.rows li').forEach(li => {
      const k = li.dataset.k, v = cu.scores[k], t = cu.targets[k];
      set(li.querySelector('.bar i'), '--v', v);
      set(li.querySelector('.bar u'), 'left', t + '%');
      li.querySelector('.bt').hidden = v >= t;
    });
    txt($('ptk'), cu.tokens.total.toLocaleString('en-US'));
    ['psh', 'trv'].forEach(id => txt($(id), d.sha));
    txt($('tag'), cu.counts.agents);
    scoreTable(cu, d.baseline.scores, d.sha);
    layout();
  }).catch(() => fail('auerr', loadAudit));
}
// Visually hidden table: text alternative for the bars (the visual rows are aria-hidden).
function scoreTable(cu, base, sha) {
  const t = mk('table', $('proof'), null, 'vh');
  mk('caption', t, 'Agent Productivity Score by axis, at ' + sha);
  const h = mk('tr', mk('thead', t));
  ['Axis', 'Score', 'Target', 'Baseline'].forEach(x => mk('th', h, x).scope = 'col');
  const b = mk('tbody', t);
  ['APS', 'PEI', 'OVS', 'CRI', 'MNSS', 'SRS'].forEach(k => {
    const r = mk('tr', b);
    mk('th', r, k).scope = 'row';
    [cu.scores[k], cu.targets[k], base[k]].forEach(v => mk('td', r, v));
  });
}
new IntersectionObserver((es, o) => {
  if (!es[0].isIntersecting) return;
  o.disconnect();
  loadAudit();
}, { rootMargin: '150%' }).observe($('proof'));
function paint(g) {
  const cu = S.au.current, b = S.au.baseline.scores.APS, gr = Math.min(g, 1);
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
    el += Math.min(now - last, 50);
    last = now;
    const t = Math.min(1, el * tempo / 1400), u = t - 1;
    paint(1 + 1.74 * u * u * u + .74 * u * u);
    if (t < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
const mn = document.querySelector('main');
let rt = 0;
function hide() { clearTimeout(rt); all('main .on').forEach(b => b.classList.remove('on')); ro.classList.remove('on'); }
function show(t) {
  const b = t.closest('[data-d]');
  hide();
  if (!b) return;
  b.classList.add('on');
  [b.textContent.toLowerCase(), b.dataset.d, b.dataset.t ? 'tools: ' + b.dataset.t : ''].forEach((v, i) => txt(ro.children[i], v));
  ro.classList.add('on');
}
['pointerover', 'focusin', 'click'].forEach(ev => mn.addEventListener(ev, e => { hide(); if (ev === 'pointerover') rt = setTimeout(show, 250, e.target); else show(e.target); }));
['pointerleave', 'focusout'].forEach(ev => mn.addEventListener(ev, hide));
// WCAG 1.4.13: Esc dismisses the readout without moving focus or pointer.
addEventListener('keydown', e => e.key === 'Escape' && hide());
addEventListener('beforeprint', () => { spin(cnt, S.total); if (S.au) paint(1); });
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
  Promise.resolve().then(() => navigator.clipboard.writeText(b.dataset.cmd)).then(() => done(true), () => done(false));
});
})();
