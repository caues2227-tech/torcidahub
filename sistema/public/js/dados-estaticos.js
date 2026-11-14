/* Dados ao vivo sem Node: ESPN no navegador (Hostinger estático). */
(function (w) {
  "use strict";

  var ESPN_BRA = "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1";

  function T() { return w.Torcida; }

  function hojeSP() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }
  function ymdParaEspn(ymd) {
    return String(ymd || "").replace(/-/g, "");
  }
  function addDias(ymd, n) {
    var p = String(ymd).split("-");
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
    return d.toISOString().slice(0, 10);
  }
  function statusEspn(state) {
    if (state === "IN") return "ao vivo";
    if (state === "POST") return "encerrado";
    return "agendado";
  }
  function eventoParaJogo(ev) {
    var Torcida = T();
    var comp = (ev.competitions && ev.competitions[0]) || {};
    var comps = comp.competitors || [];
    var home = comps.filter(function (c) { return c.homeAway === "home"; })[0] || {};
    var away = comps.filter(function (c) { return c.homeAway === "away"; })[0] || {};
    var state = ev.status && ev.status.type && ev.status.type.state;
    var scoreCasa = home.score != null ? Number(home.score) : null;
    var scoreFora = away.score != null ? Number(away.score) : null;
    if (home.score && typeof home.score === "object") scoreCasa = home.score.value != null ? Number(home.score.value) : null;
    if (away.score && typeof away.score === "object") scoreFora = away.score.value != null ? Number(away.score.value) : null;
    var dataIso = ev.date || "";
    var data = dataIso ? new Date(dataIso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : hojeSP();
    var horario = dataIso
      ? new Date(dataIso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      : "";
    var mandante = (home.team && home.team.displayName) || "A definir";
    var visitante = (away.team && away.team.displayName) || "A definir";
    var logoCasa = (home.team && home.team.logo) || (Torcida.urlEscudo && Torcida.urlEscudo(mandante)) || "";
    var logoFora = (away.team && away.team.logo) || (Torcida.urlEscudo && Torcida.urlEscudo(visitante)) || "";
    var e = Torcida.eu();
    var quente = [e.time, e.feedTime].some(function (t) {
      return t && (Torcida.nomeBate(mandante, t) || Torcida.nomeBate(visitante, t));
    });
    return {
      idJogo: String(ev.id || ""),
      espnId: String(ev.id || ""),
      mandante: mandante,
      visitante: visitante,
      escudoCasa: logoCasa,
      escudoFora: logoFora,
      escudoMandante: logoCasa,
      escudoVisitante: logoFora,
      data: data,
      horario: horario,
      status: statusEspn(state),
      placarMandante: state === "PRE" ? null : scoreCasa,
      placarVisitante: state === "PRE" ? null : scoreFora,
      minuto: (ev.status && ev.status.type && ev.status.type.shortDetail) || "",
      quente: quente,
      grupo: "bra1"
    };
  }
  function fetchScoreboard(ymd) {
    var q = ymd ? ("?dates=" + ymdParaEspn(ymd) + "&limit=100") : "";
    return fetch(ESPN_BRA + "/scoreboard" + q).then(function (r) {
      if (!r.ok) throw new Error("ESPN " + r.status);
      return r.json();
    }).then(function (data) {
      return (data.events || []).map(eventoParaJogo);
    });
  }
  function fetchTabela() {
    var Torcida = T();
    return fetch("https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings").then(function (r) {
      if (!r.ok) return [];
      return r.json();
    }).then(function (data) {
      var kids = data.children || [];
      var entries = [];
      kids.forEach(function (ch) {
        ((ch.standings && ch.standings.entries) || []).forEach(function (en) { entries.push(en); });
      });
      if (!entries.length && data.standings && data.standings.entries) entries = data.standings.entries;
      return entries.map(function (en) {
        var stats = {};
        (en.stats || []).forEach(function (s) { stats[s.name || s.abbreviation] = s.value; });
        var nome = (en.team && (en.team.displayName || en.team.name)) || "";
        return {
          time: nome,
          posicao: stats.rank != null ? Number(stats.rank) : null,
          pontos: stats.points != null ? Number(stats.points) : null,
          jogos: stats.gamesPlayed != null ? Number(stats.gamesPlayed) : null,
          saldo: stats.pointDifferential != null ? Number(stats.pointDifferential) : null,
          escudo: (en.team && en.team.logos && en.team.logos[0] && en.team.logos[0].href) ||
            (Torcida.urlEscudo && Torcida.urlEscudo(nome)) || ""
        };
      }).filter(function (l) { return l.time; });
    }).catch(function () { return []; });
  }

  function portalEstatico() {
    var Torcida = T();
    var e = Torcida.eu();
    var hoje = hojeSP();
    var dias = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return addDias(hoje, i); });
    return Promise.all([
      fetchScoreboard(hoje).catch(function () { return []; }),
      Promise.all(dias.slice(1).map(function (d) {
        return fetchScoreboard(d).catch(function () { return []; });
      })),
      fetchTabela()
    ]).then(function (pack) {
      var jogosHoje = pack[0] || [];
      var futuros = [];
      (pack[1] || []).forEach(function (lista) {
        (lista || []).forEach(function (j) {
          if (j.status !== "encerrado") futuros.push(j);
        });
      });
      var tabela = pack[2] || [];
      var alvos = [e.time, e.feedTime].filter(Boolean);
      function noClube(j) {
        return alvos.some(function (t) {
          return Torcida.nomeBate(j.mandante, t) || Torcida.nomeBate(j.visitante, t);
        });
      }
      var meus = futuros.filter(noClube);
      var proximos = meus.concat(futuros.filter(function (j) { return meus.indexOf(j) < 0; })).slice(0, 8);
      var linha = tabela.filter(function (l) { return Torcida.nomeBate(l.time, e.time); })[0] || null;
      var proxClube = jogosHoje.filter(function (j) {
        return noClube(j) && j.status !== "encerrado";
      })[0] || meus[0] || null;
      return {
        data: hoje,
        atualizadoEm: new Date().toISOString(),
        aoVivo: jogosHoje.filter(function (j) { return j.status === "ao vivo"; }).length,
        jogosHoje: jogosHoje,
        extra: [],
        proximos: proximos,
        tabela: tabela,
        meta: { fonte: "ESPN", via: "estatico" },
        noticiasMeta: {},
        noticias: { jogo: [], mercado: [] },
        manchete: null,
        resumo: null,
        clube: {
          nome: e.time,
          escudo: Torcida.urlEscudo ? Torcida.urlEscudo(e.time) : "",
          tabela: linha,
          proximo: proxClube,
          ultimos: []
        },
        tema: null
      };
    });
  }

  function agendaEstatica() {
    var Torcida = T();
    var e = Torcida.eu();
    var hoje = hojeSP();
    var diasYmd = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(function (i) { return addDias(hoje, i); });
    return Promise.all(diasYmd.map(function (d) {
      return fetchScoreboard(d).then(function (jogos) {
        return { data: d, jogos: jogos || [] };
      }).catch(function () {
        return { data: d, jogos: [] };
      });
    })).then(function (dias) {
      dias = dias.filter(function (d) { return d.jogos.length; });
      return {
        dataHoje: hoje,
        atualizadoEm: new Date().toISOString(),
        time: e.time,
        grupos: [{ id: "bra1", nome: "Brasileirão", qtd: dias.reduce(function (n, d) { return n + d.jogos.length; }, 0) }],
        dias: dias
      };
    });
  }

  function letraResultado(j, time) {
    var Torcida = T();
    var pm = j.placarMandante;
    var pv = j.placarVisitante;
    if (pm == null || pv == null) return "?";
    var casa = Torcida.nomeBate(j.mandante, time);
    var fora = Torcida.nomeBate(j.visitante, time);
    if (!casa && !fora) return "?";
    var meus = casa ? pm : pv;
    var deles = casa ? pv : pm;
    if (meus > deles) return "V";
    if (meus < deles) return "D";
    return "E";
  }

  /** Últimos resultados do clube (forma) via scoreboards ESPN dos últimos dias. */
  function ultimosEstatico(time, diasAtras) {
    var Torcida = T();
    var nome = time || Torcida.eu().time;
    var hoje = hojeSP();
    var n = diasAtras || 45;
    var datas = [];
    for (var i = 1; i <= n; i++) datas.push(addDias(hoje, -i));
    /* Em lotes de 6 para não estourar a rede */
    var cadeia = Promise.resolve([]);
    for (var b = 0; b < datas.length; b += 6) {
      (function (lote) {
        cadeia = cadeia.then(function (acc) {
          if (acc.length >= 10) return acc;
          return Promise.all(lote.map(function (d) {
            return fetchScoreboard(d).catch(function () { return []; });
          })).then(function (listas) {
            listas.forEach(function (lista) {
              (lista || []).forEach(function (j) {
                if (j.status !== "encerrado") return;
                if (j.placarMandante == null || j.placarVisitante == null) return;
                if (!Torcida.nomeBate(j.mandante, nome) && !Torcida.nomeBate(j.visitante, nome)) return;
                acc.push(Object.assign({}, j, { letra: letraResultado(j, nome) }));
              });
            });
            return acc;
          });
        });
      })(datas.slice(b, b + 6));
    }
    return cadeia.then(function (acc) {
      acc.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
      return acc.slice(0, 10);
    });
  }

  function instalar() {
    var Torcida = T();
    if (!Torcida) return;
    /* Sempre reatribui: cache antigo pode ter instalado só portal/agenda. */
    Torcida.portalEstatico = portalEstatico;
    Torcida.agendaEstatica = agendaEstatica;
    Torcida.ultimosEstatico = ultimosEstatico;
  }

  if (T()) instalar();
  else document.addEventListener("DOMContentLoaded", instalar);
})(window);
