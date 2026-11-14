/* Hoje: hero placar, card holo, trilho, troca de clube. */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };
  var ultimoPortal = null;
  var clubesCache = [];

  function splitHora(txt) {
    var m = String(txt || "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { h: ("0" + m[1]).slice(-2), min: m[2] };
  }

  function pintarPlacar(p) {
    var e = T.eu();
    var vivo = (p.jogosHoje || []).concat(p.extra || []).filter(function (j) {
      return j.status === "ao vivo" && (T.nomeBate(j.mandante, e.time) || T.nomeBate(j.visitante, e.time));
    })[0];
    var qualquerVivo = (p.jogosHoje || []).concat(p.extra || []).filter(function (j) { return j.status === "ao vivo"; })[0];
    var alvo = vivo || qualquerVivo;
    var prox = (p.clube && p.clube.proximo) || (p.proximos || [])[0];
    var hero = $("hero");
    var rotulo = $("rotuloHero");
    var ponto = $("pontoVivo");

    if (alvo) {
      hero.classList.add("ao-vivo-modo");
      rotulo.classList.add("vivo");
      ponto.hidden = false;
      $("rotuloTxt").textContent = "Ao vivo";
      $("placarHero").innerHTML =
        '<span class="num-display">' + (alvo.placarMandante != null ? alvo.placarMandante : "0") + "</span>" +
        '<span class="pisca">:</span>' +
        '<span class="num-display">' + (alvo.placarVisitante != null ? alvo.placarVisitante : "0") + "</span>";
      $("ticker").hidden = false;
      var evt = (alvo.mandante || "") + " " + (alvo.placarMandante || 0) + "–" + (alvo.placarVisitante || 0) + " " + (alvo.visitante || "");
      $("tickerPista").innerHTML = "<span>" + esc(evt) + " · bola rolando</span><span>" + esc(evt) + " · bola rolando</span>";
    } else {
      hero.classList.remove("ao-vivo-modo");
      rotulo.classList.remove("vivo");
      ponto.hidden = true;
      $("rotuloTxt").textContent = "Próximo jogo";
      $("ticker").hidden = true;
      var hora = prox && prox.horario ? splitHora(prox.horario) : null;
      if (!hora) {
        var agora = new Date();
        hora = { h: ("0" + agora.getHours()).slice(-2), min: ("0" + agora.getMinutes()).slice(-2) };
      }
      $("placarHero").innerHTML = hora.h + '<span class="pisca">:</span>' + hora.min;
    }
  }

  function pct(n, max) {
    if (n == null || !max) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(n) / max) * 100)));
  }

  function pintarClube(p) {
    var e = T.eu();
    var c = p.clube || {};
    var tab = c.tabela || {};
    var prox = c.proximo;
    var saldo = tab.saldo;
    var saldoTxt = saldo == null ? "–" : (saldo > 0 ? "+" : "") + saldo;
    var saldoNorm = saldo == null ? 0 : Math.min(100, Math.round(((Number(saldo) + 30) / 60) * 100));

    $("clube").innerHTML =
      '<i class="canto tl"></i><i class="canto tr"></i><i class="canto bl"></i><i class="canto br"></i>' +
      '<div class="holo-topo">' +
      '<div class="holo-anel">' + T.escudo(c.escudo, c.nome || e.time, "") + "</div>" +
      '<div><p class="rotulo">Seu clube</p><h2>' + esc(c.nome || e.time) + "</h2>" +
      '<p class="muted pequeno">' + (tab.posicao ? tab.posicao + "º no Brasileirão" : "fora da Série A nesta cobertura") + "</p></div></div>" +
      (tab.pontos != null
        ? '<div class="metricas">' +
          '<div class="metrica"><b class="num-display">' + tab.pontos + '</b><span>Pontos</span><div class="barra"><i style="width:' + pct(tab.pontos, 90) + '%"></i></div></div>' +
          '<div class="metrica"><b class="num-display">' + tab.jogos + '</b><span>Jogos</span><div class="barra"><i style="width:' + pct(tab.jogos, 38) + '%"></i></div></div>' +
          '<div class="metrica' + (saldo > 0 ? " saldo-pos" : "") + '"><b class="num-display">' + saldoTxt + '</b><span>Saldo</span><div class="barra"><i style="width:' + saldoNorm + '%"></i></div></div>' +
          "</div>"
        : "") +
      '<div class="holo-prox"><p class="rotulo">Próximo jogo</p>' +
      (prox
        ? "<strong>" + esc(prox.mandante) + " x " + esc(prox.visitante) + " · " + esc(T.dataCurta(prox.data)) + " " + esc(prox.horario || "") + "</strong>"
        : '<p class="muted pequeno">Sem jogo marcado na janela que a gente acompanha.</p>') +
      "</div>" +
      '<div class="holo-btns">' +
      '<a class="btn-pill" href="/coracao.html?time=' + encodeURIComponent(e.time) + '">Análise do clube</a>' +
      '<button type="button" class="btn-pill" id="btnTrocarClube">Trocar de clube</button>' +
      "</div>";

    var btn = $("btnTrocarClube");
    if (btn) btn.addEventListener("click", abrirTroca);
  }

  function pintar(p) {
    ultimoPortal = p;
    var e = T.eu();
    if (p.tema && p.tema.cores) T.aplicarTema(p.tema.cores, e.time);
    document.title = (p.aoVivo ? "(" + p.aoVivo + " ao vivo) " : "") + "Hoje | Torcida";

    $("titulo").innerHTML = '<span class="mask-linha"><span>Tudo do ' + esc(e.time) + ", agora</span></span>";
    if (window.TorcidaMotion) TorcidaMotion.mascaras();
    $("lead").textContent = p.aoVivo
      ? "Bola rolando no HUD. Placar e notícias atualizam sozinhos."
      : "HUD do seu clube: placar, tabela e notícias sem inventar jogo.";
    $("dataHoje").textContent = "Hoje · " + String(p.data || "").split("-").reverse().join("/");
    if (p.atualizadoEm) {
      $("atualizado").textContent = "placar atualizado às " + new Date(p.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    $("onlineTxt").textContent = (1240 + (e.time.length % 40)) + " torcedores online agora";

    pintarPlacar(p);
    pintarClube(p);

    var m = p.manchete;
    var cm = $("manchete");
    if (m) {
      cm.hidden = false;
      cm.href = T.hrefSeguro(m.url);
      cm.innerHTML =
        '<div class="foto">' + (m.imagem ? '<img src="' + esc(m.imagem) + '" alt="" loading="lazy" data-some data-parallax>' : "") + "</div>" +
        '<div class="corpo"><p class="rotulo">' + esc(m.fonteNome || "redação") + (m.time ? " · " + esc(m.time) : "") + "</p>" +
        "<h2>" + esc(m.titulo) + "</h2><p>" + esc((m.resumo || "").slice(0, 180)) + "</p>" +
        '<p class="destaque-meta">' + esc(m.fonteNome || "") + (m.publicadoEm ? " · " + esc(T.tempoRelativo(m.publicadoEm)) : "") + "</p></div>";
    } else cm.hidden = true;

    if (p.resumo && p.resumo.texto) {
      $("resumoCard").hidden = false;
      $("resumoEscudo").innerHTML = T.escudo(p.resumo.escudo, e.time, "p");
      $("resumoTexto").textContent = p.resumo.texto;
    }

    var hoje = p.jogosHoje || [];
    var extra = p.extra || [];
    var proximos = p.proximos || [];
    var vistos = {};
    function chaveJ(j) {
      return String(j.idJogo || j.espnId || (j.mandante + "|" + j.visitante + "|" + j.data));
    }
    function uniq(lista) {
      return lista.filter(function (j) {
        var k = chaveJ(j);
        if (vistos[k]) return false;
        vistos[k] = true;
        return true;
      });
    }
    var aoVivo = uniq(hoje.concat(extra).filter(function (j) { return j.status === "ao vivo"; }));
    vistos = {};
    var deHoje = uniq(hoje.concat(extra).filter(function (j) { return j.status !== "ao vivo"; }));

    $("secAoVivo").hidden = !aoVivo.length;
    $("aoVivoGrade").innerHTML = aoVivo.map(function (j) { return T.cardJogo(j, { quente: true }); }).join("");

    var trilhoFonte = aoVivo.concat(deHoje).slice(0, 14);
    $("trilhoTitulo").textContent = aoVivo.length ? "Ao vivo e hoje" : (deHoje.length ? "Jogos de hoje" : "Em breve");
    $("trilho").innerHTML = trilhoFonte.length
      ? trilhoFonte.map(function (j) {
          return '<a class="trilho-chip' + (j.status === "ao vivo" ? " vivo" : "") + '" href="' + esc(T.hrefJogo(j)) + '">' +
            (j.status === "ao vivo" ? '<span class="chip-live">LIVE</span>' : "") +
            T.escudo(j.escudoMandante || j.escudoCasa, j.mandante, "p") +
            "<span>" + esc(j.mandante) + " x " + esc(j.visitante) + "</span>" +
            T.escudo(j.escudoVisitante || j.escudoFora, j.visitante, "p") +
            "</a>";
        }).join("")
      : '<span class="muted pequeno">Sem jogos no trilho agora — veja os próximos abaixo.</span>';

    if (deHoje.length) {
      $("hoje").innerHTML = deHoje.map(function (j) { return T.cardJogo(j); }).join("");
    } else if (aoVivo.length) {
      $("hoje").innerHTML = "";
    } else if (proximos.length) {
      $("hoje").innerHTML = "";
    } else {
      $("hoje").innerHTML = '<div class="hoje-vazio" style="grid-column:1/-1">Sem jogos na cobertura agora. <a class="com-ponto" href="/jogos.html">Abrir agenda</a></div>';
    }

    // Sem jogo hoje: sobe os próximos pro destaque (não deixa a home vazia)
    $("secProximos").hidden = !proximos.length;
    $("proximosGrade").innerHTML = proximos.map(function (j) {
      return T.cardJogo(j, { mostrarData: true, hoje: p.data });
    }).join("");
    if (!aoVivo.length && !deHoje.length && proximos.length) {
      $("trilhoTitulo").textContent = "Próximos jogos";
      $("trilho").innerHTML = proximos.slice(0, 12).map(function (j) {
        return '<a class="trilho-chip" href="' + esc(T.hrefJogo(j)) + '">' +
          T.escudo(j.escudoMandante || j.escudoCasa, j.mandante, "p") +
          "<span>" + esc(j.mandante) + " x " + esc(j.visitante) + "</span>" +
          T.escudo(j.escudoVisitante || j.escudoFora, j.visitante, "p") +
          "</a>";
      }).join("");
    }
  }

  function ligarTrilhoDrag() {
    var el = $("trilho");
    var down = false, startX = 0, scroll = 0;
    el.addEventListener("mousedown", function (ev) {
      down = true; startX = ev.pageX; scroll = el.scrollLeft; el.style.cursor = "grabbing";
    });
    window.addEventListener("mouseup", function () { down = false; el.style.cursor = "grab"; });
    el.addEventListener("mousemove", function (ev) {
      if (!down) return;
      el.scrollLeft = scroll - (ev.pageX - startX);
    });
  }

  function abrirTroca() {
    $("trocaTela").hidden = false;
    document.body.style.overflow = "hidden";
    carregarClubes().then(pintarTroca);
  }
  function fecharTroca() {
    $("trocaTela").hidden = true;
    document.body.style.overflow = "";
  }

  function carregarClubes() {
    if (clubesCache.length) return Promise.resolve(clubesCache);
    return T.api("/api/clubes?pais=Brasil", { semRedirecionar: true }).then(function (d) {
      clubesCache = (d.clubes || d || []).filter(function (c) {
        return c && c.nome;
      });
      if (!Array.isArray(clubesCache)) clubesCache = [];
      return clubesCache;
    }).catch(function () {
      clubesCache = ["Flamengo", "Palmeiras", "Corinthians", "São Paulo", "Santos", "Grêmio", "Internacional", "Cruzeiro", "Atlético-MG", "Botafogo", "Fluminense", "Vasco", "Bahia", "Fortaleza", "Athletico-PR", "Bragantino", "Cuiabá", "Vitória", "Juventude", "Criciúma"].map(function (n) {
        return { nome: n };
      });
      return clubesCache;
    });
  }

  function pintarTroca() {
    var q = ($("trocaBusca").value || "").trim().toLowerCase();
    var tab = (ultimoPortal && ultimoPortal.tabela) || [];
    var lista = clubesCache.filter(function (c) {
      return !q || String(c.nome).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    $("trocaGrade").innerHTML = lista.map(function (c) {
      var linha = tab.filter(function (l) { return T.nomeBate(l.time, c.nome); })[0];
      return '<button type="button" class="troca-item" data-time="' + esc(c.nome) + '">' +
        '<span class="anel-escudo">' + T.escudo(c.escudo, c.nome, "") + "</span>" +
        "<strong>" + esc(c.nome) + "</strong>" +
        "<small>" + (linha ? linha.posicao + "º · " + linha.pontos + " pts" : "Brasileirão") + "</small>" +
        "</button>";
    }).join("");
  }

  function escolherClube(nome) {
    var p = T.prefs();
    p.time = nome;
    p.feedTime = nome;
    T.salvarPrefs(p);
    var s = T.sessao();
    if (s) {
      s.time = nome;
      s.feedTime = nome;
      T.salvarSessao(s);
    }
    T.api("/api/tema?time=" + encodeURIComponent(nome) + "&pais=Brasil", { semRedirecionar: true })
      .then(function (d) {
        if (d && d.cores) T.aplicarTema(d.cores, nome);
        fecharTroca();
        location.reload();
      })
      .catch(function () {
        fecharTroca();
        location.reload();
      });
  }

  $("trocaFechar").addEventListener("click", fecharTroca);
  $("trocaBusca").addEventListener("input", pintarTroca);
  $("trocaGrade").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-time]");
    if (b) escolherClube(b.getAttribute("data-time"));
  });

  ligarTrilhoDrag();

  function mostrarErro(e) {
    if (e && e.name === "AbortError") return;
    $("hoje").innerHTML = '<div style="grid-column:1/-1">' + T.erroBloco(e && e.message, "tentarPortal") + "</div>";
    var b = $("tentarPortal");
    if (b) b.addEventListener("click", function () { ctrl.agora(); });
  }

  function carregarPortal() {
    return T.api("/api/portal", { semRedirecionar: true }).then(pintar, function (err) {
      if (err && err.name === "AbortError") return;
      if (!T.portalEstatico) return mostrarErro(err);
      return T.portalEstatico().then(pintar, mostrarErro);
    });
  }

  var ctrl = T.atualizar(function () { return carregarPortal(); }, 45000);
  T.aoVivo(function (d) { if (d.tipo === "gol" || d.tipo === "status") ctrl.agora(); });
})();
