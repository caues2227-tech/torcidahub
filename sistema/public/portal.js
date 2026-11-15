/* Hoje: hero placar, card holo, trilho, troca de clube. */
(function () {
  "use strict";
  var T = window.Torcida;
  if (!T) {
    console.error("[portal] Torcida app.js não carregou");
    return;
  }
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };
  var ultimoPortal = null;
  var clubesCache = [];
  var ctrl = null;

  function splitHora(txt) {
    var m = String(txt || "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { h: ("0" + m[1]).slice(-2), min: m[2] };
  }

  function jogoDoMeuTime(j, time) {
    return T.nomeBate(j.mandante, time) || T.nomeBate(j.visitante, time);
  }

  function pintarPlacar(p) {
    var e = T.eu();
    var vivo = (p.jogosHoje || []).concat(p.extra || []).filter(function (j) {
      return j.status === "ao vivo" && jogoDoMeuTime(j, e.time);
    })[0];
    var hero = $("hero");
    var rotulo = $("rotuloHero");
    var ponto = $("pontoVivo");
    var placar = $("placarHero");
    var atualizado = $("atualizado");
    if (!hero || !rotulo || !placar) return;

    if (vivo) {
      hero.classList.add("ao-vivo-modo");
      rotulo.hidden = false;
      rotulo.classList.add("vivo");
      if (ponto) ponto.hidden = false;
      if ($("rotuloTxt")) $("rotuloTxt").textContent = "Ao vivo";
      placar.hidden = false;
      placar.innerHTML =
        '<span class="num-display">' + (vivo.placarMandante != null ? vivo.placarMandante : "0") + "</span>" +
        '<span class="pisca">:</span>' +
        '<span class="num-display">' + (vivo.placarVisitante != null ? vivo.placarVisitante : "0") + "</span>";
      if ($("ticker")) $("ticker").hidden = false;
      var evt = (vivo.mandante || "") + " " + (vivo.placarMandante || 0) + "–" + (vivo.placarVisitante || 0) + " " + (vivo.visitante || "");
      if ($("tickerPista")) {
        $("tickerPista").innerHTML = "<span>" + esc(evt) + " · bola rolando</span><span>" + esc(evt) + " · bola rolando</span>";
      }
      if (atualizado) {
        atualizado.hidden = false;
        if (p.atualizadoEm) {
          atualizado.textContent = "placar atualizado às " + new Date(p.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        }
      }
    } else {
      hero.classList.remove("ao-vivo-modo");
      rotulo.hidden = true;
      rotulo.classList.remove("vivo");
      if (ponto) ponto.hidden = true;
      placar.hidden = true;
      placar.innerHTML = "";
      if ($("ticker")) $("ticker").hidden = true;
      if (atualizado) { atualizado.hidden = true; atualizado.textContent = ""; }
    }
  }

  function pct(n, max) {
    if (n == null || !max) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(n) / max) * 100)));
  }

  function pintarClube(p) {
    var box = $("clube");
    if (!box) return;
    var e = T.eu();
    var c = p.clube || {};
    var tab = c.tabela || {};
    var prox = c.proximo;
    var saldo = tab.saldo;
    var saldoTxt = saldo == null ? "–" : (saldo > 0 ? "+" : "") + saldo;
    var saldoNorm = saldo == null ? 0 : Math.min(100, Math.round(((Number(saldo) + 30) / 60) * 100));

    box.innerHTML =
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
    if (!p) return;
    ultimoPortal = p;
    var e = T.eu();
    try {
      if (p.tema && p.tema.cores) T.aplicarTema(p.tema.cores, e.time);
    } catch (errTema) { /* tema opcional */ }

    var meuVivo = (p.jogosHoje || []).concat(p.extra || []).some(function (j) {
      return j.status === "ao vivo" && jogoDoMeuTime(j, e.time);
    });
    document.title = (meuVivo ? "(ao vivo) " : "") + "Hoje | Torcida";

    if ($("titulo")) {
      $("titulo").textContent = "Tudo do " + e.time + ", agora";
    }
    if ($("lead")) {
      $("lead").textContent = meuVivo
        ? "Seu clube tá em campo. Placar real, sem inventar."
        : "Sem jogo do " + e.time + " agora. Tabela, próximo confronto e notícias abaixo.";
    }
    if ($("dataHoje")) {
      $("dataHoje").textContent = "Hoje · " + String(p.data || "").split("-").reverse().join("/");
    }

    pintarPlacar(p);
    pintarClube(p);

    var m = p.manchete;
    var cm = $("manchete");
    if (cm) {
      var imgOk = m && m.imagem && String(m.imagem).indexOf("http") === 0 &&
        String(m.imagem).toLowerCase().indexOf("j6_cofb") < 0;
      if (m && imgOk) {
        cm.hidden = false;
        cm.href = T.hrefSeguro(m.url);
        cm.innerHTML =
          '<div class="foto"><img src="' + esc(m.imagem) + '" alt="" loading="lazy" onerror="this.closest(\'#manchete\').hidden=true"></div>' +
          '<div class="corpo"><p class="rotulo">' + esc(m.fonteNome || "redação") + (m.time ? " · " + esc(m.time) : "") + "</p>" +
          "<h2>" + esc(m.titulo) + "</h2><p>" + esc((m.resumo || "").slice(0, 180)) + "</p></div>";
      } else cm.hidden = true;
    }

    if (p.resumo && p.resumo.texto && $("resumoCard")) {
      $("resumoCard").hidden = false;
      if ($("resumoEscudo")) $("resumoEscudo").innerHTML = T.escudo(p.resumo.escudo, e.time, "p");
      if ($("resumoTexto")) $("resumoTexto").textContent = p.resumo.texto;
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

    var aoVivo = uniq(hoje.concat(extra).filter(function (j) {
      return j.status === "ao vivo" && jogoDoMeuTime(j, e.time);
    }));
    vistos = {};
    var deHoje = uniq(hoje.concat(extra).filter(function (j) {
      return j.status !== "ao vivo" && jogoDoMeuTime(j, e.time);
    }));
    vistos = {};
    var ligaHoje = uniq(hoje.concat(extra).filter(function (j) {
      return j.status !== "ao vivo" && !jogoDoMeuTime(j, e.time);
    }));

    if ($("secAoVivo")) $("secAoVivo").hidden = !aoVivo.length;
    if ($("aoVivoGrade")) {
      $("aoVivoGrade").innerHTML = aoVivo.map(function (j) { return T.cardJogo(j, { quente: true }); }).join("");
    }

    var trilhoFonte = aoVivo.concat(deHoje).concat(ligaHoje).slice(0, 14);
    if ($("trilhoTitulo")) {
      $("trilhoTitulo").textContent = aoVivo.length
        ? "Seu clube ao vivo"
        : (deHoje.length ? "Jogo do seu clube hoje" : (ligaHoje.length ? "Outros jogos de hoje" : "Em breve"));
    }
    if ($("trilho")) {
      $("trilho").innerHTML = trilhoFonte.length
        ? trilhoFonte.map(function (j) {
            return '<a class="trilho-chip' + (j.status === "ao vivo" ? " vivo" : "") + '" href="' + esc(T.hrefJogo(j)) + '">' +
              (j.status === "ao vivo" ? '<span class="chip-live">LIVE</span>' : "") +
              T.escudo(j.escudoMandante || j.escudoCasa, j.mandante, "p") +
              "<span>" + esc(j.mandante) + " x " + esc(j.visitante) + "</span>" +
              T.escudo(j.escudoVisitante || j.escudoFora, j.visitante, "p") +
              "</a>";
          }).join("")
        : '<span class="muted pequeno">Sem jogo do ' + esc(e.time) + " hoje — confira os próximos abaixo.</span>";
    }

    if ($("hoje")) {
      if (aoVivo.length || deHoje.length) {
        $("hoje").innerHTML = aoVivo.concat(deHoje).map(function (j) { return T.cardJogo(j, { quente: j.status === "ao vivo" }); }).join("");
      } else {
        $("hoje").innerHTML = '<div class="hoje-vazio" style="grid-column:1/-1">O ' + esc(e.time) + ' não joga hoje. <a class="com-ponto" href="/jogos.html">Ver agenda</a></div>';
      }
    }

    var meusProximos = (proximos || []).filter(function (j) { return jogoDoMeuTime(j, e.time); });
    var listaProx = meusProximos.length ? meusProximos : proximos;
    if ($("secProximos")) $("secProximos").hidden = !listaProx.length;
    if ($("proximosGrade")) {
      $("proximosGrade").innerHTML = listaProx.map(function (j) {
        return T.cardJogo(j, { mostrarData: true, hoje: p.data });
      }).join("");
    }
    if (!aoVivo.length && !deHoje.length && listaProx.length && $("trilho")) {
      if ($("trilhoTitulo")) $("trilhoTitulo").textContent = "Próximos do " + e.time;
      $("trilho").innerHTML = listaProx.slice(0, 12).map(function (j) {
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
    if (!el) return;
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
    if (!$("trocaTela")) return;
    $("trocaTela").hidden = false;
    document.body.style.overflow = "hidden";
    carregarClubes().then(pintarTroca);
  }
  function fecharTroca() {
    if ($("trocaTela")) $("trocaTela").hidden = true;
    document.body.style.overflow = "";
  }

  function carregarClubes() {
    if (clubesCache.length) return Promise.resolve(clubesCache);
    return T.api("/api/clubes?pais=Brasil", { semRedirecionar: true }).then(function (d) {
      clubesCache = (d.clubes || d || []).filter(function (c) { return c && c.nome; });
      if (!Array.isArray(clubesCache)) clubesCache = [];
      return clubesCache;
    }).catch(function () {
      clubesCache = ["Flamengo", "Palmeiras", "Corinthians", "São Paulo", "Santos", "Grêmio", "Internacional", "Cruzeiro", "Atlético-MG", "Botafogo", "Fluminense", "Vasco", "Bahia", "Fortaleza", "Athletico-PR", "Bragantino", "Cuiabá", "Vitória", "Juventude"].map(function (n) {
        return { nome: n };
      });
      return clubesCache;
    });
  }

  function pintarTroca() {
    if (!$("trocaGrade")) return;
    var q = (($("trocaBusca") && $("trocaBusca").value) || "").trim().toLowerCase();
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
    Promise.resolve(T.registrarVotoClube ? T.registrarVotoClube(nome) : null).then(function () {
      return T.api("/api/tema?time=" + encodeURIComponent(nome) + "&pais=Brasil", { semRedirecionar: true });
    }).then(function (d) {
      if (d && d.cores) T.aplicarTema(d.cores, nome);
      fecharTroca();
      location.reload();
    }).catch(function () {
      fecharTroca();
      location.reload();
    });
  }

  function mostrarErro(e) {
    if (e && e.name === "AbortError") return;
    if ($("hoje")) {
      $("hoje").innerHTML = '<div style="grid-column:1/-1">' + T.erroBloco(e && e.message, "tentarPortal") + "</div>";
      var b = $("tentarPortal");
      if (b && ctrl) b.addEventListener("click", function () { ctrl.agora(); });
    }
  }

  function lerCacheLocal() {
    try {
      var raw = sessionStorage.getItem("torcida_portal_v1");
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.data || c.exp < Date.now()) return null;
      if (c.time !== T.eu().time) return null;
      return c.data;
    } catch (e) { return null; }
  }

  function gravarCacheLocal(p) {
    try {
      sessionStorage.setItem("torcida_portal_v1", JSON.stringify({
        exp: Date.now() + 90000,
        time: T.eu().time,
        data: p
      }));
    } catch (e) { /* quota */ }
  }

  function buscarPortal() {
    /* Nunca espera prefetch infinito — timeout 2.5s e cai no /api/portal */
    var early = window.__torcidaPortalEarly || window.__torcidaPortalBoot;
    window.__torcidaPortalEarly = null;
    window.__torcidaPortalBoot = null;

    var api = function () { return T.api("/api/portal", { semRedirecionar: true }); };

    if (!early) return api();

    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        api().then(resolve, reject);
      }, 2500);

      Promise.resolve(early).then(function (p) {
        if (done) return;
        if (p && (p.jogosHoje || p.clube)) {
          done = true;
          clearTimeout(timer);
          resolve(p);
        } else {
          done = true;
          clearTimeout(timer);
          api().then(resolve, reject);
        }
      }, function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        api().then(resolve, reject);
      });
    });
  }

  function carregarPortal() {
    var local = lerCacheLocal();
    if (local) {
      try { pintar(local); } catch (e0) { /* cache velho */ }
    }

    return buscarPortal().then(function (p) {
      gravarCacheLocal(p);
      pintar(p);
    }, function (err) {
      if (err && err.name === "AbortError") return;
      if (local) return;
      if (!T.portalEstatico) return mostrarErro(err);
      return T.portalEstatico().then(pintar, mostrarErro);
    });
  }

  /* Boot: dados primeiro; UI secundária não pode travar a carga */
  try {
    ctrl = T.atualizar(function () { return carregarPortal(); }, 90000);
  } catch (bootErr) {
    console.error("[portal] boot", bootErr);
    carregarPortal();
  }

  try {
    if ($("trocaFechar")) $("trocaFechar").addEventListener("click", fecharTroca);
    if ($("trocaBusca")) $("trocaBusca").addEventListener("input", pintarTroca);
    if ($("trocaGrade")) {
      $("trocaGrade").addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-time]");
        if (b) escolherClube(b.getAttribute("data-time"));
      });
    }
    ligarTrilhoDrag();
  } catch (uiErr) {
    console.error("[portal] ui", uiErr);
  }
})();
