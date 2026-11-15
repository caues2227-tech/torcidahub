/* Fundo vivo: foto da torcida + nebulosa + floodlights + partículas + spotlight. */
(function () {
  "use strict";

  var FOTO = "/img/estadio-noite.webp";
  var reduced = !(window.TorcidaQuerMotion ? window.TorcidaQuerMotion() : !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function ensureCss() {
    if (document.querySelector('link[href*="fundo.css"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/fundo.css?v=26";
    document.head.appendChild(link);
  }

  function el(tag, className) {
    var n = document.createElement(tag);
    n.className = className;
    n.setAttribute("aria-hidden", "true");
    return n;
  }

  function injectLayers() {
    if (document.body.classList.contains("auth-page")) return;

    if (document.querySelector(".page-fundo") || document.querySelector(".fundo-foto")) {
      /* migra layout antigo sem page-fundo */
      if (!document.querySelector(".page-fundo") && document.querySelector(".fundo-foto")) {
        document.querySelectorAll(
          ".fundo-foto-wrap, .fundo-tint, .fundo-tint-color, .fundo-base, .fundo-nebulosa, .fundo-orbe, .fundo-grid, .fundo-noise, .fundo-particulas, .spotlight-global"
        ).forEach(function (n) { n.remove(); });
      } else {
        return;
      }
    }

    var root = el("div", "page-fundo");
    root.id = "pageFundo";

    var img = document.createElement("img");
    img.className = "fundo-foto";
    img.src = FOTO;
    img.alt = "";
    img.width = 1600;
    img.height = 900;
    img.loading = "lazy";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "low");
    root.appendChild(img);

    root.appendChild(el("div", "fundo-escurece"));
    root.appendChild(el("div", "fundo-tint"));
    root.appendChild(el("div", "fundo-tint-color"));
    root.appendChild(el("div", "fundo-nebulosa"));
    root.appendChild(el("div", "fundo-floodlights"));
    root.appendChild(el("div", "fundo-grid"));

    var parts = el("div", "fundo-particulas");
    parts.id = "fundoParticulas";
    root.appendChild(parts);

    var spot = el("div", "fundo-spotlight");
    spot.id = "fundoSpotlight";
    root.appendChild(spot);

    root.appendChild(el("div", "fundo-vinheta"));

    document.body.insertBefore(root, document.body.firstChild);
  }

  function initParticulas() {
    var container = document.getElementById("fundoParticulas");
    if (!container || reduced) return;
    if (container.childElementCount) return;

    var accentRgb = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-rgb").trim() || "30, 144, 255";

    for (var i = 0; i < 18; i++) {
      var p = document.createElement("div");
      p.className = "particula";
      var size = 1 + Math.random() * 2.5;
      var isAccent = Math.random() > 0.5;
      var color = isAccent ? "rgba(" + accentRgb + ",.3)" : "rgba(255,255,255,.2)";
      p.style.cssText =
        "left:" + Math.random() * 100 + "%;" +
        "width:" + size + "px;height:" + size + "px;" +
        "background:" + color + ";" +
        "animation-duration:" + (14 + Math.random() * 16) + "s;" +
        "animation-delay:" + Math.random() * 18 + "s";
      container.appendChild(p);
    }
  }

  function initSpotlight() {
    var spotlight = document.getElementById("fundoSpotlight");
    if (!spotlight || reduced || window.innerWidth <= 640) {
      if (spotlight && (reduced || window.innerWidth <= 640)) spotlight.style.display = "none";
      return;
    }

    var mx = innerWidth / 2;
    var my = innerHeight / 2;
    var sx = mx;
    var sy = my;
    var running = true;
    var raf = 0;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX;
      my = e.clientY;
    }, { passive: true });

    function loop() {
      if (!running) return;
      sx += (mx - sx) * 0.08;
      sy += (my - sy) * 0.08;
      spotlight.style.left = sx + "px";
      spotlight.style.top = sy + "px";
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    });
  }

  function initParallaxFoto() {
    var foto = document.querySelector(".page-fundo .fundo-foto");
    if (!foto || reduced) return;

    document.addEventListener("mousemove", function (e) {
      var x = (e.clientX / innerWidth - 0.5) * -12;
      var y = (e.clientY / innerHeight - 0.5) * -8;
      foto.style.transform = "scale(1.1) translate(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px)";
    }, { passive: true });
  }

  function boot() {
    if (document.body.classList.contains("auth-page")) return;
    ensureCss();
    injectLayers();
    initParticulas();
    initSpotlight();
    initParallaxFoto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TorcidaFundo = { boot: boot, initParticulas: initParticulas };
})();
