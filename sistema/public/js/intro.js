/* Intro — bola real + reveal de marca (todo reload; PULAR / reduced-motion) */
(function () {
  "use strict";

  function aplicarAccentSalvo() {
    if (!getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()) {
      document.documentElement.style.setProperty("--accent", "#1e90ff");
      document.documentElement.style.setProperty("--accent-rgb", "30,144,255");
    }
    try {
      var clube = JSON.parse(localStorage.getItem("torcida_clube") || "null");
      if (clube && clube.color) {
        var hex = String(clube.color).replace("#", "");
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        var n = parseInt(hex, 16);
        if (!isNaN(n)) {
          document.documentElement.style.setProperty("--accent", clube.color);
          document.documentElement.style.setProperty(
            "--accent-rgb",
            ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255)
          );
        }
      }
    } catch (_) {}
  }

  aplicarAccentSalvo();

  var intro = document.getElementById("intro");
  var ball = document.getElementById("pixelBall");
  var shadow = document.getElementById("ballShadow");
  var ground = document.getElementById("introGround");
  var ring = document.getElementById("introRing");
  var flash = document.getElementById("introFlash");
  var particlesBox = document.getElementById("introParticles");
  var dustBox = document.getElementById("introDust");
  var logo = document.getElementById("introLogo");
  var logoText = document.getElementById("introLogoText");
  var tag = document.getElementById("introTag");
  var skipBtn = document.getElementById("introSkip");
  var introDone = false;
  var tl = null;
  var GROUND_Y = 200;
  var STAGE_CX = 180;

  function rgbAccent() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim() || "30,144,255";
  }

  function montarLogo() {
    if (!logoText) return;
    logoText.innerHTML = "";
    ("TORCIDA.").split("").forEach(function (c) {
      var span = document.createElement("span");
      span.className = "ch" + (c === "." ? " dot" : "");
      span.textContent = c;
      logoText.appendChild(span);
    });
  }

  function finalizarIntro() {
    if (introDone) return;
    introDone = true;
    if (tl && typeof tl.kill === "function") tl.kill();
    if (!intro) return;
    intro.classList.add("fade-out");
    setTimeout(function () {
      intro.hidden = true;
      intro.style.display = "none";
    }, 700);
  }

  function impactoVisual(forca) {
    forca = forca || 1;
    if (!window.gsap) return;
    if (flash) {
      gsap.fromTo(
        flash,
        { opacity: 0.65 * forca },
        { opacity: 0, duration: 0.4, ease: "power2.out" }
      );
    }
    if (ground) {
      gsap.fromTo(
        ground,
        { scaleX: 0.5 + 0.45 * forca, opacity: 1 },
        { scaleX: 0.8, opacity: 0.5, duration: 0.6, ease: "power2.out" }
      );
    }
    if (ring) {
      gsap.fromTo(
        ring,
        { scale: 0.15, opacity: 0.95 },
        { scale: 3.2 + forca, opacity: 0, duration: 0.6, ease: "power2.out" }
      );
    }
    gsap.fromTo(
      ".intro-stage",
      { y: 0 },
      { y: 5 * forca, yoyo: true, repeat: 1, duration: 0.07, ease: "power1.inOut" }
    );
  }

  function spawnImpacto(x, y, qtd, forca) {
    if (!particlesBox) return;
    qtd = qtd || 16;
    forca = forca || 1;
    var rgb = rgbAccent();
    for (var i = 0; i < qtd; i++) {
      (function () {
        var p = document.createElement("div");
        var spark = Math.random() > 0.5;
        p.className = "pixel-part" + (spark ? " spark" : "");
        var size = (spark ? 2 : 4) + Math.random() * (spark ? 5 : 6) * forca;
        p.style.width = size + "px";
        p.style.height = size + "px";
        var col = Math.random() > 0.35 ? "rgb(" + rgb + ")" : (Math.random() > 0.5 ? "#f4f6fb" : "#8a93a6");
        p.style.background = col;
        p.style.color = col;
        p.style.left = x + "px";
        p.style.top = y + "px";
        particlesBox.appendChild(p);

        var angle = -Math.PI + Math.random() * Math.PI;
        var dist = (48 + Math.random() * 100) * forca;
        var vx = Math.cos(angle) * dist;
        var vy = Math.sin(angle) * dist * 0.72 - 24;
        var rot = Math.random() * 520 - 260;

        if (window.gsap) {
          gsap.to(p, {
            x: vx,
            y: vy + 55,
            rotation: rot,
            opacity: 0,
            scale: 0.15,
            duration: 0.6 + Math.random() * 0.45,
            ease: "power3.out",
            onComplete: function () { p.remove(); }
          });
        } else {
          setTimeout(function () { p.remove(); }, 700);
        }
      })();
    }
  }

  function spawnTrail(y) {
    if (!particlesBox || introDone || !window.gsap) return;
    var rgb = rgbAccent();
    var p = document.createElement("div");
    p.className = "pixel-part trail";
    p.style.background = Math.random() > 0.35 ? "rgb(" + rgb + ")" : "#fff";
    p.style.left = STAGE_CX - 3 + (Math.random() * 18 - 9) + "px";
    p.style.top = y + 40 + "px";
    particlesBox.appendChild(p);
    gsap.to(p, {
      opacity: 0,
      y: 22,
      scale: 0,
      duration: 0.4,
      ease: "power1.out",
      onComplete: function () { p.remove(); }
    });
  }

  function criarPoeira() {
    if (!dustBox || !window.gsap) return;
    for (var i = 0; i < 36; i++) {
      var d = document.createElement("div");
      d.className = "dust-mote";
      d.style.left = Math.random() * 100 + "%";
      d.style.top = Math.random() * 100 + "%";
      dustBox.appendChild(d);
      gsap.to(d, {
        opacity: 0.12 + Math.random() * 0.5,
        y: -40 - Math.random() * 100,
        x: (Math.random() - 0.5) * 50,
        duration: 2.4 + Math.random() * 2.8,
        delay: Math.random() * 1.2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    }
  }

  function revelarLogo() {
    if (!logo) return;
    logo.classList.add("on");
    var chars = logo.querySelectorAll(".ch");
    if (window.gsap && chars.length) {
      gsap.fromTo(
        chars,
        { opacity: 0, y: 28, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.5,
          stagger: 0.05,
          ease: "power3.out",
          onComplete: function () { logo.classList.add("glitch"); }
        }
      );
      var emblem = logo.querySelector(".logo-emblem");
      if (emblem) {
        gsap.fromTo(
          emblem,
          { scale: 0.6, rotate: -12 },
          { scale: 1, rotate: 0, duration: 0.55, ease: "back.out(1.6)" }
        );
      }
    } else {
      chars.forEach(function (ch) {
        ch.style.opacity = "1";
        ch.style.transform = "none";
      });
      logo.classList.add("glitch");
    }
    if (tag) tag.classList.add("on");
  }

  function rodarIntro() {
    if (!intro || !ball) return;

    if (!(window.TorcidaQuerMotion ? window.TorcidaQuerMotion() : !matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      intro.hidden = true;
      intro.style.display = "none";
      introDone = true;
      return;
    }

    montarLogo();
    intro.hidden = false;
    intro.style.display = "grid";
    criarPoeira();

    var startH = -180;

    if (!window.gsap) {
      ball.style.transition = "transform 1.1s cubic-bezier(.2,.8,.2,1)";
      requestAnimationFrame(function () {
        ball.style.transform = "translateY(" + GROUND_Y + "px)";
      });
      setTimeout(function () {
        impactoVisual(1);
        spawnImpacto(STAGE_CX, GROUND_Y + 48, 20, 1);
      }, 1000);
      setTimeout(function () {
        ball.style.opacity = "0";
        revelarLogo();
      }, 2400);
      setTimeout(finalizarIntro, 3600);
      return;
    }

    gsap.set(ball, {
      y: startH,
      x: 0,
      rotation: -50,
      scaleX: 1,
      scaleY: 1,
      scale: 1,
      opacity: 1,
      filter: "brightness(1)"
    });
    if (shadow) gsap.set(shadow, { opacity: 0, scaleX: 0.25 });
    if (ground) gsap.set(ground, { scaleX: 0.3, opacity: 0.2 });

    tl = gsap.timeline({
      onComplete: function () {
        revelarLogo();
        gsap.delayedCall(1.25, finalizarIntro);
      }
    });

    /* beat 0 — silêncio + canhão de luz no chão */
    tl.to(ground, { opacity: 0.55, scaleX: 0.55, duration: 0.35, ease: "power1.out" }, 0);

    /* beat 1 — queda com spin e rastro */
    tl.to(ball, {
      y: GROUND_Y,
      rotation: 380,
      duration: 0.78,
      ease: "power3.in",
      onUpdate: function () {
        var prog = this.progress();
        if (prog > 0.12 && prog < 0.92 && Math.random() > 0.5) {
          spawnTrail(startH + (GROUND_Y - startH) * prog);
        }
      }
    }, 0.15);

    if (shadow) {
      tl.to(shadow, { opacity: 0.9, scaleX: 1.25, duration: 0.78, ease: "power3.in" }, 0.15);
    }
    tl.to(ground, { scaleX: 0.95, opacity: 0.85, duration: 0.78, ease: "power3.in" }, 0.15);

    /* impacto 1 */
    tl.to(ball, {
      scaleX: 1.38,
      scaleY: 0.58,
      duration: 0.09,
      ease: "power2.out",
      onStart: function () {
        impactoVisual(1.15);
        spawnImpacto(STAGE_CX, GROUND_Y + 52, 26, 1.2);
      }
    })
      .to(ball, { scaleX: 0.9, scaleY: 1.14, duration: 0.12, ease: "power2.out" })
      .to(ball, {
        y: GROUND_Y - 132,
        rotation: "+=40",
        scaleX: 1,
        scaleY: 1,
        duration: 0.42,
        ease: "power2.out"
      })
      .to(shadow, { opacity: 0.22, scaleX: 0.4, duration: 0.42, ease: "power2.out" }, "<")

      /* impacto 2 */
      .to(ball, {
        y: GROUND_Y,
        rotation: "+=90",
        duration: 0.34,
        ease: "power2.in",
        onComplete: function () {
          impactoVisual(0.8);
          spawnImpacto(STAGE_CX, GROUND_Y + 52, 16, 0.9);
        }
      })
      .to(ball, { scaleX: 1.24, scaleY: 0.7, duration: 0.07 })
      .to(ball, { scaleX: 1, scaleY: 1, duration: 0.1 })
      .to(shadow, { opacity: 0.82, scaleX: 1.1, duration: 0.34, ease: "power2.in" }, "<-=0.34")

      /* impacto 3 */
      .to(ball, { y: GROUND_Y - 68, rotation: "+=30", duration: 0.3, ease: "power2.out" })
      .to(shadow, { opacity: 0.32, scaleX: 0.5, duration: 0.3 }, "<")
      .to(ball, {
        y: GROUND_Y,
        rotation: "+=50",
        duration: 0.26,
        ease: "power2.in",
        onComplete: function () {
          impactoVisual(0.5);
          spawnImpacto(STAGE_CX, GROUND_Y + 52, 10, 0.55);
        }
      })
      .to(ball, { scaleX: 1.14, scaleY: 0.82, duration: 0.06 })
      .to(ball, { scaleX: 1, scaleY: 1, duration: 0.08 })

      /* micro-quique + respiração */
      .to(ball, { y: GROUND_Y - 24, duration: 0.2, ease: "power2.out" })
      .to(ball, { y: GROUND_Y, duration: 0.18, ease: "power2.in",
        onComplete: function () { spawnImpacto(STAGE_CX, GROUND_Y + 52, 5, 0.3); }
      })
      .to(ball, { y: GROUND_Y - 6, duration: 0.22, ease: "sine.inOut", yoyo: true, repeat: 1 })

      /* beat final — sobe, cresce, dissolve em luz → logo */
      .to(ball, {
        y: GROUND_Y - 70,
        scale: 1.25,
        rotation: "+=120",
        duration: 0.45,
        ease: "power2.inOut"
      })
      .to(ball, {
        y: GROUND_Y - 140,
        scale: 0.35,
        opacity: 0,
        filter: "brightness(2.2) blur(10px)",
        duration: 0.48,
        ease: "power3.in"
      })
      .to(shadow, { opacity: 0, duration: 0.3 }, "<")
      .to(ground, { opacity: 0.15, scaleX: 0.4, duration: 0.45 }, "<")
      .to(flash, { opacity: 0.35, duration: 0.2, yoyo: true, repeat: 1 }, "<0.15");
  }

  function podePular(e) {
    if (introDone || !intro || intro.hidden) return;
    if (e.key === "Escape" || e.key === " ") {
      e.preventDefault();
      finalizarIntro();
    }
  }

  if (skipBtn) skipBtn.addEventListener("click", finalizarIntro);
  document.addEventListener("keydown", podePular);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rodarIntro);
  } else {
    rodarIntro();
  }
})();
