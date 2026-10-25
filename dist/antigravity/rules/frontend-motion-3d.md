---
description: Pick the lightest stack for UI animation and 3D (CSS/Motion, GSAP+ScrollTrigger, three.js/R3F, HyperFrames) within a perf and a11y budget. Use when asked for animations, scroll effects, 3D/WebGL, motion design, interactive heroes.
trigger: model_decision
---

# Frontend Motion & 3D

Choose the lightest tool, set the budget, then build.

## Procedure

1. **Match the effect to the lightest tool** (`_frontend-motion-3d/reference/stack.md` has the
   full table):
   - hover, enter/exit, layout shifts → CSS transitions or `motion-dev`
   - sequenced timelines, text splits, SVG morphs → `gsap-core`, `gsap-timeline`, `gsap-plugins`
   - scroll-driven storytelling, pinning, scrub → `gsap-scrolltrigger` (or CSS scroll-driven animations for simple cases)
   - a 3D scene, model viewer, shaders → three.js; in React, React Three Fiber + drei
   - immersive scroll-through 3D world → `scroll-world`; 3D data viz → `3dviz-pro-max`
   - rendered video / motion graphics from HTML → `hyperframes`
   - visual direction, layout, type, color → `hallmark` first
   - how a live reference site builds an effect → `ext-rea`
     (`inspect_web_page`, `analyze_web_bundle`), then reimplement it. Never copy its code or assets.
   Detect what the project already uses (`package.json`) and stay with it.
   Never add a second animation library for an effect the first covers.

2. **Set the budget before code.** 60fps on a mid-range laptop; animate
   only `transform` and `opacity`; LCP element never waits on JS or a 3D
   scene; 3D bundle lazy-loaded below the fold; `devicePixelRatio`
   capped at 2; textures compressed (KTX2/Draco for models).

3. **Build the accessible baseline first.** Content and navigation work
   with motion off and without WebGL. Then layer motion on:
   - honor `prefers-reduced-motion` (`gsap.matchMedia()`, Motion's
     `useReducedMotion`, or a CSS media query) — reduce to fades, don't
     just speed up
   - a static image or poster when WebGL is unavailable or the context is lost
   - no autoplaying motion over 5s without a pause control; nothing that
     flashes more than 3 times per second
   - focus order and keyboard access unchanged by pinned sections

4. **Clean up.** Kill tweens/ScrollTriggers on unmount (`gsap.context()`
   / `useGSAP`), dispose three.js geometries, materials, textures, and the
   renderer; stop the render loop when off-screen.

5. **Verify with numbers.** Performance panel trace (no long frames
   during the animation), Lighthouse LCP/CLS, reduced-motion toggled on,
   WebGL disabled. For a browser check use `ego-browser`. Report the
   numbers; "looks smooth" is not evidence.
   Check each number against the budget; if one misses, fix and re-measure until it passes.

6. **Hand off** multi-file UI builds to the `frontend-engineer` subagent
   with the effect list, the chosen stack, and the budget from step 2.

## Reference

- `_frontend-motion-3d/reference/stack.md` — effect → tool table, three.js/R3F setup rules,
  performance budget, accessibility checklist.
