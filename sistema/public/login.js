/* Login / cadastro — foto + CSS, sem vídeo. */
(function () {
  "use strict";
  var T = window.Torcida;
  var $ = function (id) { return document.getElementById(id); };
  var reduced = !(window.TorcidaQuerMotion ? window.TorcidaQuerMotion() : !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var touch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var voltar = T.voltarUrl();
  var destino = voltar || "/";
  var clubeSelecionado = null;
  /* Escudos ESPN CDN — IDs da tabela bra.1 / bra.2. */
  var ESPN_CREST = {
    Flamengo: 819, Palmeiras: 2029, Cruzeiro: 2022, Fluminense: 3445,
    "Athletico-PR": 3458, "Athletico Paranaense": 3458, Bahia: 9967,
    "Atlético-MG": 7632, "Atlético Mineiro": 7632, Bragantino: 6079,
    "Red Bull Bragantino": 6079, Santos: 2674, "São Paulo": 2026, "Sao Paulo": 2026,
    Botafogo: 6086, Coritiba: 3456, Vasco: 3454, "Vasco da Gama": 3454,
    Mirassol: 9169, "Vitória": 3457, Internacional: 1936, Corinthians: 874,
    "Grêmio": 6273, Gremio: 6273, Remo: 4936, Chapecoense: 9318,
    Novorizontino: 18127, Juventude: 6270, "Vila Nova": 9973, Fortaleza: 6272,
    "Criciúma": 9971, "Atlético-GO": 10357, "Atlético Goianiense": 10357,
    CRB: 9970, "Goiás": 3395, Sport: 7635, "Operário-PR": 18187, "Operário PR": 18187,
    "São Bernardo": 11268, "Botafogo-SP": 10281, Athletic: 20851, "Cuiabá": 17313,
    "Náutico": 7633, Ceará: 9969, "Avaí": 9966, Londrina: 17333,
    "América-MG": 6154, "América Mineiro": 6154, "Ponte Preta": 3459,
    CSA: 9970, Paysandu: 6144, Guarani: 6275,
    "Real Madrid": 86, Barcelona: 83, PSG: 160, "Manchester City": 382,
    "Manchester United": 360, Liverpool: 364, Chelsea: 363, Arsenal: 359,
    "Bayern Munich": 132, Juventus: 111, "Inter Milan": 110, "AC Milan": 103,
    "Borussia Dortmund": 124, "Atlético Madrid": 1068, "Atletico Madrid": 1068,
    Tottenham: 367, Napoli: 114, Ajax: 139, Benfica: 1929, Porto: 437
  };
  function crestUrl(club) {
    var nome = club.name || club.nome || "";
    var id = ESPN_CREST[nome];
    if (!id && T.nomeBate) {
      var chave = Object.keys(ESPN_CREST).filter(function (k) { return T.nomeBate(k, nome); })[0];
      id = chave ? ESPN_CREST[chave] : null;
    }
    if (id) return "https://a.espncdn.com/i/teamlogos/soccer/500/" + id + ".png";
    if (club.badge && String(club.badge).indexOf("/img/escudo") !== 0) return club.badge;
    return "/img/crests/" + encodeURIComponent(nome) + ".png";
  }
  var FALLBACK = [
    { id: "fla", name: "Flamengo", color: "#e0442f" },
    { id: "pal", name: "Palmeiras", color: "#006437" },
    { id: "cor", name: "Corinthians", color: "#1a1a1a" },
    { id: "sao", name: "São Paulo", color: "#c41e3a" },
    { id: "san", name: "Santos", color: "#1e90ff" },
    { id: "flu", name: "Fluminense", color: "#006437" },
    { id: "bot", name: "Botafogo", color: "#1a1a1a" },
    { id: "vas", name: "Vasco", color: "#1a1a1a" },
    { id: "gre", name: "Grêmio", color: "#1e3a6e" },
    { id: "int", name: "Internacional", color: "#c41e3a" },
    { id: "cam", name: "Atlético-MG", color: "#1a1a1a" },
    { id: "cru", name: "Cruzeiro", color: "#1e5aa8" },
    { id: "bah", name: "Bahia", color: "#1e3a6e" },
    { id: "vit", name: "Vitória", color: "#c41e3a" },
    { id: "cap", name: "Athletico-PR", color: "#c41e3a" },
    { id: "cfc", name: "Coritiba", color: "#006437" },
    { id: "rbb", name: "Bragantino", color: "#c41e3a" },
    { id: "mir", name: "Mirassol", color: "#ffd600" },
    { id: "rem", name: "Remo", color: "#1e3a6e" },
    { id: "cha", name: "Chapecoense", color: "#006437" },
    { id: "for", name: "Fortaleza", color: "#c41e3a" },
    { id: "cea", name: "Ceará", color: "#1a1a1a" },
    { id: "spo", name: "Sport", color: "#c41e3a" },
    { id: "goi", name: "Goiás", color: "#006437" },
    { id: "acg", name: "Atlético-GO", color: "#c41e3a" },
    { id: "amg", name: "América-MG", color: "#006437" },
    { id: "cui", name: "Cuiabá", color: "#006437" },
    { id: "juv", name: "Juventude", color: "#006437" },
    { id: "cri", name: "Criciúma", color: "#ffd600" },
    { id: "ava", name: "Avaí", color: "#1e5aa8" },
    { id: "nau", name: "Náutico", color: "#c41e3a" },
    { id: "crb", name: "CRB", color: "#c41e3a" },
    { id: "ope", name: "Operário-PR", color: "#1a1a1a" },
    { id: "nov", name: "Novorizontino", color: "#ffd600" },
    { id: "vno", name: "Vila Nova", color: "#c41e3a" },
    { id: "sbe", name: "São Bernardo", color: "#ffd600" },
    { id: "bsp", name: "Botafogo-SP", color: "#c41e3a" },
    { id: "ppt", name: "Ponte Preta", color: "#1a1a1a" },
    { id: "lon", name: "Londrina", color: "#1e5aa8" },
    { id: "ath", name: "Athletic", color: "#1a1a1a" },
    { id: "rma", name: "Real Madrid", color: "#ffffff" },
    { id: "bar", name: "Barcelona", color: "#a50044" },
    { id: "psg", name: "PSG", color: "#004170" },
    { id: "mci", name: "Manchester City", color: "#6cabdd" },
    { id: "mun", name: "Manchester United", color: "#da291c" },
    { id: "liv", name: "Liverpool", color: "#c8102e" },
    { id: "che", name: "Chelsea", color: "#034694" },
    { id: "ars", name: "Arsenal", color: "#ef0107" },
    { id: "bay", name: "Bayern Munich", color: "#dc052d" },
    { id: "juve", name: "Juventus", color: "#1a1a1a" },
    { id: "inter", name: "Inter Milan", color: "#010E80" },
    { id: "acm", name: "AC Milan", color: "#fb090b" },
    { id: "bvb", name: "Borussia Dortmund", color: "#fde100" },
    { id: "atm", name: "Atlético Madrid", color: "#cb3524" },
    { id: "tot", name: "Tottenham", color: "#132257" },
    { id: "nap", name: "Napoli", color: "#12A0D7" },
    { id: "aja", name: "Ajax", color: "#d2122e" },
    { id: "ben", name: "Benfica", color: "#e32636" },
    { id: "por", name: "Porto", color: "#003893" }
  ];

  function hexToRgb(hex) {
    var h = String(hex || "#1e90ff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 30, g: 144, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function aplicarAccent(color) {
    var c = color || "#1e90ff";
    var rgb = hexToRgb(c);
    var root = document.documentElement.style;
    root.setProperty("--accent", c);
    root.setProperty("--accent-rgb", rgb.r + ", " + rgb.g + ", " + rgb.b);
    root.setProperty("--accent-soft", "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.15)");
    root.setProperty("--accent-text", c);
    ["authTint", "authTintColor"].forEach(function (id) {
      var tint = $(id);
      if (!tint || reduced) return;
      tint.classList.remove("pulse");
      void tint.offsetWidth;
      tint.classList.add("pulse");
    });
  }

  function mostrarToast(msg) {
    var existing = document.querySelector(".auth-toast");
    if (existing) existing.remove();
    var t = document.createElement("div");
    t.className = "auth-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("on"); });
    setTimeout(function () {
      t.classList.remove("on");
      setTimeout(function () { t.remove(); }, 300);
    }, 2500);
  }

  function dispararConfete(cor) {
    if (reduced) return;
    for (var i = 0; i < 30; i++) {
      (function () {
        var p = document.createElement("div");
        var size = 4 + Math.random() * 8;
        var isCircle = Math.random() > 0.5;
        p.style.cssText =
          "position:fixed;left:50%;top:50%;width:" + size + "px;height:" + (isCircle ? size : size * 0.4) +
          "px;background:" + (Math.random() > 0.3 ? cor : "#fff") +
          ";border-radius:" + (isCircle ? "50%" : "1px") +
          ";pointer-events:none;z-index:9999;opacity:1;transition:all .9s cubic-bezier(.25,.46,.45,.94)";
        document.body.appendChild(p);
        var angle = Math.random() * Math.PI * 2;
        var dist = 80 + Math.random() * 250;
        var rot = Math.random() * 720 - 360;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            p.style.transform =
              "translate(" + Math.cos(angle) * dist + "px," + (Math.sin(angle) * dist + 120) + "px) rotate(" + rot + "deg)";
            p.style.opacity = "0";
          });
        });
        setTimeout(function () { p.remove(); }, 1000);
      })();
    }
  }

  function selecionarClube(btn) {
    document.querySelectorAll(".club-crest.selected").forEach(function (c) { c.classList.remove("selected"); });
    btn.classList.add("selected");
    var clubId = btn.getAttribute("data-club-id");
    var clubName = btn.getAttribute("data-club-name");
    var clubColor = btn.getAttribute("data-club-color") || "#1e90ff";
    aplicarAccent(clubColor);
    try {
      localStorage.setItem("torcida_clube", JSON.stringify({ id: clubId, name: clubName, color: clubColor }));
    } catch (e) { /* quota */ }
    dispararConfete(clubColor);
    mostrarToast("Nação " + clubName + " ativada!");
    clubeSelecionado = { id: clubId, name: clubName, color: clubColor };
    var el = $("clube-escolhido");
    if (el) {
      el.hidden = false;
      el.textContent = "Você torce para: " + clubName.toUpperCase();
    }
    if (T.registrarVotoClube) T.registrarVotoClube(clubName);
    try {
      var prefs = T.prefs ? T.prefs() : {};
      prefs.time = clubName;
      prefs.feedTime = clubName;
      if (T.salvarPrefs) {
        /* salvarPrefs já vota; evita double só gravando */
        localStorage.setItem("torcida.prefs", JSON.stringify(prefs));
      }
    } catch (e) {}
    T.api("/api/tema?time=" + encodeURIComponent(clubName) + "&pais=Brasil", { semRedirecionar: true })
      .then(function (d) {
        if (d && d.cores) {
          T.aplicarTema(d.cores, clubName);
          if (d.cores.accent) {
            aplicarAccent(d.cores.accent);
            clubeSelecionado.color = d.cores.accent;
          }
        }
      })
      .catch(function () {});
  }

  function criarBotaoClube(club) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "club-crest";
    btn.setAttribute("role", "option");
    btn.setAttribute("data-club-id", club.id);
    btn.setAttribute("data-club-name", club.name);
    btn.setAttribute("data-club-color", club.color || "#1e90ff");
    btn.title = club.name;
    btn.setAttribute("aria-label", club.name);
    var src = crestUrl(club);
    btn.innerHTML = '<img src="' + T.esc(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
    var img = btn.querySelector("img");
    img.onerror = function () {
      var tried = img.getAttribute("data-tried") || "";
      if (tried !== "1" && club.badge && String(club.badge).indexOf("http") === 0 && img.src.indexOf("espncdn") >= 0) {
        img.setAttribute("data-tried", "1");
        img.src = club.badge;
        return;
      }
      if (tried !== "2") {
        img.setAttribute("data-tried", "2");
        var local = "/img/crests/" + encodeURIComponent(club.name) + ".png";
        if (img.src.indexOf(local) < 0) { img.src = local; return; }
      }
      var initials = club.name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2);
      btn.innerHTML =
        '<span style="font-size:12px;font-weight:700;color:#8a93a6;display:grid;place-items:center;width:100%;height:100%">' +
        T.esc(initials) + "</span>";
    };
    btn.addEventListener("click", function () { selecionarClube(btn); });
    return btn;
  }

  function pintarGradeClubes(lista) {
    var grid = $("club-grid");
    if (!grid) return;
    var ordenada = (lista || []).slice().sort(function (a, b) {
      return String(a.name || a.nome || "").localeCompare(String(b.name || b.nome || ""), "pt-BR");
    });
    grid.innerHTML = "";
    ordenada.forEach(function (club) { grid.appendChild(criarBotaoClube(club)); });
    grid.setAttribute("data-qtd", String(ordenada.length));
  }

  function carregarClubesFallback() {
    pintarGradeClubes(FALLBACK);
  }

  function filtrarClubes(q) {
    var termo = T.normaliza ? T.normaliza(q) : String(q || "").toLowerCase();
    var lista = FALLBACK;
    if (termo) {
      lista = FALLBACK.filter(function (c) {
        var n = T.normaliza ? T.normaliza(c.name) : String(c.name).toLowerCase();
        return n.indexOf(termo) >= 0;
      });
    }
    pintarGradeClubes(lista);
  }

  function carregarClubes() {
    /* Lista local completa (Série A + B) — não depende de API externa curta. */
    carregarClubesFallback();
    var busca = $("club-busca");
    if (busca && !busca._wire) {
      busca._wire = true;
      busca.addEventListener("input", function () { filtrarClubes(busca.value); });
    }
  }

  function initParticulas() {
    var box = $("particles");
    if (!box || reduced) return;
    for (var i = 0; i < 20; i++) {
      var p = document.createElement("div");
      p.className = "particle" + (i % 2 === 0 ? " particle-accent" : " particle-white");
      var size = 1 + Math.random() * 2;
      p.style.cssText =
        "left:" + Math.random() * 100 + "%;width:" + size + "px;height:" + size +
        "px;animation-duration:" + (8 + Math.random() * 14) + "s;animation-delay:" + Math.random() * 12 + "s";
      box.appendChild(p);
    }
  }

  function initMouseLayers() {
    if (reduced) {
      var spOff = $("spotlight");
      if (spOff) spOff.style.display = "none";
      return;
    }

    var parallax = $("bgParallax");
    var authVisual = document.querySelector(".auth-visual");
    var form = document.querySelector(".auth-form");
    var spotlight = $("spotlight");
    var narrow = window.innerWidth <= 1024;

    if (spotlight && window.innerWidth <= 640) spotlight.style.display = "none";

    var mx = innerWidth / 2;
    var my = innerHeight / 2;
    var sx = mx;
    var sy = my;
    var running = true;
    var raf = 0;

    function onPointer(clientX, clientY) {
      mx = clientX;
      my = clientY;

      if (parallax && authVisual) {
        var rect = authVisual.getBoundingClientRect();
        if (rect.width >= 1 && rect.height >= 1) {
          var x = (clientX - rect.left) / rect.width - 0.5;
          var y = (clientY - rect.top) / rect.height - 0.5;
          x = Math.max(-0.5, Math.min(0.5, x));
          y = Math.max(-0.5, Math.min(0.5, y));
          parallax.style.transform =
            "translate(" + (x * -18).toFixed(2) + "px, " + (y * -12).toFixed(2) + "px)";
        }
      }

      if (form && !narrow) {
        var fr = form.getBoundingClientRect();
        if (fr.width >= 1 && fr.height >= 1) {
          var fx = (clientX - fr.left) / fr.width;
          var fy = (clientY - fr.top) / fr.height;
          form.style.setProperty("--mouse-x", (fx * 100).toFixed(1) + "%");
          form.style.setProperty("--mouse-y", (fy * 100).toFixed(1) + "%");
          form.style.setProperty("--tilt-x", (1.5 + (fy - 0.5) * -6).toFixed(2) + "deg");
          form.style.setProperty("--tilt-y", (-5 + (fx - 0.5) * 8).toFixed(2) + "deg");
        }
      }
    }

    document.addEventListener("mousemove", function (e) {
      onPointer(e.clientX, e.clientY);
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (e.touches && e.touches.length) {
        onPointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    if (form) {
      form.addEventListener("mouseleave", function () {
        if (narrow) return;
        form.style.setProperty("--tilt-x", "1.5deg");
        form.style.setProperty("--tilt-y", "-5deg");
      });
    }

    if (!spotlight || window.innerWidth <= 640) return;

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

    window.addEventListener("resize", function () {
      narrow = window.innerWidth <= 1024;
      if (window.innerWidth <= 640) {
        spotlight.style.display = "none";
        running = false;
        cancelAnimationFrame(raf);
      } else {
        spotlight.style.display = "";
        if (!running) {
          running = true;
          raf = requestAnimationFrame(loop);
        }
      }
    }, { passive: true });
  }

  function aba(modo) {
    var criar = modo === "criar";
    var esqueci = modo === "esqueci";
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = !esqueci && t.getAttribute("data-tab") === (criar ? "criar" : "entrar");
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    $("form-login").hidden = criar || esqueci;
    $("form-cadastro").hidden = !criar || esqueci;
    $("form-esqueci").hidden = !esqueci;
    if (!esqueci) {
      try { history.replaceState(null, "", criar ? "#criar" : "#entrar"); } catch (e) {}
    }
  }

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("auth-session").hidden = true;
      aba(tab.getAttribute("data-tab"));
    });
  });

  if (
    location.pathname.indexOf("cadastro") >= 0 ||
    location.hash === "#criar" ||
    new URLSearchParams(location.search).get("aba") === "criar"
  ) aba("criar");
  else aba("entrar");

  document.querySelectorAll(".ex-crest").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.getAttribute("data-club");
      var color = btn.getAttribute("data-club-color") || "#1e90ff";
      aplicarAccent(color);
      dispararConfete(color);
      mostrarToast("Nação " + name + " ativada!");
      var match = document.querySelector('.club-crest[data-club-name="' + name + '"]');
      if (match) selecionarClube(match);
      else {
        clubeSelecionado = { id: name, name: name, color: color };
        try {
          localStorage.setItem("torcida_clube", JSON.stringify(clubeSelecionado));
        } catch (e) {}
        var el = $("clube-escolhido");
        if (el) {
          el.hidden = false;
          el.textContent = "Você torce para: " + name.toUpperCase();
        }
        aba("criar");
      }
    });
  });

  document.querySelectorAll(".toggle-pass").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = btn.parentElement.querySelector("input");
      var isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      btn.textContent = isPass ? "ocultar" : "mostrar";
      btn.setAttribute("aria-pressed", String(isPass));
    });
  });

  function shake(el) {
    if (!el) return;
    el.classList.remove("erro-shake");
    void el.offsetWidth;
    el.classList.add("erro-shake");
  }

  function loading(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
  }

  function abrirModalVisitante() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-visitor-title">' +
      '<h3 id="modal-visitor-title">OLHE À VONTADE</h3>' +
      "<p>Você pode navegar pelo site sem conta. Mas pra comentar, reagir e seguir sua nação, precisa criar uma conta grátis.</p>" +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-primary" id="modal-create">Criar conta agora</button>' +
      '<button type="button" class="btn-ghost" id="modal-continue">Continuar olhando</button>' +
      "</div></div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("on"); });

    function fechar() { overlay.remove(); }

    overlay.querySelector("#modal-create").addEventListener("click", function () {
      fechar();
      aba("criar");
    });
    overlay.querySelector("#modal-continue").addEventListener("click", function () {
      fechar();
      entrarModoVisitante();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) fechar();
    });
    document.addEventListener("keydown", function esc(ev) {
      if (ev.key === "Escape") {
        fechar();
        document.removeEventListener("keydown", esc);
      }
    });
  }

  function entrarModoVisitante() {
    try {
      localStorage.setItem("torcida_visitante", "true");
      localStorage.removeItem("torcida_sessao");
      localStorage.setItem("torcida_clube", JSON.stringify({ id: "default", name: "Visitante", color: "#1e90ff" }));
    } catch (e) {}
    if (window.AUTH && AUTH.marcarVisitante) AUTH.marcarVisitante();
    if (T.prefs) {
      var p = T.prefs();
      p.convidado = true;
      p.nome = "Visitante";
      T.salvarPrefs(p);
    }
    if (T.sair) T.sair();
    location.href = destino;
  }

  function wireVisitante(id) {
    var btn = $(id);
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      abrirModalVisitante();
    });
  }
  wireVisitante("btn-visitor");
  wireVisitante("btn-visitor-login");

  $("btn-forgot").addEventListener("click", function () {
    $("esqueci-email").value = $("login-email").value.trim();
    aba("esqueci");
  });
  $("btn-voltar-login").addEventListener("click", function () { aba("entrar"); });

  function verificarSessao() {
    var e = T.eu();
    if (e.autenticado) {
      $("auth-session").hidden = false;
      $("form-login").hidden = true;
      $("form-cadastro").hidden = true;
      $("form-esqueci").hidden = true;
      $("session-name").textContent = e.nome || "Torcedor";
      $("session-club").textContent = e.time || "—";
      $("btn-continue").onclick = function () { location.href = destino; };
      $("btn-switch").onclick = function () {
        T.api("/api/logout", { metodo: "POST", semRedirecionar: true }).catch(function () {}).then(function () {
          T.sair();
          try { localStorage.removeItem("torcida_sessao"); } catch (err) {}
          location.reload();
        });
      };
      return;
    }
    try {
      var raw = localStorage.getItem("torcida_sessao");
      if (!raw) return;
      var sessao = JSON.parse(raw);
      if (!sessao || !sessao.nome) return;
      $("auth-session").hidden = false;
      $("form-login").hidden = true;
      $("form-cadastro").hidden = true;
      $("session-name").textContent = sessao.nome;
      $("session-club").textContent = sessao.clube || "—";
      $("btn-continue").onclick = function () { location.href = destino; };
      $("btn-switch").onclick = function () {
        localStorage.removeItem("torcida_sessao");
        location.reload();
      };
    } catch (err) {}
  }

  function apiFora(err) {
    return !!(err && (err.offline || err.status === 404 || err.status === 502 || err.status === 503));
  }
  function msgContaOffline() {
    return "Login e cadastro ainda não estão disponíveis aqui. Use Visitante pra explorar o site.";
  }

  $("form-esqueci").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("esqueci-email").value.trim();
    $("erro-esqueci").textContent = "";
    if (!EMAIL.test(email)) {
      shake($("esqueci-email"));
      $("erro-esqueci").textContent = "Informe um e-mail válido.";
      return;
    }
    var btn = $("btn-esqueci");
    loading(btn, true);
    T.api("/api/senha/esqueci", { metodo: "POST", corpo: { email: email }, semRedirecionar: true }).then(function (d) {
      $("erro-esqueci").style.color = "#8a93a6";
      var msg = (d && d.mensagem) || "Se este e-mail estiver cadastrado, enviamos um link.";
      if (d && d.link) {
        $("erro-esqueci").innerHTML = T.esc(msg) +
          '<br><a class="link-reset" href="' + T.esc(d.link) + '">Abrir link pra redefinir senha →</a>';
      } else {
        $("erro-esqueci").textContent = msg;
      }
      loading(btn, false);
    }).catch(function (err) {
      $("erro-esqueci").style.color = "";
      $("erro-esqueci").textContent = apiFora(err) ? msgContaOffline() : (err.message || "Não deu para enviar agora.");
      loading(btn, false);
    });
  });

  $("form-login").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("login-email").value.trim();
    var senha = $("login-senha").value;
    $("erro-login").textContent = "";
    if (!EMAIL.test(email)) {
      shake($("login-email"));
      $("erro-login").textContent = "Informe um e-mail válido.";
      return;
    }
    if (!senha) {
      shake($("login-senha"));
      $("erro-login").textContent = "Informe sua senha.";
      return;
    }
    var btn = $("btn-login");
    loading(btn, true);
    T.api("/api/login", { metodo: "POST", corpo: { email: email, senha: senha }, semRedirecionar: true }).then(function (d) {
      T.salvarSessao(d);
      if (window.AUTH && AUTH.salvarSessaoLocal) {
        AUTH.salvarSessaoLocal({ nome: d.nome || "Torcedor", email: email, clube: d.time || "Santos" });
      } else {
        try {
          localStorage.setItem("torcida_sessao", JSON.stringify({
            nome: d.nome || "Torcedor",
            email: email,
            clube: d.time || "Santos",
            data: new Date().toISOString()
          }));
          localStorage.removeItem("torcida_visitante");
        } catch (e) {}
      }
      mostrarToast("Bem-vindo de volta!");
      setTimeout(function () { location.href = destino; }, 900);
    }).catch(function (err) {
      $("erro-login").textContent = apiFora(err)
        ? msgContaOffline()
        : (err.status === 401 ? "E-mail ou senha inválidos." : (err.message || "Falha ao entrar."));
      shake(err.campo === "email" ? $("login-email") : $("login-senha"));
      loading(btn, false);
    });
  });

  $("form-cadastro").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nome = $("cad-nome").value.trim();
    var email = $("cad-email").value.trim();
    var senha = $("cad-senha").value;
    $("erro-cadastro").textContent = "";
    if (nome.length < 2) {
      shake($("cad-nome"));
      $("erro-cadastro").textContent = "Informe seu nome.";
      return;
    }
    if (!EMAIL.test(email)) {
      shake($("cad-email"));
      $("erro-cadastro").textContent = "E-mail inválido.";
      return;
    }
    if (senha.length < 6) {
      shake($("cad-senha"));
      $("erro-cadastro").textContent = "Senha com no mínimo 6 caracteres.";
      return;
    }
    if (!clubeSelecionado) {
      mostrarToast("Escolha seu clube primeiro!");
      $("erro-cadastro").textContent = "Escolha seu clube.";
      return;
    }
    var usuario = T.normaliza(nome).replace(/[^a-z0-9_]/g, "").slice(0, 20) || "torcedor";
    var btn = $("btn-cadastro");
    loading(btn, true);
    T.api("/api/cadastro", {
      metodo: "POST",
      semRedirecionar: true,
      corpo: {
        nome: nome,
        usuario: usuario,
        email: email,
        senha: senha,
        time: clubeSelecionado.name,
        feedTime: clubeSelecionado.name
      }
    }).then(function (d) {
      T.salvarSessao(d);
      if (window.AUTH && AUTH.salvarSessaoLocal) {
        AUTH.salvarSessaoLocal({ nome: nome, email: email, clube: clubeSelecionado.name });
      } else {
        try {
          localStorage.setItem("torcida_sessao", JSON.stringify({
            nome: nome,
            email: email,
            clube: clubeSelecionado.name,
            data: new Date().toISOString()
          }));
          localStorage.removeItem("torcida_visitante");
        } catch (e) {}
      }
      mostrarToast("Bem-vindo à nação, " + nome + "!");
      setTimeout(function () { location.href = destino; }, 1200);
    }).catch(function (err) {
      $("erro-cadastro").textContent = apiFora(err) ? msgContaOffline() : (err.message || "Não deu para criar a conta.");
      loading(btn, false);
    });
  });

  /* tema salvo */
  try {
    var clubeSalvo = JSON.parse(localStorage.getItem("torcida_clube") || "null");
    if (clubeSalvo && clubeSalvo.color) aplicarAccent(clubeSalvo.color);
  } catch (e) {}

  if (new URLSearchParams(location.search).get("ok") === "senha") {
    mostrarToast("Senha atualizada. Pode entrar.");
  }

  verificarSessao();
  carregarClubes();
  initParticulas();
  initMouseLayers();
})();
