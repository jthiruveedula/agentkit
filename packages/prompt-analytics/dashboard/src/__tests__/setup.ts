// jsdom lacks these browser APIs used by gsap and the charts.
const g = globalThis as Record<string, unknown>;
g.matchMedia ??= (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
class Obs { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
g.IntersectionObserver ??= Obs;
g.ResizeObserver ??= Obs;
