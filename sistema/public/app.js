/* Torcida: núcleo do front-end.
   Sessão, chamadas à API, tema do clube, topo/menu/busca, navegação móvel, modal, eventos ao vivo
   e funções de desenho usadas por todas as páginas. Exposto como window.Torcida. */
(function (w) {
  "use strict";

  /* ---------------------------------------------------------------- armazenamento */
  var CH = { sessao: "torcida.sessao", prefs: "torcida.prefs", cliente: "torcida.cliente", tema: "torcida.tema" };
  function ler(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } }
  function apagar(k) { try { localStorage.removeItem(k); } catch (e) { /* sem acesso */ } }
  apagar("torcida"); // formato antigo (token "aberto")

  function clienteId() {
    var c = ler(CH.cliente);
    if (!c || !/^[a-zA-Z0-9-]{8,64}$/.test(c)) {
      c = (w.crypto && w.crypto.randomUUID) ? w.crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      gravar(CH.cliente, c);
    }
    return c;
  }

  /* ---------------------------------------------------------------- sessão e preferências */
  function sessao() { var s = ler(CH.sessao); return s && s.token ? s : null; }
  function salvarSessao(d) {
    var s = {
      token: d.token, id: d.id, nome: d.nome, usuario: d.usuario || "", foto: d.foto || "",
      time: d.time, feedTime: d.feedTime || d.time, pais: d.pais || "", papel: d.papel || "torcedor", convidado: !!d.convidado
    };
    gravar(CH.sessao, s);
    gravar(CH.prefs, { time: s.time, feedTime: s.feedTime, pais: s.pais, nome: s.nome });
    if (d.tema && d.tema.cores) aplicarTema(d.tema.cores, s.time);
    return s;
  }
  function sair() { apagar(CH.sessao); }
  function prefs() { return ler(CH.prefs) || { time: "Santos", feedTime: "Santos", pais: "Brasil", nome: "" }; }
  function salvarPrefs(p) { gravar(CH.prefs, p); }

  // Quem está usando: conta (com token) ou visitante (só preferências deste navegador).
  function eu() {
    var s = sessao();
    var p = s || prefs();
    return {
      autenticado: !!s, convidado: !!(s && s.convidado), token: s ? s.token : "", id: s ? s.id : 0,
      nome: p.nome || "Visitante", usuario: s ? s.usuario : "", foto: s ? s.foto : "",
      time: p.time || "Santos", feedTime: p.feedTime || p.time || "Santos", pais: p.pais || "Brasil",
      papel: s ? s.papel : "visitante"
    };
  }

  function headers(extra) {
    var e = eu();
    var h = {
      "X-Torcida-Cliente": clienteId(),
      "X-Torcida-Time": encodeURIComponent(e.time),
      "X-Torcida-Feed": encodeURIComponent(e.feedTime),
      "X-Torcida-Nome": encodeURIComponent(e.nome || "")
    };
    if (e.token) h.Authorization = "Bearer " + e.token;
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  var PAGINAS_ENTRADA = ["/login.html", "/cadastro.html", "/onboarding.html"];

  /* ---------------------------------------------------------------- chamadas à API */
  // Lança Error com status, codigo e campo quando o servidor recusa. Falta de rede vira err.offline.
  function api(caminho, o) {
    o = o || {};
    var temCorpo = o.corpo !== undefined;
    return fetch(caminho, {
      method: o.metodo || "GET",
      headers: headers(Object.assign(temCorpo ? { "Content-Type": "application/json" } : {}, o.cabecalhos || {})),
      body: temCorpo ? JSON.stringify(o.corpo) : undefined,
      signal: o.sinal
    }).catch(function (e) {
      if (e && e.name === "AbortError") throw e;
      var err = new Error("Sem conexão com o servidor. Confira sua internet e tente de novo.");
      err.offline = true;
      throw err;
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (dados) {
        if (r.ok) return dados;
        var err = new Error((dados && dados.erro) || "Algo deu errado (" + r.status + ").");
        err.status = r.status;
        err.codigo = (dados && dados.codigo) || "";
        err.campo = (dados && dados.campo) || "";
        err.dados = dados;
        if (r.status === 401 && err.codigo === "sessao_invalida") sair();
        if (r.status === 401 && err.codigo === "login_necessario" && !o.semRedirecionar) {
          if ((o.metodo || "GET") === "GET") {
            // servidor em modo "login obrigatório": leitura também exige conta
            if (PAGINAS_ENTRADA.indexOf(location.pathname) < 0) location.href = "/login.html?voltar=" + encodeURIComponent(location.pathname + location.search);
          } else {
            exigirConta("fazer isso");
          }
        }
        throw err;
      });
    });
  }

  /* ---------------------------------------------------------------- texto, datas e HTML */
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hrefSeguro(u) {
    var s = String(u || "");
    return /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : "#";
  }
  function iniciais(n) { return String(n || "T").trim().charAt(0).toUpperCase() || "T"; }
  function normaliza(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-.]/g, " ").replace(/\s+/g, " ").trim(); }
  function nomeBate(a, b) {
    var x = normaliza(a), y = normaliza(b);
    if (!x || !y) return false;
    return x === y || (" " + x + " ").indexOf(" " + y + " ") >= 0 || (" " + y + " ").indexOf(" " + x + " ") >= 0;
  }
  function contarCaracteres(t) { return Array.from(String(t || "")).length; }

  function tempoRelativo(iso) {
    var t = new Date(iso || 0).getTime();
    if (!t) return "";
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return "agora";
    if (s < 3600) return Math.floor(s / 60) + " min";
    if (s < 86400) return Math.floor(s / 3600) + " h";
    if (s < 604800) return Math.floor(s / 86400) + " d";
    return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  function partesData(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    return { a: Number(p[0]), m: Number(p[1]), d: Number(p[2]), dt: new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) };
  }
  function dataCurta(iso) {
    var p = partesData(iso);
    if (!p) return "";
    return DIAS[p.dt.getDay()].slice(0, 3) + " " + String(p.d).padStart(2, "0") + "/" + String(p.m).padStart(2, "0");
  }
  function dataLonga(iso, hojeIso) {
    var p = partesData(iso);
    if (!p) return String(iso || "");
    if (iso === hojeIso) return "Hoje";
    var h = partesData(hojeIso);
    if (h && Math.round((p.dt - h.dt) / 864e5) === 1) return "Amanhã";
    return DIAS[p.dt.getDay()] + " · " + String(p.d).padStart(2, "0") + "/" + String(p.m).padStart(2, "0");
  }

  /* Escudos ESPN CDN — hosting estático não tem /img/escudo do Node. */
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
    CRB: 9970, "Goiás": 3395, Sport: 7635, "Operário-PR": 18187,
    "São Bernardo": 11268, "Botafogo-SP": 10281, Athletic: 20851, "Cuiabá": 17313,
    "Náutico": 7633, Ceará: 9969, "Avaí": 9966, Londrina: 17333,
    "América-MG": 6154, "América Mineiro": 6154, "Ponte Preta": 3459
  };
  function urlEscudo(nome) {
    if (!nome) return "";
    var id = ESPN_CREST[nome];
    if (!id) {
      var chave = Object.keys(ESPN_CREST).filter(function (k) { return nomeBate(k, nome); })[0];
      id = chave ? ESPN_CREST[chave] : null;
    }
    if (id) return "https://a.espncdn.com/i/teamlogos/soccer/500/" + id + ".png";
    return "/img/crests/" + encodeURIComponent(nome) + ".png";
  }

  function escudo(url, nome, tam) {
    var cls = "escudo" + (tam ? " escudo-" + tam : "");
    var src = url || (nome ? urlEscudo(nome) : "");
    if (!src) return '<span class="' + cls + ' escudo-letra">' + esc(iniciais(nome)) + "</span>";
    return '<img class="' + cls + '" src="' + esc(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-escudo="' + esc(nome || "") + '">';
  }

  function avatar(o) {
    var cls = "avatar" + (o.grande ? " avatar-g" : "") + (o.classe ? " " + o.classe : "");
    // só foto enviada pelo usuário ou avatar gerado vale como foto; o escudo padrão vira o escudo do clube
    var propria = o.foto && /^\/(fotos\/|img\/avatar\?)/.test(o.foto);
    if (propria) return '<span class="' + cls + '"><img src="' + esc(o.foto) + '" alt="" loading="lazy" data-some-troca="' + esc(iniciais(o.nome)) + '"></span>';
    if (o.time) return '<span class="' + cls + ' escudo-av"><img src="' + esc(urlEscudo(o.time)) + '" alt="" loading="lazy" data-escudo="' + esc(o.time) + '"></span>';
    return '<span class="' + cls + '">' + esc(iniciais(o.nome)) + "</span>";
  }

  function placarTxt(j) {
    return j && j.placarMandante != null && j.placarVisitante != null ? j.placarMandante + "–" + j.placarVisitante : "";
  }
  function statusHtml(j) {
    if (j.status === "ao vivo") return '<span class="status status-vivo">ao vivo' + (j.minuto ? " · " + esc(j.minuto) : "") + "</span>";
    if (j.status === "encerrado") return '<span class="status">encerrado</span>';
    return '<span class="status status-hora">' + esc(j.horario || "em breve") + "</span>";
  }
  function hrefJogo(j) {
    var id = j.idJogo || j.espnId || [j.data || "", j.mandante || "", j.visitante || ""].join("|");
    return "/jogo.html?id=" + encodeURIComponent(id);
  }
  function cardJogo(j, o) {
    o = o || {};
    var p = placarTxt(j);
    var cls = "jogo revelar" + (j.quente || o.quente ? " quente" : "") + (j.status === "ao vivo" ? " vivo" : "");
    // o selo do topo já traz a hora do jogo agendado; o rodapé só repete a hora quando o selo mostra outra coisa
    var horaNoSelo = j.status !== "ao vivo" && j.status !== "encerrado";
    var partes = [];
    if (o.mostrarData) partes.push(dataLonga(j.data, o.hoje));
    if (j.horario && !horaNoSelo) partes.push(j.horario);
    if (j.local) partes.push(j.local);
    return '<a class="' + cls + '" href="' + esc(hrefJogo(j)) + '">' +
      '<div class="jogo-topo">' + statusHtml(j) + '<span class="jogo-comp">' + esc(j.competicao || "") + "</span></div>" +
      '<div class="jogo-placar">' +
      '<div class="jogo-time">' + escudo(j.escudoCasa, j.mandante, "g") + "<strong>" + esc(j.mandante) + "</strong></div>" +
      '<div class="jogo-centro' + (p ? "" : " sem") + '">' + (p ? esc(p) : "<span>VS</span>") + "</div>" +
      '<div class="jogo-time dir">' + escudo(j.escudoFora, j.visitante, "g") + "<strong>" + esc(j.visitante) + "</strong></div>" +
      "</div>" +
      '<div class="jogo-rodape"><span>' + esc(partes.join(" · ")) + '</span><span class="ir">abrir análise →</span></div></a>';
  }
  function tickJogo(j) {
    var p = placarTxt(j);
    return '<a class="tick revelar' + (j.status === "ao vivo" ? " vivo" : "") + '" href="' + esc(hrefJogo(j)) + '">' +
      (j.status === "ao vivo" ? '<span class="tick-live">LIVE</span>' : "") +
      escudo(j.escudoCasa, j.mandante, "p") +
      '<span class="tick-nomes">' + esc(j.mandante) + " <b>" + esc(p || "x") + "</b> " + esc(j.visitante) + "</span>" +
      escudo(j.escudoFora, j.visitante, "p") + "</a>";
  }
  function formaPills(letras) {
    if (!letras || !letras.length) return '<span class="muted pequeno">sem sequência</span>';
    return '<span class="forma">' + letras.map(function (l) { return '<span class="pill-res pill-' + esc(l) + '">' + esc(l) + "</span>"; }).join("") + "</span>";
  }
  function skeleton(n, classe) {
    var s = "";
    for (var i = 0; i < (n || 3); i++) s += '<div class="esqueleto ' + (classe || "esqueleto-card") + '"></div>';
    return s;
  }
  function vazio(titulo, texto, acaoHtml) {
    return '<div class="vazio"><strong>' + esc(titulo) + "</strong>" + (texto ? "<span>" + esc(texto) + "</span>" : "") + (acaoHtml || "") + "</div>";
  }
  function erroBloco(msg, idBotao) {
    return '<div class="erro-bloco"><p>' + esc(msg || "Não deu para carregar agora.") + '</p><button type="button" class="btn btn-ghost btn-pequeno" id="' + esc(idBotao || "tentar-de-novo") + '">Tentar de novo</button></div>';
  }

  /* ---------------------------------------------------------------- ícones */
  var I = function (corpo, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + corpo + "</svg>";
  };
  var ICONES = {
    portal: I('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>'),
    jogos: I('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    ranking: I('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    radar: I('<circle cx="12" cy="12" r="2"/><path d="M12 4a8 8 0 0 1 8 8"/><path d="M12 7a5 5 0 0 1 5 5"/><path d="M4.9 7.5A8 8 0 0 0 4 12"/><path d="M7.5 9.2A5 5 0 0 0 7 12"/>'),
    nacao: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18.5 14.8c1.6.8 2.5 2.4 2.5 5.2"/>'),
    bot: I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z"/>'),
    coracao: I('<path d="M12 20.5s-8-4.8-8-11a4.6 4.6 0 0 1 8-3.1 4.6 4.6 0 0 1 8 3.1c0 6.2-8 11-8 11Z"/>'),
    comentar: I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z"/>'),
    compartilhar: I('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/>'),
    lixo: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    grade: I('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    lista: I('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    estrela: I('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>'),
    pessoa: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>')
  };

  /* ---------------------------------------------------------------- tema do clube */
  function aplicarTema(c, time) {
    if (!c || !c.accent) return;
    var r = document.documentElement.style;
    r.setProperty("--accent", c.accent);
    r.setProperty("--on-accent", c.ink);
    r.setProperty("--accent-text", c.text || c.accent);
    r.setProperty("--accent-dim", c.dim);
    r.setProperty("--accent-glow", c.glow);
    r.setProperty("--accent-wash", c.wash);
    r.setProperty("--accent-line", c.line);
    r.setProperty("--accent-soft", (c.accent || "#1e90ff") + "26");
    var salvo = {};
    for (var k in c) salvo[k] = c[k];
    salvo._time = time || eu().time;
    gravar(CH.tema, salvo);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#05070c");
    if (typeof montarMarcaDagua === "function") {
      try { montarMarcaDagua(); } catch (e) { /* chrome ainda não */ }
    }
  }
  function garantirTema() {
    var e = eu();
    var salvo = ler(CH.tema);
    if (salvo && salvo._time === e.time) return Promise.resolve(salvo);
    return api("/api/tema?time=" + encodeURIComponent(e.time) + "&pais=" + encodeURIComponent(e.pais), { semRedirecionar: true })
      .then(function (d) { if (d && d.cores) aplicarTema(d.cores, e.time); return d; })
      .catch(function () { return null; });
  }

  /* ---------------------------------------------------------------- aviso, modal e login */
  function toast(msg, tipo, titulo) {
    var caixa = document.getElementById("toasts");
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.id = "toasts";
      caixa.className = "toasts";
      caixa.setAttribute("aria-live", "polite");
      document.body.appendChild(caixa);
    }
    var t = document.createElement("div");
    t.className = "toast" + (tipo ? " " + tipo : "");
    t.innerHTML = (titulo ? "<b>" + esc(titulo) + "</b>" : "") + esc(msg);
    caixa.appendChild(t);
    setTimeout(function () { t.remove(); }, tipo === "gol" ? 9000 : 4500);
  }

  function abrirModal(o) {
    var raiz = document.createElement("div");
    raiz.className = "modal";
    raiz.setAttribute("role", "dialog");
    raiz.setAttribute("aria-modal", "true");
    raiz.setAttribute("aria-label", o.titulo || "Janela");
    raiz.innerHTML = '<div class="modal-caixa"><div class="modal-cab"><strong>' + esc(o.titulo || "") +
      '</strong><button type="button" class="chip" data-fechar>fechar</button></div><div class="modal-corpo"></div></div>';
    var corpo = raiz.querySelector(".modal-corpo");
    if (typeof o.html === "string") corpo.innerHTML = o.html; else if (o.html) corpo.appendChild(o.html);
    var anterior = document.activeElement;
    function fechar() {
      raiz.remove();
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
      if (anterior && anterior.focus) anterior.focus();
      if (o.aoFechar) o.aoFechar();
    }
    function tecla(ev) {
      if (ev.key === "Escape") { fechar(); return; }
      if (ev.key !== "Tab") return;
      var itens = raiz.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea,select');
      if (!itens.length) return;
      var primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (ev.shiftKey && document.activeElement === primeiro) { ultimo.focus(); ev.preventDefault(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { primeiro.focus(); ev.preventDefault(); }
    }
    raiz.addEventListener("click", function (ev) {
      if (ev.target === raiz || ev.target.closest("[data-fechar]")) fechar();
    });
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    document.body.appendChild(raiz);
    var foco = raiz.querySelector("textarea,input,.modal-corpo a[href],.modal-corpo button") || raiz.querySelector("[data-fechar]");
    if (foco) foco.focus();
    return { fechar: fechar, corpo: corpo, raiz: raiz };
  }

  function voltarUrl() {
    var v = new URLSearchParams(location.search).get("voltar") || "";
    return /^\/(?!\/)[^\s]*$/.test(v) ? v : "";
  }
  var modalContaAberto = false;
  function exigirConta(acao) {
    if (modalContaAberto) return null;
    modalContaAberto = true;
    var voltar = encodeURIComponent(location.pathname + location.search + location.hash);
    return abrirModal({
      aoFechar: function () { modalContaAberto = false; },
      titulo: "Crie uma conta",
      html: '<p class="lead">Visitante só olha. Pra ' + esc(acao || "participar") + ", precisa de uma conta na Torcida.</p>" +
        '<div class="btn-grupo"><a class="btn" href="/login.html?voltar=' + voltar + '#criar">Criar conta</a>' +
        '<a class="btn btn-ghost" href="/login.html?voltar=' + voltar + '#entrar">Já tenho conta</a></div>' +
        '<p class="campo-ajuda">Sem conta você continua vendo feed, jogos e notícias — sem comentar, reagir ou falar com o Bot.</p>'
    });
  }

  /* ---------------------------------------------------------------- atualização periódica */
  // Roda agora e repete a cada `ms` enquanto a aba estiver visível; ao voltar para a aba, atualiza se estiver velho.
  function atualizar(fn, ms) {
    var timer = 0, ultimo = 0, rodando = false;
    function rodar() {
      if (rodando) return Promise.resolve();
      rodando = true;
      return Promise.resolve().then(fn).catch(function () { /* a própria página mostra o erro */ }).then(function () { rodando = false; ultimo = Date.now(); });
    }
    function agendar() {
      clearTimeout(timer);
      timer = setTimeout(function () { (document.hidden ? Promise.resolve() : rodar()).then(agendar); }, ms);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - ultimo > ms) rodar(); });
    rodar();
    agendar();
    return { agora: rodar };
  }

  /* ---------------------------------------------------------------- eventos ao vivo */
  // A conexão ao vivo só fica aberta enquanto a aba está à vista: o navegador aceita poucas conexões
  // simultâneas por site (6), e abas esquecidas em segundo plano não podem consumir esse limite.
  var fonte = null;
  var ouvintes = [];
  var pedidoAoVivo = false;
  function fecharAoVivo() {
    if (fonte) { fonte.close(); fonte = null; }
  }
  function aoVivo(fn) {
    if (typeof fn === "function") ouvintes.push(fn);
    pedidoAoVivo = true;
    if (document.hidden) return; // abre quando a aba voltar a ficar visível
    abrirAoVivo();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) fecharAoVivo();
    else if (pedidoAoVivo) abrirAoVivo();
  });
  w.addEventListener("pagehide", fecharAoVivo);
  w.addEventListener("pageshow", function (ev) { if (ev.persisted && pedidoAoVivo && !document.hidden) abrirAoVivo(); });
  function abrirAoVivo() {
    if (fonte || !w.EventSource) return;
    fonte = new EventSource("/api/stream");
    fonte.onmessage = function (ev) {
      var d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (!d || d.tipo === "abriu") return;
      if (d.tipo === "gol" && d.jogo) {
        var e = eu();
        if ([e.time, e.feedTime].some(function (t) { return nomeBate(t, d.jogo.mandante) || nomeBate(t, d.jogo.visitante); })) {
          toast(d.jogo.mandante + " " + d.jogo.placarMandante + "–" + d.jogo.placarVisitante + " " + d.jogo.visitante + (d.jogo.minuto ? " · " + d.jogo.minuto : ""), "gol", "GOL!");
        }
      }
      ouvintes.forEach(function (f) { try { f(d); } catch (e2) { /* ouvinte com defeito não derruba os outros */ } });
    };
    fonte.onerror = function () {
      /* Hosting estático / API offline: não fica reconectando em loop. */
      fecharAoVivo();
      pedidoAoVivo = false;
    };
  }

  /* ---------------------------------------------------------------- topo, menu e busca */
  // Hoje · Meu Clube · Jogos · Nação · Bot (atalhos 1–5)
  var MENU = [
    ["Hoje", "/portal.html", "portal"],
    ["Meu Clube", "/meu-clube.html", "coracao"],
    ["Jogos", "/jogos.html", "jogos"],
    ["Nação", "/feed.html", "nacao"],
    ["Bot", "/chatbot.html", "bot"]
  ];

  function paginaAtual() { return location.pathname === "/" ? "/portal.html" : location.pathname; }

  function menuUsuarioHtml(e) {
    var linhas = "";
    if (e.autenticado) {
      linhas += '<div class="cab"><b>' + esc(e.nome) + "</b><span>" + (e.usuario ? "@" + esc(e.usuario) + " · " : "") + esc(e.time) + (e.convidado ? " · perfil rápido" : "") + "</span></div>";
      linhas += '<a href="/feed.html#perfil" role="menuitem">Meu perfil</a>';
      linhas += '<a href="/ranking.html" role="menuitem">Ranking de torcida</a>';
      linhas += '<a href="/onboarding.html" role="menuitem">Trocar de clube</a>';
      if (e.convidado) linhas += '<a href="/cadastro.html" role="menuitem">Criar conta (guardar meu perfil)</a>';
      linhas += '<button type="button" class="sair" role="menuitem" id="btnSair">Sair</button>';
    } else {
      linhas += '<div class="cab"><b>Você está como visitante</b><span>Vendo o ' + esc(e.time) + "</span></div>";
      linhas += '<a href="/onboarding.html" role="menuitem">Escolher meu clube</a>';
      linhas += '<a href="/ranking.html" role="menuitem">Ranking de torcida</a>';
      linhas += '<a href="/login.html" role="menuitem">Entrar</a>';
      linhas += '<a href="/cadastro.html" role="menuitem">Criar conta</a>';
    }
    return linhas;
  }

  function montarTopo() {
    var topo = document.getElementById("topo");
    if (!topo) return;
    var e = eu();
    var atual = paginaAtual();
    topo.innerHTML =
      '<div class="topo-in">' +
      '<a class="marca" href="/portal.html" aria-label="Torcida"><span class="marca-logo" aria-hidden="true">T</span><span class="marca-nome">TORCIDA<i>.</i></span></a>' +
      '<button type="button" class="btn-hamb" id="btnHamb" aria-label="Abrir menu"><span></span><span></span><span></span></button>' +
      '<nav class="menu" aria-label="Principal">' + MENU.map(function (m) {
        return '<a class="com-ponto" href="' + m[1] + '"' + (atual === m[1] ? ' aria-current="page"' : "") + ">" + m[0] + "</a>";
      }).join("") + "</nav>" +
      '<div class="topo-direita">' +
      '<form class="busca" role="search" id="buscaForm"><label class="so-leitor" for="buscaQ">Buscar clube, jogo ou notícia</label>' +
      '<input id="buscaQ" name="q" type="search" placeholder="clube, jogo, notícia…" autocomplete="off" maxlength="80" aria-controls="buscaLista">' +
      '<div class="busca-lista" id="buscaLista" role="listbox" hidden></div></form>' +
      '<div class="usuario"><button type="button" class="usuario-btn" id="btnUsuario" aria-haspopup="menu" aria-expanded="false" aria-label="Menu da conta">' +
      avatar({ foto: e.foto, nome: e.nome, time: e.time }) +
      '<span class="usuario-txt"><b>' + esc(e.autenticado ? e.nome : "Visitante") + "</b><small>" + esc(e.time) + "</small></span></button>" +
      '<div class="usuario-menu" id="menuUsuario" role="menu" hidden>' + menuUsuarioHtml(e) + "</div></div>" +
      "</div></div>";

    if (!document.getElementById("menuMobile")) {
      var mob = document.createElement("div");
      mob.id = "menuMobile";
      mob.className = "menu-mobile";
      mob.innerHTML = '<button type="button" class="fechar-menu" data-fechar-menu aria-label="Fechar">×</button>' +
        MENU.map(function (m) {
          return '<a href="' + m[1] + '"' + (atual === m[1] ? ' aria-current="page"' : "") + ">" + m[0] + "</a>";
        }).join("");
      document.body.appendChild(mob);
    }

    var btn = document.getElementById("btnUsuario");
    var menu = document.getElementById("menuUsuario");
    function fecharMenu() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", function (ev) { if (!menu.contains(ev.target)) fecharMenu(); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fecharMenu(); });
    var sairBtn = document.getElementById("btnSair");
    if (sairBtn) {
      sairBtn.addEventListener("click", function () {
        api("/api/logout", { metodo: "POST", semRedirecionar: true }).catch(function () { /* sair não depende do servidor */ }).then(function () {
          sair();
          location.href = "/login.html";
        });
      });
    }
    ligarBusca();
  }

  function montarMarcaDagua() {
    if (PAGINAS_ENTRADA.indexOf(location.pathname) >= 0) return;
    var el = document.getElementById("marcaDagua");
    if (!el) {
      el = document.createElement("div");
      el.id = "marcaDagua";
      el.className = "marca-dagua";
      el.setAttribute("aria-hidden", "true");
      document.body.prepend(el);
    }
    el.innerHTML = "<b>" + esc((eu().time || "TORCIDA").toUpperCase()) + "</b>";
  }

  function montarRodape() {
    if (PAGINAS_ENTRADA.indexOf(location.pathname) >= 0) return;
    if (document.getElementById("rodapeAkari")) return;
    var r = document.createElement("footer");
    r.id = "rodapeAkari";
    r.className = "rodape-akari";
    r.innerHTML =
      '<div class="rodape-in">' +
      '<div><h3>Links</h3>' + MENU.map(function (m) { return '<a class="com-ponto" href="' + m[1] + '">' + m[0] + "</a>"; }).join("") + "</div>" +
      '<div><h3>Contato</h3><a class="com-ponto" href="/chatbot.html">Falar com o Bot</a><a class="com-ponto" href="/ranking.html">Ranking</a></div>' +
      '<div><h3>Conta</h3><a class="com-ponto" href="/login.html">Entrar</a><a class="com-ponto" href="/onboarding.html">Trocar de clube</a></div>' +
      '<div><button type="button" class="voltar-topo com-ponto" id="voltarTopo">Voltar ao topo <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>' +
      '</div><div class="rodape-gigante" aria-hidden="true">TORCIDA.</div>';
    document.body.appendChild(r);
    document.getElementById("voltarTopo").addEventListener("click", function () {
      if (window.TorcidaLenis) window.TorcidaLenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function ligarBusca() {
    var form = document.getElementById("buscaForm");
    var inp = document.getElementById("buscaQ");
    var lista = document.getElementById("buscaLista");
    if (!form) return;
    var timer = 0, seq = 0;
    function irBot(q) { location.href = "/chatbot.html?q=" + encodeURIComponent(q); }
    function fechar() { lista.hidden = true; lista.innerHTML = ""; }
    function pintar(d, q) {
      var h = "";
      if ((d.clubes || []).length) {
        h += '<div class="busca-grupo">Clubes</div>' + d.clubes.map(function (c) {
          return '<a href="/coracao.html?time=' + encodeURIComponent(c.nome) + '" role="option">' + escudo(c.escudo, c.nome, "p") + "<span>" + esc(c.nome) + "</span></a>";
        }).join("");
      }
      if ((d.jogos || []).length) {
        h += '<div class="busca-grupo">Jogos</div>' + d.jogos.slice(0, 5).map(function (j) {
          return '<a href="' + esc(hrefJogo(j)) + '" role="option"><span>' + esc(j.mandante) + " x " + esc(j.visitante) + "</span><small>" + esc(dataCurta(j.data)) + "</small></a>";
        }).join("");
      }
      if ((d.noticias || []).length) {
        h += '<div class="busca-grupo">Notícias</div>' + d.noticias.slice(0, 4).map(function (n) {
          return '<a href="' + esc(hrefSeguro(n.url)) + '" target="_blank" rel="noopener" role="option"><span>' + esc(n.titulo) + "</span></a>";
        }).join("");
      }
      h += '<button type="button" class="busca-bot" data-bot="1" role="option">Perguntar ao bot: “' + esc(q) + "”</button>";
      lista.innerHTML = h;
      lista.hidden = false;
    }
    inp.addEventListener("input", function () {
      clearTimeout(timer);
      var q = inp.value.trim();
      if (q.length < 2) { fechar(); return; }
      timer = setTimeout(function () {
        var minha = ++seq;
        api("/api/busca?q=" + encodeURIComponent(q), { semRedirecionar: true }).then(function (d) {
          if (minha === seq) pintar(d, q);
        }).catch(function () { if (minha === seq) pintar({}, q); });
      }, 220);
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { fechar(); return; }
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      var itens = Array.prototype.slice.call(lista.querySelectorAll("a,button"));
      if (!itens.length) return;
      ev.preventDefault();
      var i = itens.indexOf(document.activeElement);
      i = ev.key === "ArrowDown" ? Math.min(itens.length - 1, i + 1) : Math.max(0, i - 1);
      itens[i].focus();
    });
    lista.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-bot]")) irBot(inp.value.trim());
    });
    lista.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { fechar(); inp.focus(); }
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var q = inp.value.trim();
      if (q) irBot(q);
    });
    document.addEventListener("click", function (ev) { if (!form.contains(ev.target)) fechar(); });
  }

  function montarDock() {
    var dock = document.getElementById("dock");
    if (!dock) {
      dock = document.createElement("nav");
      dock.id = "dock";
      dock.className = "dock";
      dock.setAttribute("aria-label", "Navegação");
      document.body.appendChild(dock);
    }
    var atual = paginaAtual();
    dock.innerHTML = MENU.map(function (m) {
      return '<a href="' + m[1] + '"' + (atual === m[1] ? ' aria-current="page"' : "") + ">" + ICONES[m[2]] + "<span>" + m[0] + "</span></a>";
    }).join("");
  }

  function montarChrome() {
    if (PAGINAS_ENTRADA.indexOf(location.pathname) >= 0) return;
    montarMarcaDagua();
    montarTopo();
    montarDock();
    montarRodape();
    aoVivo();
  }

  function monoClube(nome, classe) {
    return '<span class="mono-clube ' + (classe || "") + '" aria-hidden="true">' + esc(iniciais(nome)) + "</span>";
  }

  /* ---------------------------------------------------------------- imagens quebradas */
  // Escudo que não carrega troca para o desenho padrão do servidor; foto decorativa quebrada some.
  document.addEventListener("error", function (ev) {
    var el = ev.target;
    if (!el || el.tagName !== "IMG") return;
    if (el.dataset.escudo !== undefined) {
      if (!el.dataset.tentou) {
        el.dataset.tentou = "1";
        var cdn = urlEscudo(el.dataset.escudo || "");
        if (cdn && el.src.indexOf(cdn) < 0) {
          el.src = cdn;
          return;
        }
      }
      var s = document.createElement("span");
      s.className = (el.className || "") + " mono-clube escudo-letra";
      s.textContent = iniciais(el.dataset.escudo);
      el.replaceWith(s);
      return;
    }
    if (el.dataset.someTroca !== undefined) {
      el.replaceWith(document.createTextNode(el.dataset.someTroca));
      return;
    }
    var alvo = el.closest("[data-some-pai]") || (el.dataset.some !== undefined ? el : null);
    if (alvo) alvo.remove();
  }, true);

  /* ---------------------------------------------------------------- inicialização */
  w.Torcida = {
    eu: eu, sessao: sessao, salvarSessao: salvarSessao, sair: sair, prefs: prefs, salvarPrefs: salvarPrefs,
    api: api, headers: headers, clienteId: clienteId,
    esc: esc, hrefSeguro: hrefSeguro, iniciais: iniciais, normaliza: normaliza, nomeBate: nomeBate, contarCaracteres: contarCaracteres,
    tempoRelativo: tempoRelativo, dataCurta: dataCurta, dataLonga: dataLonga,
    escudo: escudo, urlEscudo: urlEscudo, monoClube: monoClube, avatar: avatar, placarTxt: placarTxt, statusHtml: statusHtml, hrefJogo: hrefJogo, cardJogo: cardJogo, tickJogo: tickJogo,
    formaPills: formaPills, skeleton: skeleton, vazio: vazio, erroBloco: erroBloco, icone: function (n) { return ICONES[n] || ""; },
    aplicarTema: aplicarTema, garantirTema: garantirTema, montarMarcaDagua: montarMarcaDagua,
    toast: toast, abrirModal: abrirModal, exigirConta: exigirConta, voltarUrl: voltarUrl,
    atualizar: atualizar, aoVivo: aoVivo, MENU: MENU
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  function iniciar() {
    montarChrome();
    garantirTema();
    if (!document.body.classList.contains("auth-page") && !w.TorcidaFundo) {
      var s = document.createElement("script");
      s.src = "/js/fundo.js";
      s.defer = true;
      document.head.appendChild(s);
    }
    if (!w.TorcidaNotif) {
      var sn = document.createElement("script");
      sn.src = "/js/notif.js";
      sn.defer = true;
      document.head.appendChild(sn);
    }
  }
})(window);
