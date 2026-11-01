// Autoplay the demo only when muted playback and motion are both allowed; otherwise poster + controls.
(function () {
  var v = document.getElementById("demo");
  if (!v || !window.matchMedia) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  v.preload = "auto";
  var go = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e, o) {
      if (e[0].isIntersecting) { go(); o.disconnect(); }
    }, { threshold: 0.5 }).observe(v);
  }
})();
