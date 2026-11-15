/* Radar: notícias em formato Instagram — stories no topo + feed vertical. */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };
  var CHAVE_VISTOS = "torcida.radar.vistos";

  var todas = [];
  var filtro = "todas";
  var storyAtivo = null;
  var storyIdx = 0;
  var storyTimer = null;
  var STORY_MS = 5200;

  function lerVistos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_VISTOS) || "{}"); } catch (e) { return {}; }
  }
  function marcarVisto(id) {
    var v = lerVistos();
    v[id] = Date.now();
    try { localStorage.setItem(CHAVE_VISTOS, JSON.stringify(v)); } catch (e) { /* privado */ }
  }
  function jaVisto(id) {
    var v = lerVistos()[id];
    return v && (Date.now() - v) < 36e5;
  }

  function iniciaisFonte(nome) {
    return T.iniciais(nome || "?");
  }

  function gruposStory() {
    var e = T.eu();
    var porFonte = {};
    todas.forEach(function (n) {
      var k = n.fonte || "outra";
      if (!porFonte[k]) porFonte[k] = [];
      porFonte[k].push(n);
    });
    var doClube = todas.filter(function (n) { return T.nomeBate(n.time, e.time); });
    var lista = [
      { id: "clube", nome: e.time, tipo: "clube", itens: doClube, foto: "/img/escudo?time=" + encodeURIComponent(e.time) }
    ];
    Object.keys(porFonte).forEach(function (fid) {
      var itens = porFonte[fid];
      if (!itens.length) return;
      lista.push({
        id: fid,
        nome: itens[0].fonteNome || fid,
        tipo: "fonte",
        itens: itens.slice(0, 12)
      });
    });
    return lista.filter(function (g) { return g.itens && g.itens.length; });
  }

  function pintarStories() {
    var grupos = gruposStory();
    if (!grupos.length) {
      $("stories").innerHTML = "";
      return;
    }
    $("stories").innerHTML = grupos.map(function (g) {
      var visto = g.itens.every(function (n) { return jaVisto(n.id); });
      var avatar = g.foto
        ? '<img src="' + esc(g.foto) + '" alt="" loading="lazy" data-escudo="' + esc(g.nome) + '">'
        : '<span>' + esc(iniciaisFonte(g.nome)) + "</span>";
      return '<button type="button" class="story-bolha' + (visto ? " visto" : "") + '" data-story="' + esc(g.id) + '" aria-label="Stories de ' + esc(g.nome) + '">' +
        '<span class="story-anel">' + avatar + "</span><small>" + esc(g.nome) + "</small></button>";
    }).join("");
  }

  function filtrosDisponiveis() {
    var e = T.eu();
    return [
      { id: "todas", nome: "Todas" },
      { id: "clube", nome: "Meu clube" },
      { id: "jogo", nome: "Jogos" },
      { id: "mercado", nome: "Mercado" }
    ].concat(
      ["ge", "gazeta", "terra"].filter(function (f) {
        return todas.some(function (n) { return n.fonte === f; });
      }).map(function (f) {
        var n = todas.filter(function (x) { return x.fonte === f; })[0];
        return { id: "fonte:" + f, nome: (n && n.fonteNome) || f };
      })
    );
  }

  function pintarFiltros() {
    $("filtros").innerHTML = filtrosDisponiveis().map(function (f) {
      return '<button type="button" class="chip' + (filtro === f.id ? " on" : "") + '" role="tab" aria-selected="' + (filtro === f.id) + '" data-filtro="' + esc(f.id) + '">' + esc(f.nome) + "</button>";
    }).join("");
  }

  function listaFiltrada() {
    var e = T.eu();
    return todas.filter(function (n) {
      if (filtro === "todas") return true;
      if (filtro === "clube") return T.nomeBate(n.time, e.time);
      if (filtro === "jogo") return n.secao === "jogo";
      if (filtro === "mercado") return n.secao === "mercado";
      if (filtro.indexOf("fonte:") === 0) return n.fonte === filtro.slice(6);
      return true;
    }).slice().sort(function (a, b) {
      var ai = a.imagem ? 0 : 1;
      var bi = b.imagem ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return 0;
    });
  }

  function cardInsta(n) {
    var quando = n.publicadoEm ? T.tempoRelativo(n.publicadoEm) : "";
    var handle = (n.fonteNome || "redação").toLowerCase().replace(/\s+/g, "");
    var href = esc(T.hrefSeguro(n.url));
    return '<article class="insta-card">' +
      '<header class="insta-cab">' +
      '<span class="insta-avatar">' + (n.time
        ? '<img src="/img/escudo?time=' + encodeURIComponent(n.time) + '" alt="" loading="lazy" data-escudo="' + esc(n.time) + '">'
        : '<span>' + esc(iniciaisFonte(n.fonteNome)) + "</span>") + "</span>" +
      '<div class="insta-quem"><strong>' + esc(n.fonteNome || "redação") + "</strong>" +
      '<span>' + (n.time ? esc(n.time) + " · " : "") + (quando ? esc(quando) : "@" + esc(handle)) + "</span></div>" +
      '<a class="insta-abrir" href="' + href + '" target="_blank" rel="noopener" aria-label="Mais opções">···</a></header>' +
      (n.imagem
        ? '<a class="insta-foto" href="' + href + '" target="_blank" rel="noopener" data-duplo="' + n.id + '"><img src="' + esc(n.imagem) + '" alt="" loading="lazy" data-some></a>'
        : '<a class="insta-foto insta-foto-texto" href="' + href + '" target="_blank" rel="noopener" data-duplo="' + n.id + '">' +
          (n.time ? '<img class="insta-marca-dagua" src="/img/escudo?time=' + encodeURIComponent(n.time) + '" alt="" loading="lazy" data-escudo="' + esc(n.time) + '">' : "") +
          '<span class="insta-badge">' + esc(n.fonteNome || "Feed") + "</span><p>" + esc(n.titulo) + "</p>" +
          (n.resumo ? '<small>' + esc((n.resumo || "").slice(0, 110)) + "</small>" : "") +
          "</a>") +
      '<div class="insta-acoes">' +
      '<button type="button" class="insta-acao" data-salvar="' + n.id + '" aria-label="Curtir / salvar">' + T.icone("coracao") + "</button>" +
      '<a class="insta-acao" href="' + href + '" target="_blank" rel="noopener" aria-label="Abrir notícia">' + T.icone("comentar") + "</a>" +
      '<a class="insta-acao" href="' + href + '" target="_blank" rel="noopener" aria-label="Compartilhar">' + T.icone("compartilhar") + "</a>" +
      '<button type="button" class="insta-acao insta-acao-fim" data-salvar="' + n.id + '" aria-label="Salvar">' + T.icone("estrela") + "</button></div>" +
      '<div class="insta-legenda"><strong>' + esc(handle) + "</strong> " + esc(n.titulo) +
      (n.resumo ? '<button type="button" class="insta-mais" data-mais="' + n.id + '">mais</button><p class="insta-resumo" id="res-' + n.id + '" hidden>' + esc((n.resumo || "").slice(0, 240)) + "</p>" : "") +
      (quando ? '<time class="insta-quando">' + esc(quando) + "</time>" : "") +
      '</div></article>';
  }

  function pintarFeed() {
    var lista = listaFiltrada();
    if (!lista.length) {
      $("feed").innerHTML = T.vazio("Nada nesse filtro", "Troque o story ou o chip acima pra ver outra cobertura.");
      return;
    }
    $("feed").innerHTML = lista.map(cardInsta).join("");
  }

  function pararStory() {
    if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
  }

  function fecharStory() {
    pararStory();
    storyAtivo = null;
    $("viewer").hidden = true;
    document.body.classList.remove("story-aberto");
    pintarStories();
  }

  function renderStoryFrame() {
    if (!storyAtivo || !storyAtivo.itens.length) { fecharStory(); return; }
    var itens = storyAtivo.itens;
    if (storyIdx < 0) storyIdx = 0;
    if (storyIdx >= itens.length) { fecharStory(); return; }
    var n = itens[storyIdx];
    marcarVisto(n.id);
    $("storyProgress").innerHTML = itens.map(function (_, i) {
      return '<i class="' + (i < storyIdx ? "feita" : i === storyIdx ? "ativa" : "") + '"><b></b></i>';
    }).join("");
    $("storyMeta").innerHTML =
      '<strong>' + esc(storyAtivo.nome) + "</strong>" +
      '<span>' + esc(n.fonteNome || "") + (n.time ? " · " + esc(n.time) : "") + "</span>";
    $("storyCorpo").innerHTML =
      (n.imagem ? '<img src="' + esc(n.imagem) + '" alt="">' : "") +
      '<div class="story-texto"><h2>' + esc(n.titulo) + "</h2>" +
      (n.resumo ? "<p>" + esc((n.resumo || "").slice(0, 220)) + "</p>" : "") +
      '<a class="btn" href="' + esc(T.hrefSeguro(n.url)) + '" target="_blank" rel="noopener">Ler notícia</a></div>';
    pararStory();
    var barra = $("storyProgress").querySelector("i.ativa b");
    if (barra) {
      barra.style.animation = "none";
      void barra.offsetWidth;
      barra.style.animation = "story-fill " + STORY_MS + "ms linear forwards";
    }
    storyTimer = setTimeout(function () { storyIdx += 1; renderStoryFrame(); }, STORY_MS);
  }

  function abrirStory(id) {
    var g = gruposStory().filter(function (x) { return x.id === id; })[0];
    if (!g) return;
    storyAtivo = g;
    storyIdx = 0;
    $("viewer").hidden = false;
    document.body.classList.add("story-aberto");
    renderStoryFrame();
  }

  function salvarLocal(id) {
    var chave = "torcida.radar.salvos";
    var s = [];
    try { s = JSON.parse(localStorage.getItem(chave) || "[]"); } catch (e) { s = []; }
    if (s.indexOf(id) < 0) s.unshift(id);
    try { localStorage.setItem(chave, JSON.stringify(s.slice(0, 40))); } catch (e2) { /* */ }
    T.toast("Salva no Feed", "", "Curtido");
  }

  function marcarCurtida(id) {
    var botoes = $("feed").querySelectorAll('[data-salvar="' + id + '"]');
    Array.prototype.forEach.call(botoes, function (b) { b.classList.add("on"); });
    salvarLocal(Number(id));
  }

  function ligarEventos() {
    var ultimoToque = 0;
    $("stories").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-story]");
      if (b) abrirStory(b.getAttribute("data-story"));
    });
    $("filtros").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-filtro]");
      if (!b) return;
      filtro = b.getAttribute("data-filtro");
      pintarFiltros();
      pintarFeed();
    });
    $("feed").addEventListener("click", function (ev) {
      var foto = ev.target.closest("[data-duplo]");
      if (foto) {
        var agora = Date.now();
        if (agora - ultimoToque < 320) {
          ev.preventDefault();
          marcarCurtida(foto.getAttribute("data-duplo"));
          ultimoToque = 0;
          return;
        }
        ultimoToque = agora;
      }
      var mais = ev.target.closest("[data-mais]");
      if (mais) {
        var bloco = $("res-" + mais.getAttribute("data-mais"));
        if (bloco) { bloco.hidden = !bloco.hidden; mais.hidden = true; }
        return;
      }
      var b = ev.target.closest("[data-salvar]");
      if (b) {
        ev.preventDefault();
        marcarCurtida(b.getAttribute("data-salvar"));
      }
    });
    $("storyFechar").addEventListener("click", fecharStory);
    $("storyPrev").addEventListener("click", function () {
      storyIdx -= 1;
      if (storyIdx < 0) fecharStory();
      else renderStoryFrame();
    });
    $("storyNext").addEventListener("click", function () {
      storyIdx += 1;
      renderStoryFrame();
    });
    document.addEventListener("keydown", function (ev) {
      if ($("viewer").hidden) return;
      if (ev.key === "Escape") fecharStory();
      if (ev.key === "ArrowRight") { storyIdx += 1; renderStoryFrame(); }
      if (ev.key === "ArrowLeft") { storyIdx -= 1; if (storyIdx < 0) fecharStory(); else renderStoryFrame(); }
    });
  }

  function pintar(d) {
    todas = d.noticias || [];
    pintarStories();
    pintarFiltros();
    pintarFeed();
  }

  function carregar() {
    return T.api("/api/noticias?limite=50", { semRedirecionar: true }).then(function (d) {
      if (d && (d.noticias || []).length) return pintar(d);
      return fetch("/noticias.php?modo=global&max=40").then(function (r) { return r.json(); }).then(function (x) {
        pintar({
          noticias: (x.articles || []).map(function (a, i) {
            return {
              id: a.id || i + 1,
              titulo: a.title,
              resumo: a.description || "",
              imagem: a.image || "",
              url: a.url || "#",
              fonteNome: a.source || "Fonte",
              publicadoEm: a.publishedAt
            };
          })
        });
      });
    }).catch(function (err) {
      $("feed").innerHTML = T.erroBloco(err.message, "tentarRadar");
      var b = $("tentarRadar");
      if (b) b.addEventListener("click", function () { $("feed").innerHTML = T.skeleton(2); carregar(); });
    });
  }

  ligarEventos();
  T.atualizar(carregar, 90000);
})();
