/* Motion + libs: local GSAP/Lenis; ?motion=1 força animação mesmo com "reduzir movimento" do SO. */
(function () {
  "use strict";
  var qs = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  if (qs && qs.get("motion") === "1") {
    try { localStorage.setItem("torcida_motion", "1"); } catch (e) {}
  }
  if (qs && qs.get("motion") === "0") {
    try { localStorage.removeItem("torcida_motion"); } catch (e) {}
  }

  window.TorcidaQuerMotion = function () {
    try {
      if (localStorage.getItem("torcida_motion") === "1") return true;
    } catch (e) {}
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  try {
    if (window.TorcidaQuerMotion()) {
      document.documentElement.classList.add("torcida-force-motion");
    }
  } catch (e) {}
})();
