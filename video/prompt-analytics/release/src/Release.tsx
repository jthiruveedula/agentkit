// Release video for the prompt-analytics dashboard (PRs #134, #135). MOCK data only.
// Timeline + captions come from build_audio.py (whisperX); charts from manim/scenes.py.
import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, cancelRender, continueRender, delayRender,
  staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import captions from "../public/captions.json";
import tl from "./timeline.json";

const C = { bg: "#E7EDF6", card: "#FFFFFF", line: "#DADEE3", ink: "#11161F", muted: "#575E69", accent: "#1957D2", soft: "#E4EFFF", good: "#1C8742", bad: "#C9302D" };
const SANS = '"Avenir Next", "Helvetica Neue", sans-serif';
const MONO = '"SF Mono", Menlo, monospace';
const EASE = Easing.bezier(0.2, 0, 0, 1); // Corporate signature curve (LottieFiles motion-design)
const S = Object.fromEntries(tl.scenes.map((s) => [s.id, s]));

const ease = (f: number, from: number, to: number) =>
  interpolate(f, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });

/** Entrance: 24px rise + fade, 12 frames (400ms) from `at`. */
const In = ({ at = 0, children, style }: { at?: number; children: ReactNode; style?: CSSProperties }) => {
  const p = ease(useCurrentFrame(), at, at + 12);
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>{children}</div>;
};

/** Scene wrapper: 8-frame fade in/out so cuts dissolve. */
const Scene = ({ frames, children }: { frames: number; children: ReactNode }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const useLottie = (file: string) => {
  const [h] = useState(() => delayRender("lottie " + file));
  const [data, set] = useState<LottieAnimationData | null>(null);
  useEffect(() => {
    fetch(staticFile(file)).then((r) => r.json()).then((j) => { set(j); continueRender(h); }).catch(cancelRender);
  }, [file, h]);
  return data;
};

const Eyebrow = ({ children, color = C.accent }: { children: ReactNode; color?: string }) => (
  <div style={{ display: "inline-flex", gap: 14, alignItems: "center", padding: "10px 22px", borderRadius: 999, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, font: `600 22px ${MONO}`, letterSpacing: ".06em", textTransform: "uppercase", color }}>
    <span style={{ width: 10, height: 10, borderRadius: 5, background: color }} />{children}
  </div>
);

/** Left text column for the Manim chart scenes (chart card starts at x~757px). */
const Claim = ({ eyebrow, title, sub, color = C.accent }: { eyebrow: string; title: ReactNode; sub: string; color?: string }) => (
  <div style={{ position: "absolute", left: 96, top: 210, width: 600 }}>
    <In at={4}><Eyebrow color={color}>{eyebrow}</Eyebrow></In>
    <In at={8}><div style={{ marginTop: 34, font: `600 64px/1.06 ${SANS}`, letterSpacing: "-.02em", color: C.ink }}>{title}</div></In>
    <In at={14}><div style={{ marginTop: 28, font: `400 24px/1.45 ${MONO}`, color: C.muted }}>{sub}</div></In>
  </div>
);

const Em = ({ c, children }: { c: string; children: ReactNode }) => <span style={{ color: c }}>{children}</span>;

const ChartScene = ({ file, ...claim }: { file: string; eyebrow: string; title: ReactNode; sub: string; color?: string }) => (
  <AbsoluteFill>
    <OffthreadVideo src={staticFile(`manim/${file}.mp4`)} muted />
    <Claim {...claim} />
  </AbsoluteFill>
);

/** Screenshot on a tilted card with a slow push-in (focus = fraction of the image to drift toward). */
const Shot = ({ src, frames, focus, tilt = 10, zoom = [1, 1.18] }: { src: string; frames: number; focus: [number, number]; tilt?: number; zoom?: [number, number] }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, frames], [0, 1], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
  const z = zoom[0] + (zoom[1] - zoom[0]) * p;
  const rx = tilt * (1 - ease(f, 0, 40));
  return (
    <AbsoluteFill style={{ perspective: 2200, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1500, height: 938, borderRadius: 22, overflow: "hidden", background: C.card, transform: `rotateX(${rx}deg) translateY(${(1 - ease(f, 0, 30)) * 60}px)`, boxShadow: "0 50px 90px -40px rgba(25,60,130,.45), 0 0 0 1px rgba(17,22,31,.06)" }}>
        <Img src={staticFile(src)} style={{ width: 1500, height: 938, transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`, transform: `scale(${z})` }} />
      </div>
    </AbsoluteFill>
  );
};

/** Ambient layer: soft accent glow drifting behind everything. */
const Ambient = () => {
  const f = useCurrentFrame();
  const x = 70 + 12 * Math.sin(f / 140);
  const y = 20 + 10 * Math.cos(f / 170);
  return <AbsoluteFill style={{ background: `radial-gradient(1100px 700px at ${x}% ${y}%, rgba(25,87,210,.10), transparent 70%), ${C.bg}` }} />;
};

const Open = () => {
  const pulse = useLottie("lottie/pulse.json");
  const f = useCurrentFrame();
  const sh = ease(f, 70, 110);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.22 + 0.5 * sh, transform: `translateX(${520 - 60 * sh}px) scale(.8)`, filter: `blur(${(1 - sh) * 6}px)` }}>
        <Shot src="shots/overview.png" frames={S.open.frames} focus={[0.3, 0.3]} tilt={14} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${C.bg} 38%, rgba(231,237,246,0) 70%)` }} />
      <div style={{ position: "absolute", left: 96, top: 300 }}>
        <In at={2}><div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {pulse && <Lottie animationData={pulse} loop style={{ width: 64, height: 64, margin: -10 }} />}
          <Eyebrow>AgentKit · new release</Eyebrow></div></In>
        <In at={8}><div style={{ marginTop: 34, font: `700 132px/0.95 ${SANS}`, letterSpacing: "-.035em", color: C.ink }}>Prompt<br />Analytics</div></In>
        <In at={16}><div style={{ marginTop: 34, font: `400 36px/1.3 ${SANS}`, color: C.muted, width: 760 }}>What changed in your AI coding, <Em c={C.accent}>and why.</Em></div></In>
      </div>
    </AbsoluteFill>
  );
};

