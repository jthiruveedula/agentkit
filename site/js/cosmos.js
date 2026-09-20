// agentkit cosmos — a fully-3D marketing site in one fixed scene.
//
// One WebGL canvas lives behind the whole page. Scrolling travels the camera
// through authored stations (hero core -> install monoliths -> skill galaxy
// -> finale overview); dragging orbits locally; clicking a node focuses it.
//
// Built with guidance from the 3dviz-pro-max skill:
//  - style-neon-noir-rain: colour is borrowed, not painted — near-neutral
//    albedos, every saturated pixel comes from a neon emitter; two opposed
//    hues (cyan #22d3ee / violet #a78bfa) plus one warm practical note;
//    FogExp2 separates depth planes; glow comes from additive sprites
//    (no postprocessing bloom is vendored, so bloom is faked, never assumed).
//  - hero-and-context: the core emblem owns the hero; supporting rings,
//    beams and dust create context without competing for contrast.
//  - navigable-density-rest-areas: stations are stable targets with a home
//    action (Esc / logo click), bounded orbit, and a keyboard route to every
//    focus target; scroll never strands the camera inside geometry.
//
// three.js r169 is vendored locally (js/vendor/three.module.js) and imported
// through the importmap name "three": zero network requests at runtime.
import * as THREE from "three";

const CANVAS = document.getElementById("cosmos");
const TOOLTIP = document.getElementById("node-tip");
const PANEL = document.getElementById("detail-panel");

// ---------------------------------------------------------------------------
// Palette — mirrors tokens.css (Neon Indigo) so DOM and WebGL read as one.
// ---------------------------------------------------------------------------
const INK_BG = 0x05060f;
const CYAN = 0x22d3ee;
const VIOLET = 0xa78bfa;
const PINK = 0xf472b6;
const WARM = 0xd97757; // single warm practical, per neon-noir discipline

// Real logo path data — same source as assets/logo-sprite.svg (kept so the
// orbiting platform nodes carry the true marks, not approximations).
const TOOLS = [
  {
    id: "claude", name: "Claude Code",
    desc: "Skills, agents, and CLAUDE.md — symlinked into ~/.claude.",
    ink: 0xd97757, viewBox: [0, 0, 24, 24],
    path: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  },
  {
    id: "copilot", name: "GitHub Copilot",
    desc: "AGENTS.md contract + user-level copilot-instructions.md.",
    ink: 0xf5efe8, viewBox: [0, 0, 24, 24],
    path: "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z",
  },
  {
    id: "cursor", name: "Cursor",
    desc: "Rules symlinked into ~/.cursor/rules + a shared AGENTS.md.",
    ink: 0xf5efe8, viewBox: [0, 0, 24, 24],
    path: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23",
  },
  {
    id: "antigravity", name: "Antigravity",
    desc: "Rules + workflows in ~/.antigravity, Google's agentic IDE.",
    ink: 0x5b9dff, viewBox: [0, 0, 115, 113],
    path: "M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z",
  },
];

const INSTALL_CHANNELS = [
  { title: "macOS / Linux", cmd: "git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit && cd ~/agentkit && ./install.sh" },
  { title: "Windows", cmd: "git clone https://github.com/jthiruveedula/agentkit.git $HOME\\agentkit\ncd $HOME\\agentkit; .\\install.ps1" },
  { title: "npx", cmd: "npx github:jthiruveedula/agentkit" },
  { title: "uvx", cmd: "uvx --from git+https://github.com/jthiruveedula/agentkit agentkit" },
  { title: "make", cmd: "git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit && cd ~/agentkit && make install" },
];

// Budget caps (kept from the previous hero; the full scene must stay cheap).
const MAX_DPR_DESKTOP = 2;
const MAX_DPR_SMALL = 1.5;
const SMALL_SCREEN_PX = 640;
const MAX_STARS = 1400;
const MAX_DUST = 320;

// Zone anchors along -Z; fog separates them into depth planes.
const GALAXY_Z = -70;
const INSTALL_Z = -140;

