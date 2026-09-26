// agentkit launch site — one rAF loop (~30fps), scroll-driven chapters.
// Motion maths ported 1:1 from the v3 design prototype.
(() => {
'use strict';

const CLONE = 'git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit && cd ~/agentkit && ./install.sh';
const CHANNELS = [
  { label: 'sh', name: 'MACOS / LINUX', cmd: CLONE },
  { label: 'ps1', name: 'WINDOWS', cmd: 'git clone https://github.com/jthiruveedula/agentkit.git $HOME\\agentkit\ncd $HOME\\agentkit; .\\install.ps1' },
  { label: 'npx', name: 'NODE', cmd: 'npx github:jthiruveedula/agentkit' },
  { label: 'uvx', name: 'PYTHON', cmd: 'uvx --from git+https://github.com/jthiruveedula/agentkit agentkit' },
  { label: 'make', name: 'MAKE', cmd: 'git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit && cd ~/agentkit && make install' },
];
const AFTER = ['./install.sh version', './install.sh upgrade', './install.sh --with-external'];
const TARGETS = [
  { name: 'Claude Code', href: '#logo-claude', vb: '0 0 24 24' },
  { name: 'Copilot', href: '#logo-copilot', vb: '0 0 24 24' },
  { name: 'Cursor', href: '#logo-cursor', vb: '0 0 24 24' },
  { name: 'Antigravity', href: '#logo-antigravity', vb: '0 0 115 113' },
];
const AGENTS = [
  { name: 'researcher', description: 'Read-only investigation. Never edits files.', tools: ['Read', 'Grep', 'Glob', 'Bash', 'WebFetch'] },
  { name: 'implementer', description: 'Makes the code changes from a spec or findings.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'] },
  { name: 'reviewer', description: 'Finds correctness bugs and scope creep. No fixes.', tools: ['Read', 'Grep', 'Bash'] },
  { name: 'test-writer', description: 'The smallest test that fails if the logic breaks.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Bash'] },
  { name: 'verifier', description: 'Runs external checks only and reports pass/fail.', tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  { name: 'doc-writer', description: 'Keeps docs truthful to the code. Never edits source.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob'] },
  { name: 'data-platform-architect', description: 'Decides the data platform and records it as an ADR.', tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write'] },
  { name: 'pipeline-engineer', description: 'Builds dbt, Airflow, Dagster or Spark units from a decided ADR.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'] },
  { name: 'data-quality-engineer', description: 'Schema, freshness, volume, idempotency and PII checks.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Bash'] },
  { name: 'ml-engineer', description: 'ML and GenAI work, judged against a named metric.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'] },
  { name: 'frontend-engineer', description: 'UI, motion and 3D within a performance budget.', tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'] },
];
const CHAP = [['Build', '#build'], ['Skills', '#skills'], ['Agents', '#agents'], ['Install', '#install']];
const PALETTE = { lime: '#c6ff3d', ultraviolet: '#9d7bff', solar: '#ff7a2f', ice: '#5ee7ff' };
const TEMPO = { still: 0, calm: 0.45, live: 1, overdrive: 2.2 };
const pad = n => String(n).padStart(2, '0');
const c01 = x => Math.min(1, Math.max(0, x));
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const lerp = (a, b, e) => a + (b - a) * e;
const ACC = 'var(--acc, #c6ff3d)';
const hash = x => { const s = Math.sin(x * 127.1 + 3.7) * 43758.5453; return s - Math.floor(s); };
const GLY = '<>/\\[]{}=+*#01_';
const CODE = ['---', 'name: orchestrate', 'kind: native', 'version: 1.0.0', '---', '# plan → fan out → verify'];

// ?accent=ultraviolet|solar|ice, ?tempo=calm|overdrive, ?hud=0
const q = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const accent = PALETTE[q.get('accent')] || PALETTE.lime;
const tempo = reduce ? 'still' : (q.get('tempo') in TEMPO ? q.get('tempo') : 'live');
const hud = q.get('hud') !== '0';

