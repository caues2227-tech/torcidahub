/* Login / cadastro — foto + CSS, sem vídeo. */
(function () {
  "use strict";
  var T = window.Torcida;
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var touch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var voltar = T.voltarUrl();
  var destino = voltar || "/portal.html";
  var clubeSelecionado = null;
  /* Escudos ESPN CDN — funcionam sem o proxy /img/escudo (hosting estático). */
  var ESPN_CREST = {
    Santos: 2674, Flamengo: 819, Palmeiras: 2029, Corinthians: 874,
    "São Paulo": 2026, "Grêmio": 8749, Internacional: 2028, "Atlético-MG": 7632,
    Cruzeiro: 2022, Botafogo: 6086, Vasco: 2675, Bahia: 9967,
    Fortaleza: 6270, "Athletico-PR": 3458, Fluminense: 8745, Bragantino: 6079,
    "Vitória": 2671, "Cuiabá": 18469, Juventude: 6271, "Criciúma": 6272,
    "Atlético-GO": 10357, "América-MG": 6154, Ceará: 9969, Sport: 6125,
    Mirassol: 21977, "Red Bull Bragantino": 6079,
    "Atlético Mineiro": 7632, "Athletico Paranaense": 3458, "Sao Paulo": 2026,
    Gremio: 8749, "Clube de Regatas do Flamengo": 819
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
    { id: "4437", name: "Santos", color: "#1e90ff" },
    { id: "4425", name: "Flamengo", color: "#e0442f" },
    { id: "4440", name: "Palmeiras", color: "#006437" },
    { id: "4431", name: "Corinthians", color: "#1a1a1a" },
    { id: "4432", name: "São Paulo", color: "#c41e3a" },
    { id: "4434", name: "Grêmio", color: "#1e3a6e" },
    { id: "4435", name: "Internacional", color: "#c41e3a" },
    { id: "4436", name: "Atlético-MG", color: "#1a1a1a" },
    { id: "4438", name: "Cruzeiro", color: "#1e5aa8" },
    { id: "4439", name: "Botafogo", color: "#1a1a1a" },
    { id: "4441", name: "Vasco", color: "#1a1a1a" },
    { id: "4442", name: "Bahia", color: "#1e3a6e" },
    { id: "4443", name: "Fortaleza", color: "#c41e3a" },
    { id: "4444", name: "Athletico-PR", color: "#c41e3a" },
    { id: "4445", name: "Fluminense", color: "#006437" },
    { id: "4446", name: "Bragantino", color: "#c41e3a" },
    { id: "4447", name: "Vitória", color: "#c41e3a" },
    { id: "4448", name: "Cuiabá", color: "#006437" },
    { id: "4449", name: "Juventude", color: "#006437" },
    { id: "4450", name: "Criciúma", color: "#ffd600" }
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

  function carregarClubesFallback() {
    var grid = $("club-grid");
    if (!grid) return;
    grid.innerHTML = "";
    FALLBACK.forEach(function (club) { grid.appendChild(criarBotaoClube(club)); });
  }

  function carregarClubes() {
    var grid = $("club-grid");
    if (!grid) return;
    T.api("/api/clubes?pais=Brasil", { semRedirecionar: true }).then(function (d) {
      var lista = (d.clubes || []).slice(0, 20);
      if (!lista.length) throw new Error("vazio");
      grid.innerHTML = "";
      lista.forEach(function (c) {
        grid.appendChild(criarBotaoClube({
          id: String(c.id || c.nome),
          name: c.nome,
          color: (c.cores && c.cores.accent) || "#1e90ff",
          badge: c.escudo
        }));
      });
    }).catch(function () {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
      fetch("https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=Brazilian%20Serie%20A", {
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) { return res.json(); }).then(function (data) {
        clearTimeout(timer);
        var teams = data.teams || data.results || [];
        if (!teams.length) throw new Error("tsdb vazio");
        grid.innerHTML = "";
        teams.slice(0, 20).forEach(function (team) {
          grid.appendChild(criarBotaoClube({
            id: team.idTeam,
            name: team.strTeam,
            color: "#1e90ff",
            badge: team.strBadge
          }));
        });
      }).catch(function () {
        clearTimeout(timer);
        console.warn("TheSportsDB falhou, usando fallback local");
        carregarClubesFallback();
      });
    });
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
      $("erro-esqueci").textContent = (d && d.mensagem) || "Se este e-mail estiver cadastrado, enviamos um link.";
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