// ---------------------------------------------------------------------------
// Canvas texture helpers (all procedural — no external assets, no network).
// ---------------------------------------------------------------------------
function makeGlowTexture(hex, innerAlpha = 0.85) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = `#${hex.toString(16).padStart(6, "0")}`;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255,255,255,${innerAlpha})`);
  g.addColorStop(0.25, c + "cc");
  g.addColorStop(0.6, c + "44");
  g.addColorStop(1, c + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMarkTexture(tool) {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2 - 6;
  ctx.fillStyle = "#0d1126";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();
  const [minX, minY, vw, vh] = tool.viewBox;
  const pad = size * 0.28;
  const scale = Math.min((size - pad * 2) / vw, (size - pad * 2) / vh);
  ctx.save();
  ctx.translate(size / 2 - (vw * scale) / 2 - minX * scale, size / 2 - (vh * scale) / 2 - minY * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = `#${tool.ink.toString(16).padStart(6, "0")}`;
  ctx.fill(new Path2D(tool.path));
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelTexture(text, { color = "#edf0ff", font = 600, px = 40, pad = 26, glow = null } = {}) {
  const meas = document.createElement("canvas").getContext("2d");
  meas.font = `${font} ${px}px ui-monospace, Menlo, Consolas, monospace`;
  const w = Math.ceil(meas.measureText(text).width) + pad * 2;
  const h = px + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.font = `${font} ${px}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = "middle";
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / h };
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    // hard-break tokens that can never fit (long URLs / commands)
    let w = word;
    while (ctx.measureText(line + w).width > maxWidth && w.length > 1) {
      let cut = Math.max(1, Math.floor(w.length * (maxWidth / ctx.measureText(line + w).width)) - 1);
      lines.push((line + w.slice(0, cut)).trimEnd());
      w = w.slice(cut);
      line = "";
    }
    if (ctx.measureText((line + " " + w).trim()).width > maxWidth && line) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += (line ? " " : "") + w;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function makeCommandTexture({ title, cmd }) {
  const W = 1024;
  const H = 380;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  // dark glass plaque
  ctx.fillStyle = "rgba(10, 13, 30, 0.94)";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "rgba(34, 211, 238, 0.10)";
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 24);
  ctx.fill();
  // title
  ctx.fillStyle = "#22d3ee";
  ctx.font = "700 46px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(title, 48, 92);
  // command, wrapped
  ctx.fillStyle = "#edf0ff";
  ctx.font = "400 33px ui-monospace, Menlo, Consolas, monospace";
  const lines = wrapLines(ctx, cmd, W - 96);
  lines.slice(0, 6).forEach((l, i) => ctx.fillText(l, 48, 168 + i * 46));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------
function boot(skills) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < SMALL_SCREEN_PX;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: CANVAS, antialias: !smallScreen, alpha: false, powerPreference: "low-power" });
  } catch {
    document.body.classList.add("no-webgl");
    return null;
  }
  if (!renderer.getContext()) {
    document.body.classList.add("no-webgl");
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallScreen ? MAX_DPR_SMALL : MAX_DPR_DESKTOP));
  renderer.setClearColor(INK_BG, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(INK_BG, 0.023);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  // Lighting rig: dim ambient + one practical per zone (emitter ownership is
  // explicit — each neon cluster gets its own light, per the skill's
  // emissive-practical-light-balance guidance).
  scene.add(new THREE.AmbientLight(0x8a94c8, 0.5));
  const heroLight = new THREE.PointLight(CYAN, 90, 34, 2);
  heroLight.position.set(0, 2.5, 3);
  scene.add(heroLight);
  const galaxyLight = new THREE.PointLight(VIOLET, 140, 55, 2);
  galaxyLight.position.set(0, 6, GALAXY_Z);
  scene.add(galaxyLight);
  const installLight = new THREE.PointLight(PINK, 90, 40, 2);
  installLight.position.set(0, 4, INSTALL_Z + 4);
  scene.add(installLight);
  const warmPractical = new THREE.PointLight(WARM, 26, 22, 2); // the one warm note
  warmPractical.position.set(6, -2, INSTALL_Z + 10);
  scene.add(warmPractical);

  const glowCyan = makeGlowTexture(CYAN);
  const glowViolet = makeGlowTexture(VIOLET);
  const glowPink = makeGlowTexture(PINK);

  // ---- global starfield: one draw call, static when reduced motion ----
  {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_STARS * 3);
    for (let i = 0; i < MAX_STARS; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 150;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 2] = 25 - Math.random() * 200;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x9aa3d6, size: 0.14, transparent: true, opacity: 0.6, sizeAttenuation: true, depthWrite: false })
    );
    stars.name = "starfield";
    scene.add(stars);
  }

  // ================= HERO STATION — the core emblem =================
  const hero = new THREE.Group();
  scene.add(hero);
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 1),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.3, metalness: 0.5, emissive: CYAN, emissiveIntensity: 1.6 })
  );
  hero.add(core);
  const coreWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.12, 1),
    new THREE.MeshBasicMaterial({ color: VIOLET, wireframe: true, transparent: true, opacity: 0.4 })
  );
  hero.add(coreWire);
  const coreGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowCyan, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  coreGlow.scale.set(6.5, 6.5, 1);
  hero.add(coreGlow);
  // two neon tube rings framing the core
  for (const [radius, color, tiltX, tiltZ, tube] of [[2.6, CYAN, 0.5, 0.2, 0.035], [3.4, VIOLET, -0.4, -0.3, 0.028]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 128),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    ring.rotation.set(tiltX, 0, tiltZ);
    hero.add(ring);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: color === CYAN ? glowCyan : glowViolet, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    halo.scale.set(radius * 2.6, radius * 2.6, 1);
    hero.add(halo);
  }

  // four orbiting platform nodes, beamed to the core
  const toolNodes = TOOLS.map((tool, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeMarkTexture(tool), transparent: true, depthWrite: false }));
    const base = 1.15;
    sprite.scale.set(base, base, 1);
    sprite.userData = { tool, kind: "tool", baseScale: base, angle: (i / TOOLS.length) * Math.PI * 2, bobPhase: i * 1.9 };
    hero.add(sprite);
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const beam = new THREE.Line(
      beamGeo,
      new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
    );
    hero.add(beam);
    return { sprite, beam, tool };
  });

  // ================= GALAXY STATION — 28 skill nodes =================
  const galaxy = new THREE.Group();
  galaxy.position.set(0, 0, GALAXY_Z);
  galaxy.rotation.x = -0.1;
  scene.add(galaxy);

  // hub: wireframe torus + glowing heart + "28" glyph
  const hub = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.05, 10, 72),
    new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.85 })
  );
  hub.rotation.x = Math.PI / 2.4;
  galaxy.add(hub);
  const hubCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: VIOLET, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.4 })
  );
  galaxy.add(hubCore);
  const hubGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowViolet, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  hubGlow.scale.set(5, 5, 1);
  galaxy.add(hubGlow);
  {
    const { tex, aspect } = makeLabelTexture("28 SKILLS", { color: "#e9e4ff", px: 44, glow: "#a78bfa" });
    const hubLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95 }));
    hubLabel.scale.set(2.6 * aspect, 2.6, 1);
    hubLabel.position.set(0, 2.6, 0);
    galaxy.add(hubLabel);
  }

  const skillNodes = [];
  const natives = skills.filter((s) => s.kind !== "router");
  const routers = skills.filter((s) => s.kind === "router");
  function addSkillNode(skill, angle, radius, y, accent, glowMap, labelAbove) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshStandardMaterial({
        color: 0x0b1020, roughness: 0.28, metalness: 0.55,
        emissive: accent, emissiveIntensity: 1.5, transparent: true,
      })
    );
    mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowMap, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.scale.set(2.6, 2.6, 1);
    glow.position.copy(mesh.position);
    const { tex, aspect } = makeLabelTexture(skill.name, { color: "#dfe6ff", px: 34, glow: "#22d3ee" });
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.92 }));
    const lw = 1.7;
    label.scale.set(lw * aspect, lw, 1);
    // stagger: alternate labels above/below their node to halve collisions
    label.position.set(mesh.position.x, mesh.position.y + (labelAbove ? 1.15 : -1.45), mesh.position.z);
    mesh.userData = { skill, kind: "skill", accent, baseY: y, phase: Math.random() * Math.PI * 2, label, glow, dimT: 1 };
    galaxy.add(mesh, glow, label);
    skillNodes.push({ mesh, glow, label, skill });
    return mesh;
  }
  natives.forEach((s, i) => {
    const t = i / Math.max(natives.length - 1, 1);
    addSkillNode(s, i * 2.39996, 9 + 11 * t, Math.sin(i * 1.7) * 1.8, CYAN, glowCyan, i % 2 === 0);
  });
  routers.forEach((s, i) => {
    addSkillNode(s, (i / routers.length) * Math.PI * 2 + 0.35, 24.5, Math.sin(i * 2.3) * 2.8, VIOLET, glowViolet, i % 2 === 0);
  });

  // faint constellation web: hub -> each node, additive and dim
  {
    const pts = [];
    for (const { mesh } of skillNodes) pts.push(0, 0, 0, mesh.position.x, mesh.position.y, mesh.position.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    galaxy.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3b4470, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })));
  }
  // galaxy dust motes
  {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_DUST * 3);
    for (let i = 0; i < MAX_DUST; i++) {
      const r = 5 + Math.random() * 24;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 5;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x67e8f9, size: 0.09, transparent: true, opacity: 0.5, depthWrite: false }));
    dust.name = "dust";
    galaxy.add(dust);
  }

  // ================= INSTALL STATION — command monoliths =================
  const install = new THREE.Group();
  install.position.set(5.5, 0, INSTALL_Z); // offset right: clears the text column
  scene.add(install);
  INSTALL_CHANNELS.forEach((ch, i) => {
    const a = (i / (INSTALL_CHANNELS.length - 1) - 0.5) * 1.15; // arc
    const tex = makeCommandTexture(ch);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 3.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    plaque.position.set(Math.sin(a) * 11, 1.4 + Math.cos(i * 2.1) * 0.35, -Math.cos(a) * 2.5);
    plaque.rotation.y = -a * 0.9;
    plaque.userData = { kind: "plaque", baseY: plaque.position.y, phase: i * 1.3 };
    install.add(plaque);
    const edge = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowPink, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    edge.scale.set(10.5, 5.2, 1);
    edge.position.copy(plaque.position);
    edge.position.z -= 0.15;
    install.add(edge);
  });
  // rising data motes
  {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf472b6, size: 0.1, transparent: true, opacity: 0.55, depthWrite: false }));
    motes.name = "motes";
    install.add(motes);
  }

  // ---------------------------------------------------------------------------
  // Stations: scroll-driven camera poses (DOM order = travel order).
  // ---------------------------------------------------------------------------
  const STATIONS = [
    { pos: new THREE.Vector3(0, 1.8, 10.5), look: new THREE.Vector3(0, 0.2, 0) },                 // hero
    { pos: new THREE.Vector3(0, 3.2, INSTALL_Z + 14), look: new THREE.Vector3(0, 1.0, INSTALL_Z) }, // install
    { pos: new THREE.Vector3(0, 24, GALAXY_Z + 24), look: new THREE.Vector3(0, 0.8, GALAXY_Z) }, // galaxy — high oblique
    { pos: new THREE.Vector3(0, 17, 30), look: new THREE.Vector3(0, 0, -72) },                     // finale
  ];
  const zoneEls = Array.from(document.querySelectorAll("[data-zone]"));
  const zoneIndex = { hero: 0, install: 1, galaxy: 2, finale: 3 };
  let zoneTops = [];
  function measureZones() {
    const sy = window.scrollY;
    zoneTops = zoneEls.map((el) => ({ top: el.getBoundingClientRect().top + sy, zone: zoneIndex[el.dataset.zone] ?? 0 }));
    zoneTops.sort((a, b) => a.top - b.top);
  }

  const camState = {
    stationT: 0, targetStationT: 0,
    yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, // user orbit offsets (decay to 0)
    focus: null, // { node, skill } when a node is focused
    tween: null, // camera tween { p0,p1,l0,l1,t,dur }
  };

  function stationTForScroll() {
    const center = window.scrollY + window.innerHeight * 0.5;
    if (!zoneTops.length) return 0;
    let zi = 0;
    for (let i = 0; i < zoneTops.length; i++) {
      if (center >= zoneTops[i].top) zi = i;
    }
    const cur = zoneTops[zi];
    const next = zoneTops[zi + 1];
    let t = cur.zone;
    if (next && next.top > cur.top) {
      const p = Math.min(Math.max((center - cur.top) / (next.top - cur.top), 0), 1);
      const e = p * p * (3 - 2 * p);
      t = cur.zone + (next.zone - cur.zone) * e;
    }
    return t;
  }

  function poseAt(t, outPos, outLook) {
    const i = Math.min(Math.floor(t), STATIONS.length - 2);
    const f = Math.min(Math.max(t - i, 0), 1);
    const e = f * f * (3 - 2 * f);
    outPos.lerpVectors(STATIONS[i].pos, STATIONS[i + 1].pos, e);
    outLook.lerpVectors(STATIONS[i].look, STATIONS[i + 1].look, e);
  }

  // ---- user orbit: drag to orbit (fine pointers only; touch keeps scroll) ----
  let dragging = false, lastX = 0, lastY = 0, dragDist = 0;
  if (finePointer) {
    CANVAS.style.touchAction = "pan-y";
    CANVAS.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (e.button !== 0) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY; dragDist = 0;
      CANVAS.setPointerCapture?.(e.pointerId);
    });
    CANVAS.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
      camState.tYaw = Math.max(-0.6, Math.min(0.6, camState.tYaw - dx * 0.0035));
      camState.tPitch = Math.max(-0.35, Math.min(0.35, camState.tPitch - dy * 0.0028));
    });
    const endDrag = () => { dragging = false; };
    CANVAS.addEventListener("pointerup", (e) => {
      const wasTap = dragDist < 6;
      endDrag();
      if (wasTap) handleTap(e.clientX, e.clientY);
    });
    CANVAS.addEventListener("pointercancel", endDrag);
  } else {
    CANVAS.addEventListener("click", (e) => handleTap(e.clientX, e.clientY));
  }

  // ---- picking ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [
    ...toolNodes.map((n) => n.sprite),
    ...skillNodes.map((n) => n.mesh),
  ];
  pickables.forEach((o) => { o.userData.pickRoot = o; });

  function castAt(cx, cy) {
    ndc.x = (cx / window.innerWidth) * 2 - 1;
    ndc.y = -(cy / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object : null;
  }

  function handleTap(cx, cy) {
    // taps on HTML controls never reach here (they're above the canvas)
    const obj = castAt(cx, cy);
    if (!obj) { clearFocus(); return; }
    if (obj.userData.kind === "skill") focusSkill(obj.userData.skill.name, obj);
    else if (obj.userData.kind === "tool") showPanel({ type: "tool", ...obj.userData.tool });
  }

  CANVAS.addEventListener("pointermove", (e) => {
    if (dragging || !finePointer) return;
    const obj = castAt(e.clientX, e.clientY);
    CANVAS.style.cursor = obj ? "pointer" : "";
    if (TOOLTIP) {
      if (obj && (obj.userData.kind === "skill" || obj.userData.kind === "tool")) {
        const d = obj.userData;
        const label = d.kind === "skill" ? d.skill.name : d.tool.name;
        const sub = d.kind === "skill" ? d.skill.kind : "platform";
        TOOLTIP.innerHTML = `<strong>${label}</strong><span>${sub}</span>`;
        TOOLTIP.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`;
        TOOLTIP.classList.add("is-visible");
      } else {
        TOOLTIP.classList.remove("is-visible");
      }
    }
    // hover glow on skill nodes
    for (const { mesh } of skillNodes) mesh.userData.hoverT = mesh === obj ? 1 : 0;
    for (const { sprite } of toolNodes) sprite.userData.hoverT = sprite === obj ? 1 : 0;
  });
  CANVAS.addEventListener("pointerleave", () => TOOLTIP?.classList.remove("is-visible"));

  // ---- detail panel ----
  function showPanel(data) {
    if (!PANEL) return;
    const isSkill = data.type === "skill";
    PANEL.querySelector(".detail-panel__eyebrow").textContent = isSkill ? `${data.kind} skill · v${data.version}` : "platform integration";
    PANEL.querySelector(".detail-panel__title").textContent = data.name;
    PANEL.querySelector(".detail-panel__desc").textContent = data.desc || data.description || "";
    const link = PANEL.querySelector(".detail-panel__link");
    if (isSkill) {
      link.href = `https://github.com/jthiruveedula/agentkit/tree/main/skills/${data.name}`;
      link.textContent = `skills/${data.name} →`;
      link.style.display = "";
    } else link.style.display = "none";
    PANEL.classList.add("is-open");
    PANEL.setAttribute("aria-hidden", "false");
    PANEL.querySelector(".detail-panel__close").focus({ preventScroll: true });
  }
  function hidePanel() { PANEL?.classList.remove("is-open"); PANEL?.setAttribute("aria-hidden", "true"); }
  PANEL?.querySelector(".detail-panel__close").addEventListener("click", () => { hidePanel(); clearFocus(); });

  // ---- focus ----
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  function focusSkill(name, obj) {
    const node = skillNodes.find((n) => n.skill.name === name);
    if (!node) return;
    const target = obj || node.mesh;
    target.getWorldPosition(_v1);
    _v2.copy(_v1).sub(new THREE.Vector3(0, 0, GALAXY_Z)).normalize();
    _v3.copy(_v1).addScaledVector(_v2, 5.2).add(new THREE.Vector3(0, 2.4, 0));
    camState.focus = { node, skill: node.skill };
    camState.focusAt = performance.now();
    camState.tween = {
      p0: camera.position.clone(), p1: _v3.clone(),
      l0: currentLook.clone(), l1: _v1.clone(), t: 0, dur: 1.15,
    };
    // dim everything except the focused node
    for (const n of skillNodes) n.mesh.userData.focusDim = n === node ? 0 : 1;
    showPanel({ type: "skill", ...node.skill });
    document.querySelector("#skills")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  }
  function clearFocus() {
    if (!camState.focus && !PANEL?.classList.contains("is-open")) return;
    camState.focus = null;
    camState.tween = null;
    for (const n of skillNodes) n.mesh.userData.focusDim = 0;
    hidePanel();
  }
  // scrolling abandons a focus (rest-area rule: the tour resumes) —
  // except the programmatic scroll that focusSkill itself triggers
  window.addEventListener("scroll", () => {
    if (camState.focus && performance.now() - (camState.focusAt || 0) > 1200) clearFocus();
    camState.targetStationT = stationTForScroll();
    if (reducedMotion) { camState.stationT = camState.targetStationT; renderStatic(); }
  }, { passive: true });

  // keyboard route to every focus target (non-pointer access, per skill)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { clearFocus(); return; }
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    // only hijack arrows when the galaxy is on screen or a node is focused
    const skillsRect = document.getElementById("skills")?.getBoundingClientRect();
    const galaxyVisible = skillsRect && skillsRect.top < window.innerHeight && skillsRect.bottom > 0;
    if (!galaxyVisible && !camState.focus && !PANEL?.classList.contains("is-open")) return;
    const idx = skillNodes.findIndex((n) => camState.focus?.node === n);
    if (e.key === "]" || e.key === "ArrowRight") {
      const n = skillNodes[(idx + 1 + skillNodes.length) % skillNodes.length];
      focusSkill(n.skill.name, n.mesh);
    } else if (e.key === "[" || e.key === "ArrowLeft") {
      const n = skillNodes[(idx - 1 + skillNodes.length) % skillNodes.length];
      focusSkill(n.skill.name, n.mesh);
    }
  });
  // logo click = home
  document.querySelector(".nav-pill__wordmark")?.addEventListener("click", () => clearFocus());

  // ---- filter bridge (search + facets dim the galaxy, never delete nodes) ----
  function setFilter(visibleNames) {
    for (const { mesh } of skillNodes) {
      const vis = !visibleNames || visibleNames.has(mesh.userData.skill.name);
      mesh.userData.filterDim = vis ? 0 : 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const currentLook = new THREE.Vector3(0, 0.2, 0);
  const _wp = new THREE.Vector3();

  function layoutDynamic(t, dt) {
    // hero tool nodes: orbit + bob (+ hover scale)
    for (const { sprite, beam } of toolNodes) {
      const u = sprite.userData;
      const a = u.angle + (reducedMotion ? 0 : t * 0.22);
      const R = 3.2;
      const bob = reducedMotion ? 0 : Math.sin(t * 1.1 + u.bobPhase) * 0.14;
      sprite.position.set(Math.cos(a) * R, Math.sin(a) * R * 0.42 + bob, Math.sin(a) * R * 0.91);
      const p = beam.geometry.attributes.position;
      p.setXYZ(0, 0, 0, 0);
      p.setXYZ(1, sprite.position.x, sprite.position.y, sprite.position.z);
      p.needsUpdate = true;
      const target = u.baseScale * (u.hoverT ? 1.25 : 1);
      const s = sprite.scale.x + (target - sprite.scale.x) * Math.min(dt * 10, 1);
      sprite.scale.set(s, s, 1);
    }
    if (!reducedMotion) {
      core.rotation.y += dt * 0.18;
      coreWire.rotation.y -= dt * 0.12;
      coreWire.rotation.x += dt * 0.05;
      const breathe = 1 + 0.03 * Math.sin(t * 1.4);
      core.scale.setScalar(breathe);
      coreGlow.material.opacity = 0.7 + 0.18 * Math.sin(t * 1.4);
      heroLight.intensity = 90 + 22 * Math.sin(t * 1.4);
      hub.rotation.z += dt * 0.25;
      hubCore.rotation.y += dt * 0.4;
    }
    // skill nodes: bob, hover/focus/filter dimming
    for (const { mesh, glow, label } of skillNodes) {
      const u = mesh.userData;
      if (!reducedMotion) {
        mesh.position.y = u.baseY + Math.sin(t * 0.9 + u.phase) * 0.22;
        mesh.rotation.y += dt * 0.5;
        glow.position.copy(mesh.position);
        label.position.set(mesh.position.x, mesh.position.y + 1.05, mesh.position.z);
      }
      const dim = Math.max(u.filterDim || 0, u.focusDim || 0);
      u.dimT += ((1 - dim) - u.dimT) * Math.min(dt * 6, 1);
      const hoverBoost = (u.hoverT ? 0.9 : 0) + (camState.focus?.node.mesh === mesh ? 1.2 : 0);
      mesh.material.emissiveIntensity = (1.5 + hoverBoost) * u.dimT + 0.02;
      mesh.material.opacity = 0.15 + 0.85 * u.dimT;
      glow.material.opacity = 0.55 * u.dimT + (u.hoverT ? 0.3 : 0);
      label.material.opacity = 0.92 * u.dimT;
      const s = 1 + (u.hoverT ? 0.22 : 0);
      mesh.scale.setScalar(s);
    }
    // install plaques: gentle float
    install.children.forEach((o) => {
      if (o.userData.kind === "plaque" && !reducedMotion) {
        o.position.y = o.userData.baseY + Math.sin(t * 0.7 + o.userData.phase) * 0.18;
      }
    });
  }

  function renderFrame(t, dt) {
    // station follow (disabled while a node is focused)
    if (!camState.focus) {
      const k = reducedMotion ? 1 : 1 - Math.pow(0.002, dt);
      camState.stationT += (camState.targetStationT - camState.stationT) * k;
    }
    // camera tween (focus transitions) overrides the station pose
    if (camState.tween) {
      const tw = camState.tween;
      tw.t = Math.min(tw.t + dt / tw.dur, 1);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
      camPos.lerpVectors(tw.p0, tw.p1, e);
      currentLook.lerpVectors(tw.l0, tw.l1, e);
      if (tw.t >= 1) camState.tween = null;
    } else if (!camState.focus) {
      poseAt(camState.stationT, camPos, camLook);
      // idle sway + user orbit offsets on top of the authored pose
      const sway = reducedMotion ? 0 : Math.sin(t * 0.24) * 0.14;
      camState.yaw += (camState.tYaw - camState.yaw) * Math.min(dt * 5, 1);
      camState.pitch += (camState.tPitch - camState.tPitch) * Math.min(dt * 5, 1);
      camState.tYaw *= 1 - Math.min(dt * 0.25, 0.9); // orbit offsets decay: the tour always wins
      camState.tPitch *= 1 - Math.min(dt * 0.25, 0.9);
      _v1.copy(camPos).sub(camLook);
      const r = _v1.length();
      const baseTheta = Math.atan2(_v1.x, _v1.z);
      const basePhi = Math.acos(Math.min(Math.max(_v1.y / r, -1), 1));
      const theta = baseTheta + camState.yaw + sway * 0.3;
      const phi = Math.min(Math.max(basePhi + camState.pitch + sway * 0.12, 0.2), Math.PI - 0.2);
      camPos.set(
        camLook.x + r * Math.sin(phi) * Math.sin(theta),
        camLook.y + r * Math.cos(phi),
        camLook.z + r * Math.sin(phi) * Math.cos(theta)
      );
      currentLook.copy(camLook);
    } else {
      // focused: slow orbital drift around the node
      const n = camState.focus.node.mesh;
      n.getWorldPosition(_wp);
      if (!reducedMotion) {
        const a = t * 0.18;
        _v1.set(_wp.x + Math.sin(a) * 5.4, _wp.y + 2.6, _wp.z + Math.cos(a) * 5.4);
        camPos.lerp(_v1, Math.min(dt * 2.2, 1));
      }
      currentLook.lerp(_wp, Math.min(dt * 4, 1));
    }

    camera.position.copy(camPos);
    camera.lookAt(currentLook);
    layoutDynamic(t, dt);
    renderer.render(scene, camera);
  }

  function renderStatic() {
    renderFrame(performance.now() / 1000, 0.016);
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    measureZones();
    if (reducedMotion) renderStatic();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("load", measureZones); // late assets can shift section offsets

  // ---- main loop: paused when the tab is hidden ----
  let rafId = 0, last = performance.now(), running = true;
  function tick(now) {
    rafId = 0;
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    renderFrame(now / 1000, dt);
    rafId = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
    else if (!reducedMotion) { running = true; last = performance.now(); if (!rafId) rafId = requestAnimationFrame(tick); }
  });

  measureZones();
  camState.targetStationT = stationTForScroll();
  resize();

  if (reducedMotion) {
    camState.stationT = camState.targetStationT;
    renderStatic(); // parked: one static frame per scroll position
  } else {
    camState.stationT = camState.targetStationT;
    rafId = requestAnimationFrame(tick);
  }

  // public bridge for main.js (catalog search/facets, accessible list)
  return { setFilter, focusSkill, clearFocus, skillCount: skillNodes.length };
}

// ---------------------------------------------------------------------------
// Entry: fetch the catalog (same source of truth as the DOM list), then boot.
// ---------------------------------------------------------------------------
fetch("assets/skills.json", { cache: "no-store" })
  .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
  .then((data) => {
    const skills = Array.isArray(data.skills) ? data.skills : [];
    if (!CANVAS) return;
    if (!supportsWebGL()) { document.body.classList.add("no-webgl"); return; }
    const api = boot(skills);
    if (api) {
      window.agentkitCosmos = api;
      document.body.classList.add("cosmos-ready");
      window.dispatchEvent(new CustomEvent("cosmos:ready", { detail: { skillCount: api.skillCount } }));
    }
  })
  .catch(() => document.body.classList.add("no-webgl"));
