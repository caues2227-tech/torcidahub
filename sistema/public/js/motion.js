/* Lenis + GSAP: scroll suave, máscaras de texto, parallax, barra de progresso. */
(function () {
  "use strict";
  var reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function barra() {
    var el = document.getElementById("barraScroll");
    if (!el) {
      el = document.createElement("div");
      el.id = "barraScroll";
      el.className = "barra-scroll";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    return el;
  }

  function iniciarLenis() {
    if (reduzido || typeof Lenis === "undefined") return null;
    var lenis = new Lenis({ lerp: 0.07, smoothWheel: true });
    var b = barra();
    function tick(t) {
      lenis.raf(t);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? window.scrollY / max : 0;
      b.style.height = (p * 100) + "vh";
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    window.TorcidaLenis = lenis;
    return lenis;
  }

  function mascaras() {
    if (reduzido || typeof gsap === "undefined") {
      document.querySelectorAll(".mask-linha > span").forEach(function (s) {
        s.style.transform = "none";
      });
      return;
    }
    document.querySelectorAll("[data-reveal]").forEach(function (bloco) {
      var linhas = bloco.querySelectorAll(".mask-linha > span");
      if (!linhas.length) return;
      gsap.to(linhas, {
        y: 0,
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.08,
        delay: 0.15
      });
    });
  }

  function parallax() {
    if (reduzido || typeof gsap === "undefined") return;
    var dagua = document.querySelector(".marca-dagua b");
    if (dagua && typeof ScrollTrigger !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
      gsap.to(dagua, {
        yPercent: 5,
        ease: "none",
        scrollTrigger: { scrub: true }
      });
    } else if (dagua) {
      window.addEventListener("scroll", function () {
        var y = window.scrollY * 0.04;
        dagua.style.transform = "translate(-50%, calc(-50% + " + y + "px))";
      }, { passive: true });
    }
    document.querySelectorAll("[data-parallax]").forEach(function (img) {
      window.addEventListener("scroll", function () {
        var rect = img.getBoundingClientRect();
        var mid = rect.top + rect.height / 2 - window.innerHeight / 2;
        img.style.transform = "translateY(" + (mid * -0.06) + "px)";
      }, { passive: true });
    });
  }

  function resetHolo(card) {
    if (!card) return;
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--mouse-x", "50%");
    card.style.setProperty("--mouse-y", "50%");
  }

  function cardHolo() {
    if (reduzido) return;
    var last = null;
    document.addEventListener("mousemove", function (e) {
      var hit = null;
      try { hit = document.elementFromPoint(e.clientX, e.clientY); } catch (err) {}
      if (!hit || hit === document.documentElement || hit === document.body) {
        hit = e.target && e.target.nodeType === 1 ? e.target : null;
      }
      var card = hit && hit.closest ? hit.closest(".card-holo, .holo-card") : null;
      if (last && last !== card) resetHolo(last);
      last = card;
      if (!card) return;
      var rect = card.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      var y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      card.style.setProperty("--mouse-x", (x * 100).toFixed(2) + "%");
      card.style.setProperty("--mouse-y", (y * 100).toFixed(2) + "%");
      card.style.setProperty("--tilt-x", ((y - 0.5) * -8).toFixed(2) + "deg");
      card.style.setProperty("--tilt-y", ((x - 0.5) * 8).toFixed(2) + "deg");
    }, { passive: true });
  }

  function boot() {
    iniciarLenis();
    mascaras();
    parallax();
    cardHolo();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TorcidaMotion = { mascaras: mascaras, parallax: parallax, cardHolo: cardHolo };
})();