const Dash = () => (
  <AbsoluteFill>
    <AbsoluteFill style={{ top: 40 }}><Shot src="shots/hour3d.png" frames={S.dash.frames} focus={[0.36, 0.3]} zoom={[1.02, 1.5]} /></AbsoluteFill>
    <div style={{ position: "absolute", left: 96, top: 26 }}><In at={6}><Eyebrow>PR #135 · echarts-gl 3D · scroll-in motion</Eyebrow></In></div>
  </AbsoluteFill>
);

/** A dashboard card screenshot (mock data), flat with a soft shadow. */
const Card = ({ src, at }: { src: string; at: number }) => (
  <In at={at}><Img src={staticFile(src)} style={{ width: 760, display: "block", borderRadius: 16, boxShadow: "0 18px 40px -18px rgba(17,22,31,.28)" }} /></In>
);

const Close = () => {
  const check = useLottie("lottie/check.json");
  const f = useCurrentFrame();
  const end = ease(f, 120, 140);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - end, transform: `translateY(${-end * 30}px)` }}>
        <div style={{ position: "absolute", top: 110, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 26 }}>
          {check && <Lottie animationData={check} loop={false} style={{ width: 120, height: 120 }} />}
          <In at={10}><div style={{ font: `600 60px/1.1 ${SANS}`, letterSpacing: "-.02em", color: C.ink }}>Every claim ships with <Em c={C.good}>n</Em> and a <Em c={C.good}>CI</Em>.</div></In>
        </div>
        <div style={{ position: "absolute", left: 96, top: 330 }}><In at={20}><Eyebrow>In the dashboard · PR #136</Eyebrow></In></div>
        <div style={{ position: "absolute", right: 96, top: 290, display: "flex", flexDirection: "column", gap: 20 }}>
          <Card src="shots/curve-retry.png" at={24} /><Card src="shots/curve-length.png" at={30} /><Card src="shots/curve-daypart.png" at={36} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: end, alignItems: "center", justifyContent: "center", transform: `scale(${0.96 + 0.04 * end})` }}>
        <div style={{ font: `600 28px ${MONO}`, letterSpacing: ".08em", color: C.accent }}>AGENTKIT</div>
        <div style={{ marginTop: 12, font: `700 120px/1 ${SANS}`, letterSpacing: "-.035em", color: C.ink }}>Prompt Analytics</div>
        <div style={{ marginTop: 28, font: `400 30px ${MONO}`, color: C.muted }}>uv run prompt-analytics</div>
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 40, width: "100%", textAlign: "center", opacity: end, font: `400 18px ${MONO}`, color: C.muted }}>
        Mock data. Music: “Ambient electronic music 001” by frankum, CC BY 4.0, via Openverse.
      </div>
    </AbsoluteFill>
  );
};

