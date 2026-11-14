(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const abertura = document.getElementById("abertura");
  const luz = document.getElementById("aberturaLuz");
  const ondas = document.getElementById("aberturaOndas");
  const foto = document.getElementById("loginFoto");
  const copy = document.getElementById("loginCopy");
  const frase = document.getElementById("loginFrase");
  const escudos = document.getElementById("loginEscudos");
  const painel = document.getElementById("loginFormPainel");
  const ponto = document.querySelector(".ponto-cine");
  const canvas = document.getElementById("poeira");
  const titulo = document.querySelector(".cine-titulo");

  function revelarUI() {
    if (!window.gsap) {
      abertura?.classList.add("fim");
      if (foto) {
        foto.style.opacity = "1";
        foto.style.transform = "scale(1)";
      }
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

    if (titulo) {
      tl.fromTo(
        titulo,
        { yPercent: 110 },
        { yPercent: 0, duration: 1.1 },
        0
      );
    }

    if (ponto) {
      tl.to(
        ponto,
        {
          color: "var(--accent, #1e90ff)",
          duration: 0.15,
          yoyo: true,
          repeat: 1,
          onComplete() {
            gsap.to(ponto, {
              opacity: 0.6,
              duration: 1,
              yoyo: true,
              repeat: -1,
              ease: "sine.inOut",
              delay: 1,
            });
          },
        },
        "-=0.2"
      );
    }

    const linhas = frase?.querySelectorAll(".mask-linha > span");
    if (linhas?.length) {
      tl.fromTo(
        linhas,
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.15 },
        0.2
      );
    }

    const aneis = escudos?.querySelectorAll(".cine-escudo");
    if (aneis?.length) {
      tl.fromTo(
        aneis,
        { scale: 0.5, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.45,
          stagger: 0.12,
          onComplete() {
            if (reduced) return;
            aneis.forEach((el, i) => {
              gsap.to(el, {
                y: 3,
                duration: 2,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                delay: i * 0.5,
              });
            });
          },
        },
        0.4
      );
      const small = escudos?.querySelector("small");
      if (small) tl.fromTo(small, { opacity: 0 }, { opacity: 1, duration: 0.4 }, "-=0.2");
    }

    if (painel) {
      tl.fromTo(
        painel,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.8 },
        0.55
      );
    }
  }

  function aberturaCine() {
    if (!abertura || !luz) {
      revelarUI();
      return;
    }

    if (reduced || !window.gsap) {
      gsap?.set?.(foto, { opacity: 1, scale: 1 });
      if (foto) {
        foto.style.opacity = "1";
        foto.style.transform = "scale(1)";
      }
      gsap?.to?.(abertura, {
        opacity: 0,
        duration: 0.4,
        onComplete() {
          abertura.classList.add("fim");
        },
      }) || abertura.classList.add("fim");
      revelarUI();
      return;
    }

    const mobile = window.matchMedia("(max-width: 900px)").matches;
    const dur = mobile ? 1.8 : 2.5;

    const tl = gsap.timeline({
      onComplete() {
        abertura.classList.add("fim");
        revelarUI();
      },
    });

    tl.fromTo(
      luz,
      { opacity: 0, scale: 0.4 },
      { opacity: 1, scale: 1, duration: dur * 0.32, ease: "sine.inOut" }
    );

    for (let i = 0; i < 3; i++) {
      const o = document.createElement("div");
      o.className = "abertura-onda";
      ondas?.appendChild(o);
      tl.fromTo(
        o,
        { scale: 0.2, opacity: 0.3 },
        { scale: 28, opacity: 0, duration: dur * 0.45, ease: "power2.out" },
        dur * 0.32 + i * 0.2
      );
    }

    tl.to(luz, { opacity: 0, scale: 2.5, duration: 0.4 }, dur * 0.55);

    if (foto) {
      tl.fromTo(
        foto,
        { opacity: 0, scale: 1.1 },
        { opacity: 1, scale: 1, duration: Math.min(0.9, dur * 0.36), ease: "expo.out" },
        dur * 0.64
      );
    }

    tl.to(abertura, { opacity: 0, duration: 0.35 }, "-=0.15");
  }

  /* Partículas de poeira */
  let particles = [];
  let raf = 0;

  function initPoeira() {
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const r = canvas.parentElement?.getBoundingClientRect();
      if (!r) return;
      canvas.width = Math.floor(r.width);
      canvas.height = Math.floor(r.height);
    }
    resize();
    window.addEventListener("resize", resize);

    const n = 20;
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1 + Math.random(),
      vy: 20 + Math.random() * 30,
      a: 0.1 + Math.random() * 0.2,
    }));

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.y -= p.vy * dt;
        if (p.y < -4) {
          p.y = canvas.height + 4;
          p.x = Math.random() * canvas.width;
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  /* Parallax */
  function initParallax() {
    if (!foto || reduced) return;
    const visual = document.getElementById("loginVisual");
    visual?.addEventListener("pointermove", (e) => {
      const r = visual.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      foto.style.transform = `translate(${x * -2.5}%, ${y * -2.5}%) scale(1.05)`;
    });
  }

  /* Confete radial ao escolher clube */
  window.torcidaConfete = function confete(el, cor) {
    if (reduced || !el || !window.gsap) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const color = cor || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1e90ff";

    for (let i = 0; i < 25; i++) {
      const p = document.createElement("div");
      p.className = "confete-piece";
      p.style.background = color;
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      document.body.appendChild(p);
      const ang = (Math.PI * 2 * i) / 25 + Math.random() * 0.4;
      const dist = 40 + Math.random() * 80;
      gsap.to(p, {
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist + 40,
        rotation: Math.random() * 360,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        onComplete() {
          p.remove();
        },
      });
    }
  };

  window.torcidaRetemaFoto = function (accent) {
    if (!foto) return;
    if (accent) {
      document.documentElement.style.setProperty("--accent", accent);
      document.documentElement.style.setProperty(
        "--accent-soft",
        `color-mix(in srgb, ${accent} 22%, transparent)`
      );
    }
    foto.style.filter = "none";
    foto.animate?.(
      [{ opacity: 0.7 }, { opacity: 1 }],
      { duration: 800, easing: "ease" }
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      aberturaCine();
      initPoeira();
      initParallax();
    });
  } else {
    aberturaCine();
    initPoeira();
    initParallax();
  }

  window.addEventListener("pagehide", () => cancelAnimationFrame(raf));
})();
