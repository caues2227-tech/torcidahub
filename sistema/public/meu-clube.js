/* Meu Clube: tabela, forma, elenco, artilharia. */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };

  function zona(pos) {
    if (pos <= 6) return "z-lib";
    if (pos <= 12) return "z-sula";
    if (pos >= 17) return "z-reb";
    return "";
  }

  function pintarTabela(tabela, meu) {
    if (!tabela.length) {
      $("mcTabela").innerHTML = T.vazio("Tabela em sincronização", "Assim que a fonte responder, a classificação aparece aqui.");
      return;
    }
    $("mcTabela").innerHTML = '<div class="tabela-wrap"><table class="tabela-mc"><thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th><th>SG</th></tr></thead><tbody>' +
      tabela.map(function (l) {
        return '<tr class="' + zona(l.posicao) + (T.nomeBate(l.time, meu) ? " eu" : "") + '">' +
          "<td>" + l.posicao + '</td><td><span class="celula">' + T.escudo(l.escudo, l.time, "p") + esc(l.time) + "</span></td>" +
          '<td class="pts">' + l.pontos + "</td><td>" + l.jogos + "</td><td>" +
          (l.saldo != null ? (l.saldo > 0 ? "+" : "") + l.saldo : "–") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function pintarUltimos(ult) {
    var lista = (ult || []).slice(0, 10);
    $("mcForma").innerHTML = lista.length
      ? lista.map(function (j) {
          return '<span class="' + esc(j.letra || "") + '">' + esc(j.letra || "?") + "</span>";
        }).join("")
      : '<p class="muted pequeno forma-vazia">Sem forma recente</p>';
    $("mcUltimos").innerHTML = lista.length
      ? lista.map(function (j) {
          return '<a href="' + esc(T.hrefJogo(j)) + '"><span class="' + esc(j.letra) + '">' + esc(j.letra) + "</span><span>" +
            esc(j.mandante) + " " + j.placarMandante + "–" + j.placarVisitante + " " + esc(j.visitante) +
            "</span><small>" + esc(T.dataCurta(j.data)) + "</small></a>";
        }).join("")
      : T.vazio("Ainda sem resultados recentes", "");
  }

  function pintarElenco(jogadores) {
    if (!jogadores.length) {
      $("mcElenco").innerHTML = T.vazio("Elenco indisponível", "A fonte de fotos não respondeu agora.");
      return;
    }
    $("mcElenco").innerHTML = jogadores.map(function (j) {
      var foto = j.foto
        ? '<img src="' + esc(j.foto) + '" alt="" loading="lazy" data-escudo="' + esc(j.nome) + '">'
        : T.monoClube(j.nome);
      return '<div class="elenco-item">' + foto + "<strong>" + esc(j.nome) + "</strong><span>" +
        esc(j.posicao || "") + (j.numero ? " · #" + esc(j.numero) : "") + "</span></div>";
    }).join("");
  }

  function pintarArtilharia(jogadores) {
    // Sem endpoint estável de artilharia: lista honesta a partir do elenco (sem inventar gols)
    var comNum = (jogadores || []).filter(function (j) { return j.numero; }).slice(0, 8);
    if (!comNum.length) {
      $("mcArtilharia").innerHTML = "<li><span>Sem artilharia disponível</span></li>";
      return;
    }
    $("mcArtilharia").innerHTML = '<li class="muted" style="border:0;padding-bottom:4px">Números do elenco (gols oficiais quando a fonte liberar)</li>' +
      comNum.map(function (j) {
        return "<li><span>" + esc(j.nome) + (j.posicao ? " · " + esc(j.posicao) : "") + "</span><b>#" + esc(j.numero) + "</b></li>";
      }).join("");
  }

  function carregar() {
    var e = T.eu();
    $("mcNome").textContent = e.time;
    $("mcEscudo").innerHTML = T.escudo(null, e.time, "g");

    var portalP = T.api("/api/portal", { semRedirecionar: true }).catch(function () {
      return T.portalEstatico ? T.portalEstatico() : Promise.reject(new Error("Sem dados do portal"));
    });
    return Promise.all([
      portalP,
      T.api("/api/avatares?time=" + encodeURIComponent(e.time), { semRedirecionar: true }).catch(function () { return { jogadores: [] }; }),
      T.ultimosEstatico ? T.ultimosEstatico(e.time, 50).catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (res) {
      var p = res[0];
      var av = res[1] || {};
      var ultimosEspn = res[2] || [];
      if (p.tema && p.tema.cores) T.aplicarTema(p.tema.cores, e.time);
      var c = p.clube || {};
      var tab = c.tabela;
      $("mcPos").textContent = tab
        ? tab.posicao + "º · " + tab.pontos + " pts · " + tab.jogos + " jogos"
        : "fora da Série A nesta cobertura";
      pintarTabela(p.tabela || [], e.time);
      var ult = (c.ultimos && c.ultimos.length) ? c.ultimos : ultimosEspn;
      pintarUltimos(ult);
      var jogs = av.jogadores || [];
      pintarElenco(jogs);
      pintarArtilharia(jogs);
    }, function (err) {
      $("mcTabela").innerHTML = T.erroBloco(err.message, "tentarMc");
      var b = $("tentarMc");
      if (b) b.addEventListener("click", carregar);
    });
  }

  T.atualizar(carregar, 120000);
})();