type Cap = (typeof captions)[number];
/** whisperX word captions: one VO line per page, split into chunks of 7 words, current word highlighted. */
const Captions = () => {
  const ms = (useCurrentFrame() / useVideoConfig().fps) * 1000;
  const chunks: Cap[][] = [];
  let page: Cap[] = [];
  captions.forEach((c) => {
    page.push(c);
    if (c.pageBreakAfter) { for (let i = 0; i < page.length; i += 7) chunks.push(page.slice(i, i + 7)); page = []; }
  });
  const cur = chunks.find((ch, i) => ms >= ch[0].startMs - 120 && ms < (chunks[i + 1]?.[0].startMs ?? Infinity) - 120 && ms < ch[ch.length - 1].endMs + 600);
  if (!cur) return null;
  const o = interpolate(ms, [cur[0].startMs - 120, cur[0].startMs + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "0 0 56px 96px" }}>
      <div style={{ opacity: o, maxWidth: 600, padding: "16px 28px", borderRadius: 20, background: "rgba(17,22,31,.88)", font: `500 32px/1.3 ${SANS}`, color: "rgba(255,255,255,.55)" }}>
        {cur.map((w, i) => <span key={i} style={{ color: ms >= w.startMs ? "#fff" : undefined }}>{w.text.startsWith(" ") && i === 0 ? w.text.slice(1) : w.text}</span>)}
      </div>
    </AbsoluteFill>
  );
};

const CHARTS: Record<string, { file: string; eyebrow: string; title: ReactNode; sub: string; color?: string }> = {
  shift: { file: "Shift", eyebrow: "PR #134 · Level shift", title: <>Landed code rose <Em c={C.accent}>32% to 74%</Em></>, sub: "since Mar 2 · permutation test on the weekly series · n = 160 sessions" },
  cpc: { file: "Cpc", eyebrow: "PR #134 · Cost per change", color: C.bad, title: <><Em c={C.bad}>$25</Em> per landed change</>, sub: "usually $3 · robust z over a rolling 12-week median" },
  length: { file: "Length", eyebrow: "PR #135 · Prompt length", color: C.good, title: <>140+ characters land code <Em c={C.good}>37%</Em></>, sub: "not 23% · Newcombe-Wilson CI, Bonferroni m=4 · n = 787" },
  retry: { file: "Retry", eyebrow: "PR #135 · Retry cliff", color: C.bad, title: <>After 3 retries, only <Em c={C.bad}>25%</Em> land</>, sub: "usually 72% · Newcombe-Wilson CI of the gap · n = 400" },
  daypart: { file: "Daypart", eyebrow: "PR #135 · Daypart", color: C.good, title: <>Late-morning starts land code <Em c={C.good}>42%</Em></>, sub: "not 22% · 8am–12pm UTC, 4-hour blocks · n = 787" },
};

export const Release = () => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: SANS }}>
    <Ambient />
    {tl.scenes.map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.frames} name={s.id}>
        <Scene frames={s.frames}>
          {s.id === "open" ? <Open /> : s.id === "dash" ? <Dash /> : s.id === "close" ? <Close /> : <ChartScene {...CHARTS[s.id]} />}
        </Scene>
      </Sequence>
    ))}
    <Captions />
  </AbsoluteFill>
);
