/* Meu Clube: tabela, forma, elenco, artilharia — carga paralela. */
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
    if (!jogadores || !jogadores.length) {
      $("mcElenco").innerHTML = T.vazio("Elenco indisponível", "Não achamos o elenco deste clube agora. Tenta de novo em instantes.");
      return;
    }
    $("mcElenco").innerHTML = jogadores.map(function (j) {
      var ini = esc((j.nome || "?").trim().charAt(0).toUpperCase() || "?");
      var foto = j.foto
        ? '<img src="' + esc(j.foto) + '" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.outerHTML=\'<span class=mono-clube>' + ini + "</span>';\">"
        : T.monoClube(j.nome);
      return '<div class="elenco-item">' + foto + "<strong>" + esc(j.nome) + "</strong><span>" +
        esc(j.posicao || "") + (j.numero ? " · #" + esc(j.numero) : "") +
        (j.gols ? " · " + j.gols + "g" : "") + "</span></div>";
    }).join("");
  }

  function pintarArtilharia(artilharia, jogadores) {
    var lista = (artilharia && artilharia.length) ? artilharia : [];
    if (!lista.length && jogadores && jogadores.length) {
      lista = jogadores.filter(function (j) { return (j.gols || 0) > 0; })
        .sort(function (a, b) { return (b.gols || 0) - (a.gols || 0); })
        .slice(0, 8);
    }
    if (!lista.length) {
      $("mcArtilharia").innerHTML = "<li><span>Sem gols registrados nesta temporada ainda</span></li>";
      return;
    }
    $("mcArtilharia").innerHTML = lista.slice(0, 8).map(function (j) {
      var g = j.gols != null ? j.gols : 0;
      var a = j.assistencias != null ? j.assistencias : 0;
      return "<li><span>" + esc(j.nome) + (j.posicao ? " · " + esc(j.posicao) : "") +
        (a ? " · " + a + "a" : "") + "</span><b>" + g + "g</b></li>";
    }).join("");
  }

  function carregar() {
    var e = T.eu();
    $("mcNome").textContent = e.time;
    $("mcEscudo").innerHTML = T.escudo(null, e.time, "g");
    $("mcElenco").innerHTML = T.skeleton(1);
    $("mcArtilharia").innerHTML = "<li class=\"muted\">Carregando…</li>";

    var portalP = T.api("/api/portal", { semRedirecionar: true }).catch(function () {
      return T.portalEstatico ? T.portalEstatico() : Promise.reject(new Error("Sem dados do portal"));
    });
    var elencoP = T.api("/api/avatares?time=" + encodeURIComponent(e.time), { semRedirecionar: true })
      .catch(function () { return { jogadores: [], artilharia: [] }; });

    /* Paralelo: portal e elenco ao mesmo tempo */
    portalP.then(function (p) {
      if (p.tema && p.tema.cores) T.aplicarTema(p.tema.cores, e.time);
      var c = p.clube || {};
      var tab = c.tabela;
      $("mcPos").textContent = tab
        ? tab.posicao + "º · " + tab.pontos + " pts · " + tab.jogos + " jogos"
        : "fora da Série A nesta cobertura";
      pintarTabela(p.tabela || [], e.time);

      if (c.ultimos && c.ultimos.length) {
        pintarUltimos(c.ultimos);
      } else if (T.ultimosEstatico) {
        $("mcForma").innerHTML = '<p class="muted pequeno forma-vazia">Buscando forma…</p>';
        T.ultimosEstatico(e.time, 20).then(pintarUltimos).catch(function () { pintarUltimos([]); });
      } else {
        pintarUltimos([]);
      }
    }, function (err) {
      $("mcTabela").innerHTML = T.erroBloco(err.message, "tentarMc");
      var b = $("tentarMc");
      if (b) b.addEventListener("click", carregar);
    });

    elencoP.then(function (av) {
      var jogs = (av && av.jogadores) || [];
      pintarElenco(jogs);
      pintarArtilharia((av && av.artilharia) || [], jogs);
    });
  }

  T.atualizar(carregar, 180000);
})();
