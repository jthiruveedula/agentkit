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
const txt = (el, s) => { s = String(s); if (el.textContent !== s) el.textContent = s; };
function mk(tag, parent, text, cls) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}
const slips = $('slips'), ro = $('readout');
let skills = [];

// Failed fetch: visible role=alert box with a retry button (shared by both loaders).
const fail = (id, run) => {
  const box = $(id);
  box.hidden = false;
  box.querySelector('button').onclick = () => { box.hidden = true; run(); };
};
function drawSkills(kind) {
  slips.textContent = '';
  const list = skills.filter(s => !kind || s.kind === kind);
  list.forEach(s => {
    const li = mk('li', slips, null, s.kind === 'native' ? '' : 'x'), b = mk('button', li, s.name);
    b.type = 'button';
    b.setAttribute('aria-label', s.name + ', ' + s.kind);
    b.dataset.d = (s.description || '').split('. ')[0];
  });
  txt($('cnt'), 'Showing ' + list.length + ' of ' + skills.length + ' skills. Router skills (ext-) have an outlined pill. Select a skill to read what it does.');
}
function loadSkills() {
  fetch('assets/skills.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => {
    skills = d.skills.sort((a, b) => a.name < b.name ? -1 : 1);
    txt($('n38'), d.count);
    drawSkills('');
  }).catch(() => fail('skerr', loadSkills));
}
loadSkills();
$('seg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !skills.length) return;
  all('#seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  drawSkills(b.dataset.f);
});
txt($('n12'), all('.ag').length);

function loadAudit() {
  fetch('assets/audit.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => {
    const cu = d.current, base = d.baseline ? d.baseline.scores : {};
    txt($('aps'), cu.scores.APS);
    $('apsbt').hidden = cu.scores.APS >= cu.targets.APS;
    all('#rows li').forEach(li => {
      const k = li.dataset.k, v = cu.scores[k], t = cu.targets[k];
      li.querySelector('.bar i').style.setProperty('--v', v);
      li.querySelector('.bar u').style.left = t + '%';
      txt(li.querySelector('.v'), v);
      li.querySelector('.bt').hidden = v >= t;
    });
    txt($('ptk'), cu.tokens.total.toLocaleString('en-US'));
    txt($('psh'), d.sha);
    txt($('n12'), cu.counts.agents);
    scoreTable(cu, base, d.sha);
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
    [cu.scores[k], cu.targets[k], base[k] == null ? 'n/a' : base[k]].forEach(v => mk('td', r, v));
  });
}
new IntersectionObserver((es, o) => {
  if (!es[0].isIntersecting) return;
  o.disconnect();
  loadAudit();
}, { rootMargin: '150%' }).observe($('proof'));

// Readout: hover (delayed), focus or click shows a skill/agent description; Esc or leaving dismisses.
const mn = document.querySelector('main');
let rt = 0, cur = null;
function hide() { clearTimeout(rt); if (cur) cur.classList.remove('on'); cur = null; ro.classList.remove('on'); }
function show(t) {
  const b = t.closest && t.closest('[data-d]');
  hide();
  if (!b) return;
  cur = b; b.classList.add('on');
  [b.textContent.toLowerCase(), b.dataset.d, b.dataset.t ? 'tools: ' + b.dataset.t : ''].forEach((v, i) => txt(ro.children[i], v));
  ro.classList.add('on');
}
['pointerover', 'focusin', 'click'].forEach(ev => mn.addEventListener(ev, e => { hide(); if (ev === 'pointerover') rt = setTimeout(show, 250, e.target); else show(e.target); }));
['pointerleave', 'focusout'].forEach(ev => mn.addEventListener(ev, hide));
// WCAG 1.4.13: Esc dismisses the readout without moving focus or pointer.
addEventListener('keydown', e => e.key === 'Escape' && hide());

// Section tracking for the nav (aria-current).
const links = all('.nav a[href^="#"]');
const spy = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting) links.forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + en.target.id));
}), { rootMargin: '-40% 0px -55% 0px' });
all('main section').forEach(s => spy.observe(s));

document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const tabs = [...b.parentNode.children], cmd = CHANNELS[tabs.indexOf(b)];
  tabs.forEach(t => t.setAttribute('aria-pressed', t === b));
  txt($('typed'), cmd);
  $('cpy').dataset.cmd = cmd;
});
document.addEventListener('click', e => {
  const b = e.target.closest('.cp');
  if (!b || !b.dataset.cmd) return;
  const lb = b.querySelector('.lb'), old = lb && lb.textContent;
  const done = ok => {
    $('status').textContent = ok ? 'Copied' : 'Copy failed. Select the command text instead.';
    if (!ok) return;
    if (lb) lb.textContent = 'Copied';
    b.classList.add('ok');
    setTimeout(() => { b.classList.remove('ok'); if (lb) lb.textContent = old; }, 1600);
  };
  Promise.resolve().then(() => navigator.clipboard.writeText(b.dataset.cmd)).then(() => done(true), () => done(false));
});
})();
