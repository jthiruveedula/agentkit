# Frontend motion & 3D stack

## Effect → tool

| Effect | First choice | Step up to | Skill |
|---|---|---|---|
| Hover, focus, enter/exit | CSS transitions | Motion (`motion/react`) | `motion-dev` |
| Layout / shared-element transitions | View Transitions API | Motion `layout` | `motion-dev` |
| Multi-step timeline, stagger, text split | GSAP timeline | — | `gsap-timeline`, `gsap-plugins` |
| Scroll-linked progress, parallax | CSS scroll-driven animations | GSAP ScrollTrigger | `gsap-scrolltrigger` |
| Pinned scroll storytelling | GSAP ScrollTrigger | — | `gsap-scrolltrigger` |
| GSAP in React | `useGSAP` hook | — | `gsap-react` |
| 3D object / product viewer | `<model-viewer>` | three.js / R3F | — |
| Custom 3D scene, shaders, particles | three.js (vanilla) or R3F + drei (React) | — | — |
| Scroll-through 3D world | — | — | `scroll-world` |
| 3D charts / data viz | — | — | `3dviz-pro-max` |
| Rendered video, motion graphics | — | — | `hyperframes` |
| Visual direction, type, color, layout | — | — | `hallmark` |

## three.js / React Three Fiber rules

- Renderer: `antialias` only if needed; `setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Render on demand (`frameloop="demand"` in R3F) for static scenes; pause
  the loop when the canvas is off-screen (IntersectionObserver).
- Instancing (`InstancedMesh`) for many copies; merge static geometry.
- Models: glTF + Draco/Meshopt; textures KTX2; budget < 2 MB above the fold.
- Handle `webglcontextlost`; show the poster fallback.
- Dispose geometry, material, texture, and render targets on unmount
  (R3F does this for JSX-owned objects; manual `new` objects are yours).
- Lazy-load the canvas (`React.lazy` / dynamic import) so it never blocks LCP.

## Performance budget

| Metric | Budget |
|---|---|
| Frame time during animation | < 16.7 ms (60fps), no long tasks > 50 ms |
| LCP | < 2.5 s, LCP element is HTML/image, not canvas |
| CLS | < 0.1 — reserve space for animated/3D elements |
| JS for motion (gzip) | < 50 KB for UI motion; 3D chunk lazy |
| Animated properties | `transform`, `opacity` (and `filter` sparingly) |

## Accessibility checklist

- [ ] `prefers-reduced-motion: reduce` swaps movement for fades or static states
- [ ] Autoplaying motion > 5 s has pause/stop control
- [ ] Nothing flashes > 3 times per second
- [ ] Content readable and navigable with JS/WebGL off
- [ ] Canvas has a text alternative (`aria-label` or adjacent description)
- [ ] Pinned/scroll-jacked sections keep keyboard and focus order intact
- [ ] Color contrast holds at every animation frame where text is shown
