(function(){
'use strict';
var SAFE=/^[A-Za-z0-9._\/-]+$/;
var REPO='https://github.com/jthiruveedula/agentkit';
var TARGET={PEI:85,OVS:90,CRI:90,MNSS:92,SRS:95};
var KEYS=['PEI','OVS','CRI','MNSS','SRS'];
var NAMES={PEI:'Prompt efficiency',OVS:'Orchestration velocity',CRI:'Context retention',MNSS:'Motion storytelling',SRS:'System robustness'};
var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
var SAMPLE={generated_by:'embedded sample',sha:null,baseline:null,current:{scores:{PEI:70,OVS:75,CRI:72,MNSS:80,SRS:85,APS:75.5},tokens:{skills:900,agents:300,total:1200},counts:{skills:1,agents:1},units:[{kind:'agent',name:'orchestrator',path:'agents/orchestrator.md',tokens:300,tags:['ops'],scores:{PEI:70,OVS:75,CRI:72,SRS:85},flags:[]},{kind:'skill',name:'sample-skill',path:'skills/sample-skill/SKILL.md',tokens:900,tags:['docs'],scores:{PEI:70,OVS:75,CRI:72,SRS:85},flags:['sample']}],findings:[{id:'S1',severity:'low',category:'Static Presentation',path:'skills/sample-skill/SKILL.md',detail:'Embedded sample finding.'}],graph:{nodes:[{id:'orchestrator',kind:'agent',label:'orchestrator'},{id:'sample-skill',kind:'skill',label:'sample-skill'}],edges:[{from:'orchestrator',to:'sample-skill',kind:'applies'}]}}};

var $=function(id){return document.getElementById(id)};
function el(t,c,x,p){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;if(p)p.appendChild(e);return e}
function svg(t,a,p){var e=document.createElementNS('http://www.w3.org/2000/svg',t);for(var k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e}
function fmt(n){return Number(n).toLocaleString('en-US')}
function d1(n){return (Math.round(n*10)/10).toFixed(1)}

/* single rAF loop for all counters */
var tweens=[],raf=0;
document.addEventListener('visibilitychange',function(){if(!document.hidden&&tweens.length&&!raf)raf=requestAnimationFrame(tick)});
function ease(t){return t>=1?1:1-Math.pow(2,-10*t)}
function count(node,to,dec,dur,delay){
  var f=function(v){node.textContent=dec?d1(v):fmt(Math.round(v))};
  if(RM){f(to);return}
  tweens.push({f:f,to:to,dur:dur,delay:delay||0,t0:null});
  if(!raf)raf=requestAnimationFrame(tick);
}
function tick(now){
  tweens=tweens.filter(function(w){
    if(w.t0==null)w.t0=now+w.delay;
    var p=Math.max(0,(now-w.t0)/w.dur);w.f(w.to*ease(p));return p<1;
  });
  raf=tweens.length?requestAnimationFrame(tick):0;
}

var io=new IntersectionObserver(function(es){es.forEach(function(e){
  if(e.isIntersecting){e.target.classList.add('in');var r=e.target._run;if(r){r();e.target._run=null}
    if(e.target.id!=='gwrap')io.unobserve(e.target)}
  if(e.target.id==='gwrap')e.target.classList.toggle('live',e.isIntersecting&&!RM)
})},{threshold:.15});
function reveal(n,run){n._run=run;io.observe(n)}

/* build heavy sections only when scrolled near */
var lio=new IntersectionObserver(function(es){es.forEach(function(e){
  if(!e.isIntersecting)return;lio.unobserve(e.target);var r=e.target._lazy;e.target._lazy=null;
  if(r)try{r()}catch(x){fallback()}})},{rootMargin:'400px 0px'});
function lazy(n,run){n._lazy=run;lio.observe(n)}

function num(v){return typeof v==='number'&&isFinite(v)}
function snap(s,full){
  if(!s||!s.scores||!s.tokens||!s.counts)return false;
  var ok=KEYS.concat('APS').every(function(k){return num(s.scores[k])})&&num(s.tokens.total)&&num(s.tokens.skills)&&num(s.tokens.agents)&&num(s.counts.skills)&&num(s.counts.agents);
  if(!ok||!full)return ok;
  var U=['PEI','OVS','CRI','SRS'];
  return Array.isArray(s.units)&&s.units.every(function(u){return u&&typeof u.name==='string'&&typeof u.kind==='string'&&num(u.tokens)&&Array.isArray(u.tags)&&Array.isArray(u.flags)&&u.scores&&U.every(function(k){return num(u.scores[k])})})
   &&Array.isArray(s.findings)&&s.findings.every(function(f){return f&&typeof f.category==='string'&&typeof f.path==='string'&&typeof f.detail==='string'&&(f.severity in {high:1,med:1,low:1})})
   &&s.graph&&Array.isArray(s.graph.nodes)&&Array.isArray(s.graph.edges)&&s.graph.nodes.every(function(n){return n&&typeof n.id==='string'&&typeof n.label==='string'&&(n.kind==='agent'||n.kind==='skill')})
   &&s.graph.edges.every(function(e){return e&&typeof e.from==='string'&&typeof e.to==='string'});
}
function valid(d){return d&&snap(d.current,true)&&(!d.baseline||snap(d.baseline,false))}

function fallback(){
  ['kpis','acts','gsvg','chips','grid','drawers','foot'].forEach(function(id){$(id).textContent=''});
  tweens=[];$('hero')._run=null;$('notice').hidden=false;
  if(!fallback.done){fallback.done=1;render(SAMPLE)}
}

function load(){
  return fetch('../assets/audit.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){if(!valid(d))throw 0;return d});
}

function render(D){
  var C=D.current,B=D.baseline,S=C.scores;
  /* hero */
  var aps=$('aps');aps.setAttribute('aria-label','Agent Productivity Score '+d1(S.APS));
  aps.textContent=RM?d1(S.APS):'0.0';
  reveal($('hero'),function(){count(aps,S.APS,1,1600,300)});
  var dc=$('delta');
  if(B){var dl=S.APS-B.scores.APS;if(dl<0)dc.classList.add('neg');
    dc.textContent='';dc.append(document.createTextNode(d1(B.scores.APS)+' → '+d1(S.APS)+' '));el('b',null,(dl>=0?'+':'')+d1(dl),dc)}
  else dc.textContent='no baseline snapshot';
  $('sub').textContent=C.counts.skills+' skills and '+C.counts.agents+' agents audited across '+fmt(C.tokens.total)+' tokens of instruction surface.';

  /* KPIs */
  var kp=$('kpis');
  KEYS.forEach(function(k,i){
    var c=el('article','card kpi rise',null,kp);c.style.setProperty('--i',i);c.tabIndex=0;
    var v=S[k];c.setAttribute('aria-label',k+' '+NAMES[k]+': '+d1(v)+' of target '+TARGET[k]+(B?', baseline '+d1(B.scores[k]):''));
    el('div','k',k+' · '+NAMES[k],c);
    var n=el('div','v',RM?String(Math.round(v)):'0',c);n.setAttribute('aria-hidden','true');
    var b=el('div','bar',null,c);var f=el('i',null,null,b);f.style.setProperty('--w',Math.min(v,100)/100);f.style.setProperty('--i',i);
    var u=el('u',null,null,b);u.style.setProperty('--t',TARGET[k]+'%');
    if(B){var g=el('s',null,null,b);g.style.setProperty('--g',B.scores[k]+'%')}
    el('small',null,'target '+TARGET[k]+(B?' · baseline '+Math.round(B.scores[k]):''),c);
    reveal(c,function(){f.style.setProperty('--w',Math.min(v,100)/100);count(n,v,0,1400,i*75+200)});
    if(!RM)f.style.setProperty('--w',0);
  });

  /* acts */
  var A=$('acts');
  var a1=el('article','card act rise',null,A);el('div','n','ACT I',a1);el('h3',null,'Status quo',a1);
  if(B){el('p',null,'Baseline APS '+d1(B.scores.APS)+' across '+B.counts.skills+' skills and '+B.counts.agents+' agents.',a1);
    var l1=el('ul',null,null,a1);KEYS.forEach(function(k){var li=el('li',null,k,l1);el('b',null,d1(B.scores[k]),li)})}
  else el('p','empty',"No baseline snapshot recorded yet.",a1);
  var a2=el('article','card act rise',null,A);a2.style.setProperty('--i',1);el('div','n','ACT II',a2);el('h3',null,'Latent friction',a2);
  var cats={};C.findings.forEach(function(f){cats[f.category]=(cats[f.category]||0)+1});
  var cl=Object.keys(cats).sort(function(a,b){return cats[b]-cats[a]});
  el('p',null,C.findings.length?C.findings.length+' findings in '+cl.length+' categories.':'No findings. Suspiciously clean.',a2);
  var l2=el('ul',null,null,a2);cl.forEach(function(c){var li=el('li',null,c,l2);el('b',null,String(cats[c]),li)});
  var a3=el('article','card act rise',null,A);a3.style.setProperty('--i',2);el('div','n','ACT III',a3);el('h3',null,'Velocity state',a3);
  el('p',null,'Current APS '+d1(S.APS)+(B?(S.APS>=B.scores.APS?', up from ':', down from ')+d1(B.scores.APS):'')+'.',a3);
  var tl=el('div','big',null,a3);
  if(B){var dt=C.tokens.total-B.tokens.total;
    tl.textContent=fmt(B.tokens.total)+' → '+fmt(C.tokens.total);
    el('p',null,'Token surface '+(dt<=0?'down ':'up ')+fmt(Math.abs(dt))+' tokens ('+(B.tokens.total?Math.abs(Math.round(dt/B.tokens.total*100)):0)+'%).',a3)}
  else{tl.textContent=fmt(C.tokens.total)+' tokens';el('p',null,'Skills '+fmt(C.tokens.skills)+', agents '+fmt(C.tokens.agents)+'.',a3)}
  A.querySelectorAll('.rise').forEach(function(n){reveal(n)});

  lazy($('graph'),function(){graph(C)});lazy($('gallery'),function(){gallery(C)});log(C);

  var ft=$('foot');
  var l=el('a',null,'← agentkit',ft);l.href='../';
  l=el('a',null,'agentkit-audit skill ↗',ft);l.href=REPO+'/tree/main/skills/agentkit-audit';l.target='_blank';l.rel='noopener noreferrer';
  el('span',null,'generated_by: '+D.generated_by,ft);el('span',null,'sha: '+(D.sha||'n/a'),ft);
}

/* ---- graph ---- */
function unitMap(C){var m={};C.units.forEach(function(u){m[u.name]=u});return m}
function graph(C){
  var G=C.graph,U=unitMap(C),s=$('gsvg'),tip=$('tip'),wrap=$('gwrap');
  var agents=G.nodes.filter(function(n){return n.kind==='agent'}),skills=G.nodes.filter(function(n){return n.kind==='skill'});
  var hub=agents.filter(function(n){return /orchestrator/.test(n.id)})[0]||agents[0];
  var inner=agents.filter(function(n){return n!==hub});
  var pos={};
  if(hub)pos[hub.id]=[300,300];
  function ring(arr,r,off){arr.forEach(function(n,i){var a=off+i/arr.length*Math.PI*2;pos[n.id]=[300+r*Math.cos(a),300+r*Math.sin(a)]})}
  ring(inner,105,-Math.PI/2);ring(skills,230,-Math.PI/2+.1);
  var deg={},adj={};
  G.edges.forEach(function(e){deg[e.from]=(deg[e.from]||0)+1;deg[e.to]=(deg[e.to]||0)+1;(adj[e.from]=adj[e.from]||[]).push(e);(adj[e.to]=adj[e.to]||[]).push(e)});
  var eg=svg('g',{},s),paths={};
  G.edges.forEach(function(e,i){
    var a=pos[e.from],b=pos[e.to];if(!a||!b)return;
    var d='M'+a[0].toFixed(1)+' '+a[1].toFixed(1)+' Q300 300 '+b[0].toFixed(1)+' '+b[1].toFixed(1);
    if(a[0]===300&&a[1]===300||b[0]===300&&b[1]===300)d='M'+a[0].toFixed(1)+' '+a[1].toFixed(1)+' L'+b[0].toFixed(1)+' '+b[1].toFixed(1);
    var p1=svg('path',{d:d,class:'edge'},eg);
    var p2=svg('path',{d:d,class:'pulse'},eg);p2.style.animationDelay=(-(i%7)*.4)+'s';
    paths[i]=[p1,p2];e._i=i;
  });
  var ng=svg('g',{},s),els={};
  function show(n,x,y){
    var u=U[n.id];tip.textContent='';el('b',null,n.label,tip);
    el('div',null,n.kind+(u?' · '+fmt(u.tokens)+' tok':''),tip);
    if(u)['PEI','OVS','CRI','SRS'].forEach(function(k){el('div',null,k+' '+Math.round(u.scores[k]),tip)});
    if(u&&u.flags.length)el('div',null,'⚠ '+u.flags.join(', '),tip);
    var w=wrap.clientWidth,px=x/600*w,py=y/600*w;
    tip.style.left=Math.min(Math.max(px+14,4),w-206)+'px';tip.style.top=Math.min(py+14,w-150)+'px';tip.classList.add('show');
  }
  function hl(n,on,x,y){
    s.classList.toggle('hl',on);
    Object.keys(els).forEach(function(k){els[k].classList.remove('on')});
    G.edges.forEach(function(e){if(paths[e._i])paths[e._i].forEach(function(p){p.classList.remove('on')})});
    if(on){els[n.id].classList.add('on');(adj[n.id]||[]).forEach(function(e){paths[e._i]&&paths[e._i].forEach(function(p){p.classList.add('on')});els[e.from]&&els[e.from].classList.add('on');els[e.to]&&els[e.to].classList.add('on')});show(n,x,y)}
    else tip.classList.remove('show');
  }
  G.nodes.forEach(function(n){
    var p=pos[n.id];if(!p)return;
    var u=U[n.id],col=!deg[n.id]?'s-idle':(u&&u.flags.length?'s-flag':'s-ok');
    var g=svg('g',{class:'node',tabindex:0,role:'img','aria-label':n.label+', '+n.kind+(u?', '+u.flags.length+' flags':'')},ng);els[n.id]=g;
    var isH=n===hub,r=isH?13:n.kind==='agent'?9:5;
    svg('circle',{cx:p[0],cy:p[1],r:r+5,class:'ring'},g);
    if(n.kind==='agent')svg('rect',{x:p[0]-r,y:p[1]-r,width:2*r,height:2*r,rx:3,class:col},g);
    else svg('circle',{cx:p[0],cy:p[1],r:r,class:col},g);
    if(n.kind==='agent'){var t=svg('text',{x:p[0],y:p[1]+r+12,'text-anchor':'middle'},g);t.textContent=n.label}
    g.addEventListener('mouseenter',function(){hl(n,true,p[0],p[1])});
    g.addEventListener('mouseleave',function(){hl(n,false)});
    g.addEventListener('focus',function(){hl(n,true,p[0],p[1])});
    g.addEventListener('blur',function(){hl(n,false)});
  });
  if(!G.nodes.length)el('p','empty','No graph data.',wrap);
  io.observe(wrap);
}

/* ---- gallery ---- */
/* preview motif from what the unit does: name first, then its first tag */
var MOTIF_N={route:4,pipe:4,doc:3,scan:4,stack:3,squeeze:3,wave:5,spark:3,morph:2,orbit:3};
var BY_NAME=[[/^ext-|router/,'route'],[/token|compress|budget/,'squeeze'],[/memory|context|session/,'stack'],[/review|audit|security|guardian|verif|quality|debug|test/,'scan'],[/data|pipeline/,'pipe'],[/^ml-/,'wave'],[/genai|prompt/,'spark'],[/frontend|motion|ui-/,'morph'],[/doc|spec|meeting|standup|writer/,'doc'],[/orchestrat|navigat|research|implement|forge/,'orbit']];
var BY_TAG={router:'route',data:'pipe',docs:'doc',review:'scan',memory:'stack',ml:'wave',genai:'spark',frontend:'morph',ops:'orbit'};
function motif(u){for(var i=0;i<BY_NAME.length;i++)if(BY_NAME[i][0].test(u.name))return BY_NAME[i][1];return BY_TAG[u.tags[0]]||'orbit'}
function gallery(C){
  var tagc={};C.units.forEach(function(u){u.tags.forEach(function(t){tagc[t]=(tagc[t]||0)+1})});
  var tags=Object.keys(tagc).sort();
  var chips=$('chips'),grid=$('grid'),cur='all',cards=[];
  function chip(t,label,n){var b=el('button','fchip',label,chips);b.type='button';b.setAttribute('aria-pressed',t==='all');el('span',null,String(n),b);b.dataset.t=t;
    b.onclick=function(){cur=t;chips.querySelectorAll('.fchip').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.t===t)});filter()}}
  chip('all','All',C.units.length);tags.forEach(function(t){chip(t,t,tagc[t])});
  var pb=el('button','fchip',null,chips);pb.id='pausebtn';pb.type='button';pb.setAttribute('aria-pressed','false');pb.textContent='Pause previews';
  pb.onclick=function(){var p=document.body.classList.toggle('paused');pb.setAttribute('aria-pressed',p)};
  if(RM){document.body.classList.add('paused');pb.disabled=true;pb.textContent='Previews off (reduced motion)'}
  var U=C.units.slice().sort(function(a,b){return b.tokens-a.tokens});
  U.forEach(function(u,i){
    var c=el('article','card u rise',null,grid);c.tabIndex=0;c._u=u;c.style.setProperty('--i',i%8);
    var mo=motif(u),gl=el('div','glyph '+u.kind+' m-'+mo,null,c);gl.setAttribute('aria-hidden','true');for(var k=0;k<MOTIF_N[mo];k++)el('i',null,null,gl).style.setProperty('--k',k);
    el('h4',null,u.name,c);el('div','meta',u.kind+' · '+fmt(u.tokens)+' tok',c);
    var m=el('div','mini',null,c);
    ['PEI','OVS','CRI','SRS'].forEach(function(k){var v=u.scores[k];el('span',null,k,m);var b=el('div','bar'+(v<60?' w':''),null,m);var f=el('i',null,null,b);f.style.setProperty('--w',Math.min(v,100)/100);b.setAttribute('title',k+' '+Math.round(v))});
    c.setAttribute('aria-label',u.name+', '+u.kind+', '+u.tokens+' tokens, PEI '+Math.round(u.scores.PEI)+(u.flags.length?', flags: '+u.flags.join(', '):''));
    if(u.flags.length)el('div','flag','⚠ '+u.flags.join(', '),c);
    cards.push(c);reveal(c);
  });
  function filter(){
    var first=new Map();cards.forEach(function(c){if(!c.hidden)first.set(c,c.getBoundingClientRect())});
    cards.forEach(function(c){c.hidden=!(cur==='all'||c._u.tags.indexOf(cur)>-1)});
    if(RM)return;
    cards.forEach(function(c){if(c.hidden)return;var o=first.get(c),n=c.getBoundingClientRect();
      if(o)c.animate([{transform:'translate('+(o.left-n.left)+'px,'+(o.top-n.top)+'px)'},{transform:'none'}],{duration:450,easing:'cubic-bezier(.16,1,.3,1)'});
      else c.animate([{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'none'}],{duration:350,easing:'cubic-bezier(.16,1,.3,1)'})});
  }
}

/* ---- log ---- */
function log(C){
  var by={};C.findings.forEach(function(f){(by[f.category]=by[f.category]||[]).push(f)});
  var d=$('drawers'),cs=Object.keys(by);
  if(!cs.length)el('p','empty','No findings.',d);
  var order={high:0,med:1,low:2};
  cs.forEach(function(c,i){
    var dt=el('details',null,null,d);if(i===0)dt.open=true;
    var sm=el('summary',null,c,dt);el('span',null,String(by[c].length),sm);
    by[c].sort(function(a,b){return order[a.severity]-order[b.severity]}).forEach(function(f){
      var r=el('div','f',null,dt),h=el('div',null,null,r);
      el('span','sev '+f.severity,f.severity,h);
      var a=el('a',null,f.path,h);if(SAFE.test(f.path)&&f.path.indexOf('..')<0){a.href=REPO+'/blob/main/'+f.path;a.target='_blank';a.rel='noopener noreferrer'}
      el('p',null,f.detail,r);
    });
  });
}

load().then(function(d){try{render(d)}catch(x){fallback()}},function(){fallback()});
})();