// --- tiny DOM helpers: cached writes so unchanged values never touch the DOM
const $ = id => document.getElementById(id);
const UNITLESS = { opacity: 1, zIndex: 1, strokeDasharray: 1, strokeDashoffset: 1 };
function css(el, o) {
  const c = el._c || (el._c = {});
  for (const k in o) {
    let v = o[k];
    v = typeof v === 'number' && !UNITLESS[k] ? v + 'px' : String(v);
    if (c[k] !== v) { c[k] = v; el.style.setProperty(k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), v); }
  }
}
function txt(el, s) { if (el._t !== s) { el._t = s; el.textContent = s; } }
function attr(el, k, v) { v = String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); }
function mk(tag, parent, html) { const el = document.createElement(tag); if (html) el.innerHTML = html; parent.appendChild(el); return el; }
const SVGNS = 'http://www.w3.org/2000/svg';
function mkSvg(tag, parent, attrs) { const el = document.createElementNS(SVGNS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; }
const logo = (tg, size) => `<svg viewBox="${tg.vb}" width="${size}" height="${size}" aria-hidden="true" style="color:#eceef2"><use href="${tg.href}"></use></svg>`;

const S = { t: 0, pB: 0, pS: 0, pA: 0, instAt: -1, sp: 0, ch: 0, tab: 2, copied: null, skills: [], hotSkill: null, hotAgent: null, mx: 0, my: 0 };

const root = $('root');
root.style.setProperty('--acc', accent);
if (!hud) $('hud').remove();

// --- build the DOM once
const E = {};
E.chapters = CHAP.map(([name, href]) => { const a = mk('a', $('chapters')); a.href = href; a.textContent = name; return a; });
E.ticks = [0, 1, 2, 3, 4].map(() => mk('span', $('ticks') || document.createElement('div')));

const orbitEl = $('orbit');
E.rings = [0, 1, 2].map(() => mk('div', orbitEl));
E.streams = []; for (let i = 0; i < 12; i++) E.streams.push(mk('div', orbitEl));
E.core = mk('div', orbitEl);
E.orbit = TARGETS.map(tg => {
  const pos = mk('div', orbitEl);
  const chip = mk('div', pos, logo(tg, 22));
  mk('span', pos, tg.name.toUpperCase()).style.cssText = 'font-size:10px;letter-spacing:0.14em;color:#8a909a;white-space:nowrap';
  return { pos, chip };
});

E.lines = TARGETS.map(() => mkSvg('line', $('buildLines'), { pathLength: 1, stroke: ACC, 'stroke-opacity': 0.5, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
const fx = $('buildFx');
E.beams = []; for (let i = 0; i < 12; i++) E.beams.push(mk('div', fx));
E.clones = TARGETS.map(tg => {
  const box = mk('div', fx, logo(tg, 30));
  mk('span', box, tg.name).style.cssText = 'font-family:Unbounded,sans-serif;font-weight:500;font-size:14px';
  const track = mk('span', box); track.style.cssText = 'position:relative;height:3px;border-radius:3px;background:rgba(255,255,255,0.08);display:block;margin-top:auto';
  const bar = mk('span', track);
  const stat = mk('span', box);
  return { box, bar, stat };
});
E.src = $('src');
E.code = CODE.map(() => { const s = mk('span', E.src); s.style.cssText = 'font-size:11px;line-height:1.4;color:#06070a;white-space:pre;min-height:15px'; return s; });

E.cells = [];

const net = $('net');
E.netLines = AGENTS.map(() => mkSvg('line', $('netLines'), { x1: 50, y1: 50, pathLength: 1, 'stroke-width': 0.35 }));
E.pulses = AGENTS.map(() => mk('div', net));
E.sweep = mk('div', net); E.shock = mk('div', net);
E.core2 = mk('div', net); E.coreText = mk('span', E.core2); E.coreText.style.cssText = 'font-size:8px;letter-spacing:0.14em;color:#06070a;font-weight:600';
E.nodes = AGENTS.map((a, i) => {
  const b = mk('button', net); b.type = 'button'; b.setAttribute('aria-label', a.name);
  const hover = () => { S.hotAgent = i; };
  b.addEventListener('mouseenter', hover); b.addEventListener('focus', hover); b.addEventListener('click', hover);
  const dot = mk('span', b), label = mk('span', b); label.textContent = a.name;
  return { b, dot, label };
});

E.channels = CHANNELS.map((c, i) => {
  const b = mk('button', $('channels')); b.type = 'button'; b.textContent = c.label;
  b.addEventListener('click', () => { S.tab = i; S.instAt = S.t; });
  return b;
});
E.after = AFTER.map((cmd, i) => {
  const b = mk('button', $('after')); b.type = 'button'; b.className = 'after';
  b.style.cssText = 'padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#aab0ba;font:inherit;font-size:12px;cursor:pointer';
  b.addEventListener('click', () => copy(cmd, 'a' + i));
  return b;
});

let ct;
function copy(text, key) {
  try { navigator.clipboard.writeText(text); } catch (e) {}
  S.copied = key; clearTimeout(ct); ct = setTimeout(() => { S.copied = null; }, 1600);
}
$('heroCopy').addEventListener('click', () => copy('npx github:jthiruveedula/agentkit', 'hero'));
$('copyCmd').addEventListener('click', () => copy(CHANNELS[S.tab].cmd, 'tab'));

function buildCells() {
  const grid = $('grid');
  E.cells = S.skills.map(s => {
    const b = mk('button', grid); b.type = 'button'; b.setAttribute('aria-label', s.name);
    const hover = () => { S.hotSkill = s.name; };
    b.addEventListener('mouseenter', hover); b.addEventListener('focus', hover); b.addEventListener('click', hover);
    return b;
  });
}
fetch('assets/skills.json').then(r => r.json()).then(d => { S.skills = d.skills || []; buildCells(); }).catch(() => {});

addEventListener('pointermove', e => { S.mx = e.clientX / innerWidth - 0.5; S.my = e.clientY / innerHeight - 0.5; }, { passive: true });

// --- render: same maths as the prototype's renderVals()
function render() {
  const { t, pB, pS, pA, ch, sp, tab, copied, instAt } = S;
  const still = tempo === 'still';
  const skills = S.skills;
  const blink = still || Math.floor(t * 2) % 2 === 0;

  // hero orbit — ignition sequence + parallax
  const intro = still ? 1 : ease(c01(t / 2.6));
  const px = S.mx, py = S.my;
  const scr = (s, p) => s.split('').map((c, i) => c === ' ' || i / s.length < p ? c : GLY[(i * 7 + Math.floor(t * 24)) % GLY.length]).join('');
  [30, 42, 50].forEach((r, i) => { const g = ease(c01(intro * 1.7 - i * 0.22));
    css(E.rings[i], { position: 'absolute', left: '50%', top: '50%', width: r * 2 * g + '%', height: r * 2 * g + '%', opacity: g, transform: `translate(-50%,-50%) translate(${px * -10 * (i + 1)}px,${py * -10 * (i + 1)}px) rotate(${t * (i % 2 ? -8 : 6)}deg)`, borderRadius: '50%', border: i === 1 ? '1px dashed rgba(255,255,255,0.16)' : '1px solid rgba(255,255,255,0.08)', boxSizing: 'border-box' }); });
  const ang = i => t * 0.22 + i * Math.PI / 2 - Math.PI / 4;
  TARGETS.forEach((tg, i) => {
    const fly = ease(c01(intro * 1.6 - 0.45 - i * 0.1)), R = lerp(110, 42, fly), a = ang(i) - (1 - fly) * 1.5;
    const x = 50 + R * Math.cos(a) + px * 5, y = 50 + R * Math.sin(a) + py * 5;
    const hitP = (t * 0.55 + i * 0.25) % 1, lit = intro > 0.95 && hitP > 0.85;
    css(E.orbit[i].pos, { position: 'absolute', left: x + '%', top: y + '%', transform: `translate(-50%,-50%) scale(${lerp(0.4, 1, fly)})`, opacity: fly, filter: `blur(${(1 - fly) * 8}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2 });
    css(E.orbit[i].chip, { width: 54, height: 54, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(14,16,20,0.9)', border: '1px solid ' + (lit ? ACC : 'rgba(255,255,255,0.12)'), boxShadow: lit ? `0 0 28px -4px ${ACC}` : 'none', transform: `scale(${lit ? 1.08 : 1})`, transition: 'border-color .3s, box-shadow .3s, transform .3s' });
  });
  const live = c01(intro * 2 - 1);
  TARGETS.forEach((_, i) => { for (let k = 0; k < 3; k++) { const p = (t * 0.55 + i * 0.25 - k * 0.04) % 1, a = ang(i), r = 8 + p * 34;
    css(E.streams[i * 3 + k], { position: 'absolute', left: (50 + r * Math.cos(a) + px * 3) + '%', top: (50 + r * Math.sin(a) + py * 3) + '%', width: 6 - k * 1.6, height: 6 - k * 1.6, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: ACC, boxShadow: `0 0 12px ${ACC}`, opacity: still ? 0 : Math.sin(((p % 1) + 1) % 1 * Math.PI) * live * (1 - k * 0.3) }); } });
  const ign = ease(c01(intro * 2.2)), flash = still ? 0 : Math.max(0, 1 - Math.abs(t - 0.9) * 3);
  const cs = (1 + Math.sin(t * 2.4) * 0.05) * ign + flash * 0.3;
  css(E.core, { position: 'absolute', left: '50%', top: '50%', width: '22%', height: '22%', borderRadius: '50%', transform: `translate(-50%,-50%) translate(${px * 8}px,${py * 8}px) scale(${cs})`, background: `radial-gradient(circle at ${35 - px * 20}% ${30 - py * 20}%, #ffffff 0%, ${ACC} 38%, transparent 72%)`, boxShadow: `0 0 ${90 + flash * 200}px ${10 + flash * 40}px color-mix(in srgb, ${ACC} 45%, transparent)` });
  txt($('h1a'), scr('One kit.', c01(intro * 1.5 - 0.3)));
  txt($('h1b'), scr('Every agent.', c01(intro * 1.5 - 0.5)));
  txt($('heroCopyLabel'), copied === 'hero' ? 'COPIED' : 'COPY');

  // build — typed source, compile glitch, beams, 3D landing
  const e2 = ease(c01((pB - 0.25) / 0.3)), e3 = ease(c01((pB - 0.6) / 0.28));
  const phase = pB < 0.25 ? 0 : pB < 0.6 ? 1 : 2;
  // narrow: 2×2 cards; short: SKILL.md card clears the title (design overlapped at 360×640 / 909×540)
  const narrow = innerWidth < 640, vhPx = innerHeight;
  const srcY = lerp(55, Math.max(36, 24000 / vhPx), e2), xs = narrow ? [28, 72, 28, 72] : [17, 39, 61, 83];
  const cys = narrow ? [61, 61, 84, 84] : [72, 72, 72, 72];
  const total = CODE.join('').length; let budget = Math.floor(c01(pB / 0.22) * total);
  const glitch = phase === 1 && !still;
  CODE.forEach((ln, li) => { const s = ln.slice(0, Math.max(0, budget)); budget -= ln.length;
    txt(E.code[li], glitch ? s.split('').map((c, ci) => hash(ci + li * 31 + Math.floor(t * 12)) > 0.9 ? GLY[(ci + li) % GLY.length] : c).join('') : s); });
  xs.forEach((x, i) => { const lp = c01(e3 * 1.35 - i * 0.12); for (let k = 0; k < 3; k++) { const p = (t * 0.8 + k / 3 + i * 0.13) % 1;
    css(E.beams[i * 3 + k], { position: 'absolute', left: lerp(50, x, p) + '%', top: lerp(srcY + 7, cys[i] - 11, p) + '%', width: 7, height: 7, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: ACC, boxShadow: `0 0 14px ${ACC}`, opacity: still ? 0 : c01((e2 - 0.9) * 10) * (lp >= 1 ? 0 : 1) * Math.sin(p * Math.PI), zIndex: 1 }); } });
  txt($('buildStep'), ['01 — WRITE', '02 — COMPILE', '03 — LINK'][phase]);
  txt($('buildWord'), ['Write once.', 'Transpile.', 'Run everywhere.'][phase]);
  css(E.src, { position: 'absolute', left: '50%', top: srcY + '%', width: 220, padding: 18, borderRadius: 18, background: ACC, transform: `translate(-50%,-50%) scale(${lerp(1, 0.82, e2) * (glitch ? 1 + hash(Math.floor(t * 14)) * 0.03 : 1)}) rotate(${lerp(-4, 0, c01(pB * 4))}deg) translateX(${glitch && hash(Math.floor(t * 9)) > 0.8 ? 4 : 0}px)`, display: 'flex', flexDirection: 'column', gap: 2, boxSizing: 'border-box', zIndex: 3, boxShadow: `0 30px 80px -20px ${ACC}` + (glitch ? ', -3px 0 0 #ff2e6e, 3px 0 0 #2ee6ff' : '') });
  xs.forEach((x, i) => { const l = E.lines[i];
    attr(l, 'x1', 50); attr(l, 'y1', srcY + 7); attr(l, 'x2', lerp(50, x, e2)); attr(l, 'y2', lerp(55, cys[i] - (narrow ? 8 : 11), e2));
    css(l, { strokeDasharray: 1, strokeDashoffset: 1 - e2 }); });
  TARGETS.forEach((tg, i) => { const lp = c01(e3 * 1.35 - i * 0.12), done = lp >= 1, pop = done ? Math.max(0, 1 - (e3 * 1.35 - i * 0.12 - 1) * 4) : 0, K = E.clones[i];
    css(K.box, { position: 'absolute', left: lerp(50, xs[i], e2) + '%', top: lerp(55, cys[i], e2) + '%', width: narrow ? '40vw' : 'min(19vw,190px)', minWidth: 116, height: narrow ? '21vh' : 'min(180px,30vh)', padding: 16, borderRadius: 18, boxSizing: 'border-box', transform: `translate(-50%,-50%) perspective(800px) rotateX(${lerp(75, 0, e2)}deg) rotateY(${done ? 0 : (1 - lp) * -18 * (i < 2 ? -1 : 1)}deg) scale(${lerp(0.5, 1, e2) + pop * 0.08})`, opacity: e2 > 0.02 ? 1 : 0, background: done ? `color-mix(in srgb, ${ACC} 10%, #0e1014)` : 'rgba(14,16,20,0.92)', border: '1px solid ' + (done ? ACC : 'rgba(255,255,255,0.1)'), boxShadow: done ? `0 0 ${40 + pop * 60}px -10px ${ACC}` : 'none', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 2 });
    css(K.bar, { position: 'absolute', left: 0, top: 0, height: 3, borderRadius: 3, width: lp * 100 + '%', background: ACC });
    txt(K.stat, done ? 'LINKED ✓' : lp > 0 ? Math.round(lp * 100) + '%' : 'QUEUED');
    css(K.stat, { fontSize: 10, letterSpacing: '0.14em', color: done ? ACC : '#5d636d' }); });

  // skills — scattered debris assembles, then ripples
  const asm = ease(c01(pS / 0.45));
  const vis = Math.round(c01((pS - 0.05) / 0.6) * skills.length);
  const hot = skills.find(s => s.name === S.hotSkill) || (vis ? skills[vis - 1] : null);
  const hotI = hot ? skills.indexOf(hot) : 0;
  txt($('count'), pad(vis));
  txt($('hotName'), hot ? hot.name : ' ');
  txt($('hotDesc'), hot ? hot.description.split(/\. Use (when|for)/)[0].replace(/\.$/, '') + '.' : '');
  E.cells.forEach((el, i) => { const s = skills[i], on = i < vis, router = s.kind === 'router', isHot = hot && hot.name === s.name, k = 1 - asm;
    const rip = on && !still ? Math.max(0, Math.sin(t * 4 - Math.abs(i - hotI) * 0.55)) * 0.16 * c01(asm * 2 - 1) : 0;
    css(el, { aspectRatio: '1', borderRadius: router ? '50%' : 10, cursor: 'pointer', padding: 0, background: isHot ? '#ffffff' : on && !router ? ACC : 'transparent', border: '1.5px solid ' + (isHot ? '#ffffff' : on ? ACC : 'rgba(255,255,255,0.12)'), boxShadow: isHot ? '0 0 24px rgba(255,255,255,0.6)' : on && !router ? `0 0 18px -4px ${ACC}` : 'none', opacity: lerp(0.15, 1, asm), transform: `translate(${(hash(i) - 0.5) * 1400 * k}px,${(hash(i + 99) - 0.5) * 900 * k}px) rotate(${(hash(i + 7) - 0.5) * 540 * k}deg) scale(${(on ? 1 : 0.7) + rip})`, transition: 'background .35s, box-shadow .35s' }); });

  // agents — plan → fan out → verify → return
  const beat = pA < 0.22 ? 0 : pA < 0.5 ? 1 : pA < 0.75 ? 2 : 3;
  const TAU = Math.PI * 2, sw = still ? -1 : ((t * 1.8) % TAU);
  const scan = i => { if (beat !== 0 || sw < 0) return 0; const d = ((sw - i / 11 * TAU) % TAU + TAU) % TAU; return d < 0.9 ? 1 - d / 0.9 : 0; };
  const fan = ease(c01((pA - 0.22) / 0.25)), ver = c01((pA - 0.5) / 0.22), ret = ease(c01((pA - 0.75) / 0.2));
  const vcount = Math.floor(ver * 11.99);
  const hi = S.hotAgent ?? Math.min(10, beat === 2 ? vcount : Math.floor(c01(pA / 0.9) * 11));
  const pos = i => { const a = i / 11 * Math.PI * 2 - Math.PI / 2, r = 40; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; };
  const litOf = i => beat === 0 ? scan(i) > 0.4 : beat === 1 ? fan > 0.97 : beat === 2 ? true : beat === 3 ? ret < 0.5 : false;
  const doneFlash = beat === 3 && ret > 0.92;
  txt($('netStep'), ['01 — PLAN', '02 — PARALLEL DISPATCH', '03 — EXTERNAL CHECKS', '04 — ONE RESULT'][beat]);
  txt($('netWord'), ['Plan.', 'Fan out.', 'Verify.', 'Return.'][beat]);
  css(E.sweep, { position: 'absolute', inset: '10%', borderRadius: '50%', background: `conic-gradient(from ${sw * 180 / Math.PI}deg, color-mix(in srgb, ${ACC} 38%, transparent) 0deg, transparent 55deg)`, opacity: beat === 0 && !still ? 1 : 0, transition: 'opacity .5s', zIndex: 1, maskImage: 'radial-gradient(circle, transparent 22%, #000 23%)', WebkitMaskImage: 'radial-gradient(circle, transparent 22%, #000 23%)' });
  css(E.shock, { position: 'absolute', left: '50%', top: '50%', width: lerp(18, 110, ret) + '%', aspectRatio: '1', borderRadius: '50%', transform: 'translate(-50%,-50%)', border: `2px solid ${ACC}`, opacity: beat === 3 && ret > 0.85 ? (1 - (ret - 0.85) / 0.15) * 0.9 + 0.1 : 0, boxShadow: `0 0 40px ${ACC}`, zIndex: 1 });
  txt(E.coreText, doneFlash ? '✓' : 'LEAD');
  const hotA = AGENTS[hi];
  txt($('agentDesc'), narrow ? hotA.name + ' — ' + hotA.description : hotA.description);
  const tools = $('agentTools');
  if (tools._hi !== hi) { tools._hi = hi; tools.innerHTML = hotA.tools.map(x => `<span style="font-size:10px;padding:3px 9px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);color:#c3c8d0">${x}</span>`).join(''); }
  AGENTS.forEach((_, i) => { const [x, y] = pos(i), l = E.netLines[i];
    attr(l, 'x2', x); attr(l, 'y2', y); attr(l, 'stroke', litOf(i) || i === S.hotAgent ? ACC : 'rgba(255,255,255,0.14)');
    css(l, { strokeDasharray: 1, strokeDashoffset: 0 });
    const p = beat === 0 ? 0 : beat === 3 ? 1 - ret : beat === 2 ? 1 : c01(fan * 1.25 - hash(i) * 0.25);
    const wob = beat === 2 && !still ? Math.sin(t * 6 + i) * 0.02 : 0;
    css(E.pulses[i], { position: 'absolute', left: lerp(50, x, p + wob) + '%', top: lerp(50, y, p + wob) + '%', width: 9, height: 9, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: beat === 2 && i < vcount ? '#ffffff' : ACC, boxShadow: `0 0 16px ${ACC}`, opacity: beat === 0 || (beat === 3 && ret > 0.97) ? 0 : 1, zIndex: 2 }); });
  css(E.core2, { position: 'absolute', left: '50%', top: '50%', width: 'max(17%, 64px)', aspectRatio: '1', borderRadius: '50%', transform: `translate(-50%,-50%) scale(${(beat === 0 ? 1 + Math.sin(t * 5) * 0.06 : 1 + Math.sin(t * 2.4) * 0.03) + (doneFlash ? 0.12 : 0)})`, background: doneFlash ? '#ffffff' : ACC, boxShadow: `0 0 ${doneFlash ? 160 : 80}px -6px ${ACC}`, display: 'grid', placeItems: 'center', zIndex: 3, transition: 'background .3s' });
  AGENTS.forEach((a, i) => { const [x, y] = pos(i), on = i === hi || litOf(i), checked = (beat === 2 && i < vcount) || (beat === 3 && ret < 0.5), right = x >= 50, N = E.nodes[i];
    css(N.b, { position: 'absolute', left: x + '%', top: y + '%', transform: 'translate(-50%,-50%)', background: 'transparent', border: 0, padding: 8, cursor: 'pointer', font: 'inherit', zIndex: 4 });
    css(N.dot, { display: 'block', width: i === hi ? 18 : 12, height: i === hi ? 18 : 12, borderRadius: '50%', background: checked ? '#ffffff' : on ? ACC : `color-mix(in srgb, ${ACC} ${Math.round(scan(i) * 60)}%, #06070a)`, border: '1.5px solid ' + (checked ? '#ffffff' : on ? ACC : 'rgba(255,255,255,0.35)'), boxShadow: on ? `0 0 22px ${ACC}` : 'none', transition: 'all .3s' });
    css(N.label, { position: 'absolute', top: '50%', [right ? 'left' : 'right']: '100%', transform: 'translateY(-50%)', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '0.04em', color: i === hi ? '#ffffff' : on ? '#b7bcc4' : '#6d737d', opacity: narrow ? 0 : 1, transition: 'color .3s' }); });

  // install terminal
  const chn = CHANNELS[tab];
  const chars = instAt < 0 ? 0 : still ? chn.cmd.length : Math.floor((t - instAt) * 55);
  E.channels.forEach((b, i) => { attr(b, 'aria-pressed', i === tab);
    css(b, { padding: '6px 12px', borderRadius: 8, border: 0, font: 'inherit', fontSize: 12, cursor: 'pointer', background: i === tab ? ACC : 'transparent', color: i === tab ? '#06070a' : '#8a909a' }); });
  txt($('activeName'), chn.name);
  txt($('typed'), chn.cmd.slice(0, chars));
  css($('caret'), { display: 'inline-block', width: '0.55em', height: '1.1em', verticalAlign: 'text-bottom', marginLeft: 3, background: ACC, opacity: blink ? 1 : 0 });
  txt($('copyCmd'), copied === 'tab' ? 'COPIED ✓' : 'COPY COMMAND');
  E.after.forEach((b, i) => txt(b, copied === 'a' + i ? 'copied ✓' : AFTER[i]));

  // chrome
  css($('glow'), { position: 'fixed', left: '50%', top: '-30vh', width: '120vw', height: '90vh', transform: `translateX(-50%) translateY(${sp * 40}vh)`, pointerEvents: 'none', zIndex: 0, background: `radial-gradient(ellipse at center, color-mix(in srgb, ${ACC} 14%, transparent) 0%, transparent 60%)` });
  E.chapters.forEach((a, i) => { if (ch === i + 1) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    css(a, { padding: '8px 12px', borderRadius: 999, fontSize: 12, whiteSpace: 'nowrap', color: ch === i + 1 ? '#06070a' : '#9aa0aa', background: ch === i + 1 ? '#eceef2' : 'transparent', transition: 'all .25s' }); });
  if (hud) {
    txt($('chN'), pad(ch)); txt($('pct'), pad(Math.round(sp * 100)));
    txt($('up'), [Math.floor(t / 60) % 60, Math.floor(t) % 60].map(pad).join(':'));
    E.ticks.forEach((el, i) => css(el, { display: 'block', width: i === ch ? 18 : 6, height: 2, borderRadius: 2, background: i === ch ? ACC : 'rgba(255,255,255,0.2)', marginLeft: 'auto', transition: 'all .3s' }));
  }
}

// --- loop: ~30fps, pauses with the tab (rAF stops when hidden; dt clamped on return)
const refs = ['build', 'skills', 'agents', 'install'].map($);
const prog = el => { const r = el.getBoundingClientRect(); return c01(-r.top / Math.max(1, r.height - innerHeight)); };
const speed = TEMPO[tempo];
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = now - last; if (dt < 33) return; last = now;
  const vh = innerHeight, se = document.scrollingElement || document.documentElement;
  let ch = 0; refs.forEach((el, i) => { if (el.getBoundingClientRect().top < vh * 0.5) ch = i + 1; });
  const ir = refs[3].getBoundingClientRect().top;
  S.t += (Math.min(dt, 100) / 1000) * speed;
  S.pB = prog(refs[0]); S.pS = prog(refs[1]); S.pA = prog(refs[2]); S.ch = ch;
  S.sp = c01(se.scrollTop / Math.max(1, se.scrollHeight - vh));
  if (S.instAt < 0 && ir < vh * 0.7) S.instAt = S.t;
  render();
}
render();
requestAnimationFrame(loop);
})();
