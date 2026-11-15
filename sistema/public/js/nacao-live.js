/* Nação live: GNews (via /api/gnews), ESPN jogos, TheSportsDB sugestões. */
(function (global) {
  "use strict";

  var D = global.TorcidaData || {};
  var CACHE_NOTICIAS = "torcida_noticias_global_v9";
  var CACHE_TTL_NOTICIAS = 15 * 60 * 1000;
  var NOTICIAS_MAX = 60;
  var CACHE_JOGOS = "torcida_jogos_hoje_v1";
  var CACHE_TTL_JOGOS = 5 * 60 * 1000;
  var ESPN_BRA1 = "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1";

  var ICONE_TAG = { mercado: "💰", jogo: "⚽", classico: "🔥", rebaixamento: "📉" };
  var LABEL_TAG = {
    mercado: "MERCADO",
    jogo: "JOGO",
    classico: "CLÁSSICO",
    rebaixamento: "REBAIXAMENTO"
  };

  function detectarTag(titulo) {
    var t = String(titulo || "").toLowerCase();
    if (/(contrata|acerta|renova|empréstimo|emprestimo|rescis|chegada|negocia)/.test(t)) return "mercado";
    if (/(rebaix|degola|queda|zona)/.test(t)) return "rebaixamento";
    if (/(clássic|clasico|derbi|rival|clasic)/.test(t)) return "classico";
    if (/(gol|vitória|vitoria|vence|empate|derrota|placar)/.test(t)) return "jogo";
    return "jogo";
  }

  function lerCache(chave, ttl) {
    try {
      var raw = localStorage.getItem(chave);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.ts || Date.now() - o.ts >= ttl) return null;
      return o.data;
    } catch (e) {
      return null;
    }
  }

  function gravarCache(chave, data) {
    try {
      localStorage.setItem(chave, JSON.stringify({ data: data, ts: Date.now() }));
    } catch (e) { /* quota */ }
  }

  function detectarTagGlobal(titulo) {
    var t = String(titulo || "").toLowerCase();
    if (/(contrata|acerta|renova|empréstimo|emprestimo|rescis|chegada|transfer|negocia)/.test(t)) return "mercado";
    if (/(rebaix|degola|queda|zona)/.test(t)) return "rebaixamento";
    if (/(clássic|clasico|derbi|rival|clasic|el clásico|el clasico)/.test(t)) return "classico";
    if (/(champions|premier|la liga|bundesliga|mundial|copa)/.test(t)) return "jogo";
    return detectarTag(titulo);
  }

  function limparTexto(s) {
    var t = String(s == null ? "" : s);
    if (!t) return "";
    if (/[&<]/.test(t)) {
      try {
        var el = document.createElement("textarea");
        el.innerHTML = t;
        t = el.value;
      } catch (e) { /* ignore */ }
    }
    return t
      .replace(/&nbsp;/gi, " ")
      .replace(/&#160;/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function mapArticles(articles, prefix) {
    return (articles || []).map(function (a, i) {
      var fonte = a.source;
      if (fonte && typeof fonte === "object") fonte = fonte.name || "Fonte";
      fonte = limparTexto(fonte);
      var titulo = limparTexto(a.title || "");
      var resumo = limparTexto(a.description || "");
      var tag = detectarTagGlobal(titulo);
      return {
        id: (prefix || "gn") + (i + 1),
        tipo: "noticia",
        fonte: fonte || "Fonte",
        nome: fonte || "Fonte",
        verificado: true,
        quando: D.tempoRelativo ? D.tempoRelativo(a.publishedAt) : "",
        ts: a.publishedAt ? new Date(a.publishedAt).getTime() : Date.now() - i * 36e5,
        tag: tag,
        tagLabel: LABEL_TAG[tag] || "JOGO",
        titulo: titulo,
        resumo: resumo,
        texto: titulo,
        imagem: a.image || "",
        url: a.url || "#",
        comentarios: 20 + ((i * 17) % 180),
        reposts: 8 + ((i * 11) % 90),
        likes: 40 + ((i * 23) % 450),
        secao: tag === "mercado" || tag === "rebaixamento" ? "mercado" : "jogo",
        comentariosLista: [],
        minhaReacao: null,
        reatores: ["A", "B"],
        reatoresN: 40 + ((i * 23) % 450)
      };
    });
  }

  async function buscarNoticiasPhp() {
    try {
      var res = await fetch("/noticias.php?modo=global&max=" + NOTICIAS_MAX, { credentials: "same-origin" });
      if (!res.ok) throw new Error("noticias.php HTTP " + res.status);
      var data = await res.json();
      if (!data.articles || !data.articles.length) throw new Error("Sem resultados PHP");
      return mapArticles(data.articles, "php");
    } catch (e) {
      console.warn("noticias.php falhou:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function buscarNoticiasGNews() {
    try {
      var res = await fetch("/api/gnews?modo=global&max=" + NOTICIAS_MAX, { credentials: "same-origin" });
      if (!res.ok) throw new Error("GNews HTTP " + res.status);
      var data = await res.json();
      if (!data.articles || !data.articles.length) throw new Error("Sem resultados");
      return mapArticles(data.articles, "gn");
    } catch (e) {
      console.warn("GNews falhou:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function buscarNoticiasEspn() {
    try {
      var ligas = ["bra.1", "esp.1", "eng.1", "usa.1", "fra.1", "ger.1", "ita.1"];
      var arts = [];
      await Promise.all(ligas.map(function (liga) {
        return fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/" + liga + "/news")
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (data) {
            if (!data) return;
            (data.articles || []).forEach(function (a) {
              arts.push({
                title: a.headline || a.description || "",
                description: a.description || "",
                url: (a.links && a.links.web && a.links.web.href) || "#",
                image: (a.images && a.images[0] && a.images[0].url) || "",
                publishedAt: a.published || new Date().toISOString(),
                source: a.byline || "ESPN"
              });
            });
          })
          .catch(function () {});
      }));
      arts = arts.filter(function (a) { return a.title; });
      /* Prefere matérias com foto real */
      arts.sort(function (a, b) { return (b.image ? 1 : 0) - (a.image ? 1 : 0); });
      if (!arts.length) throw new Error("ESPN sem artigos");
      return mapArticles(arts, "espn");
    } catch (e) {
      console.warn("ESPN news falhou:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function buscarNoticiasLocais() {
    try {
      var res = await fetch("/api/noticias?limite=12", { credentials: "same-origin" });
      if (!res.ok) return [];
      var data = await res.json();
      return (data.noticias || []).map(function (n, i) {
        var tag = detectarTag(n.titulo || "");
        return {
          id: "ln" + (n.id || i + 1),
          tipo: "noticia",
          fonte: n.fonteNome || n.fonte || "Fonte",
          nome: n.fonteNome || n.fonte || "Fonte",
          verificado: true,
          quando: n.quando || (D.tempoRelativo && n.publicadoEm ? D.tempoRelativo(n.publicadoEm) : ""),
          ts: n.publicadoEm ? new Date(n.publicadoEm).getTime() : Date.now() - (i + 3) * 36e5,
          tag: tag,
          tagLabel: LABEL_TAG[tag] || "JOGO",
          titulo: n.titulo || "",
          resumo: n.resumo || n.texto || "",
          texto: n.titulo || "",
          imagem: n.imagem || "",
          url: n.url || "#",
          comentarios: 20 + ((i * 13) % 120),
          reposts: 8 + ((i * 7) % 60),
          likes: 40 + ((i * 19) % 300),
          secao: n.secao || (tag === "mercado" ? "mercado" : "jogo"),
          comentariosLista: [],
          minhaReacao: null,
          reatores: ["A", "B"],
          reatoresN: 40
        };
      });
    } catch (e) {
      return [];
    }
  }

  function chaveTitulo(t) {
    return String(t || "").toLowerCase().slice(0, 40);
  }

  function mesclarNoticias(listas) {
    var vistos = {};
    var out = [];
    function add(lista) {
      (lista || []).forEach(function (n) {
        var k = chaveTitulo(n.titulo);
        if (!k) return;
        if (vistos[k] != null) {
          var i = vistos[k];
          if ((!out[i].imagem || !String(out[i].imagem).trim()) && n.imagem) out[i].imagem = n.imagem;
          return;
        }
        vistos[k] = out.length;
        out.push(n);
      });
    }
    /* ESPN primeiro (tem foto real); depois RSS/outros */
    listas.forEach(add);
    return out;
  }

  async function getNoticias() {
    var cached = lerCache(CACHE_NOTICIAS, CACHE_TTL_NOTICIAS);
    if (cached && Array.isArray(cached) && cached.length >= 12) return cached;

    var espn = await buscarNoticiasEspn();
    var php = await buscarNoticiasPhp();
    var gnews = (!php || !php.length) ? await buscarNoticiasGNews() : null;
    var locais = await buscarNoticiasLocais();

    var noticias = mesclarNoticias([espn, php, gnews, locais]);
    if (!noticias.length) {
      console.error("Falha total em notícias: PHP/GNews/ESPN sem resultado");
      return null;
    }

    noticias.sort(function (a, b) {
      var ia = a.imagem ? 1 : 0;
      var ib = b.imagem ? 1 : 0;
      if (ib !== ia) return ib - ia;
      return (b.ts || 0) - (a.ts || 0);
    });
    noticias = noticias.slice(0, NOTICIAS_MAX);
    gravarCache(CACHE_NOTICIAS, noticias);
    return noticias;
  }

  async function buscarJogosESPN() {
    try {
      var hoje = D.dataHojeSP ? D.dataHojeSP() : "";
      var dates = hoje ? hoje.replace(/-/g, "") : "";
      var res = await fetch(ESPN_BRA1 + "/scoreboard" + (dates ? ("?dates=" + dates) : ""));
      if (!res.ok) throw new Error("ESPN HTTP " + res.status);
      var data = await res.json();
      return (data.events || []).map(function (ev) {
        var comp = (ev.competitions && ev.competitions[0]) || {};
        var comps = comp.competitors || [];
        var home = comps.find(function (c) { return c.homeAway === "home"; }) || {};
        var away = comps.find(function (c) { return c.homeAway === "away"; }) || {};
        var state = ev.status && ev.status.type && ev.status.type.state;
        var scoreCasa = home.score != null ? Number(home.score) : (home.score && home.score.value);
        var scoreFora = away.score != null ? Number(away.score) : (away.score && away.score.value);
        if (home.score && typeof home.score === "object") scoreCasa = home.score.value != null ? Number(home.score.value) : null;
        if (away.score && typeof away.score === "object") scoreFora = away.score.value != null ? Number(away.score.value) : null;
        return {
          id: ev.id,
          casa: (home.team && home.team.displayName) || "A definir",
          fora: (away.team && away.team.displayName) || "A definir",
          casaBadge: (home.team && home.team.logo) || "",
          foraBadge: (away.team && away.team.logo) || "",
          dataISO: ev.date,
          hora: D.horaSP ? D.horaSP(ev.date) : "--:--",
          status: state,
          statusLabel: (ev.status && ev.status.type && ev.status.type.shortDetail) || "",
          scoreCasa: scoreCasa,
          scoreFora: scoreFora,
          aoVivo: state === "IN"
        };
      });
    } catch (e) {
      console.warn("ESPN falhou:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function buscarJogosApiLocal() {
    try {
      var res = await fetch("/api/hoje", { credentials: "same-origin" });
      if (!res.ok) throw new Error("api/hoje HTTP " + res.status);
      var data = await res.json();
      var lista = [].concat(data.jogos || [], data.extra || []);
      return lista.map(function (j) {
        var st = j.status || "agendado";
        var status = st === "ao vivo" ? "IN" : (st === "encerrado" ? "POST" : "PRE");
        var dataISO = j.data && j.horario
          ? (j.data + "T" + String(j.horario).slice(0, 5) + ":00-03:00")
          : (j.data || data.data);
        return {
          id: j.idJogo || j.id || (j.mandante + j.visitante),
          casa: j.mandante || j.casa || "A definir",
          fora: j.visitante || j.fora || "A definir",
          casaBadge: "/img/escudo?time=" + encodeURIComponent(j.mandante || j.casa || ""),
          foraBadge: "/img/escudo?time=" + encodeURIComponent(j.visitante || j.fora || ""),
          dataISO: dataISO,
          hora: j.horario ? String(j.horario).slice(0, 5) : (D.horaSP ? D.horaSP(dataISO) : "--:--"),
          status: status,
          statusLabel: st,
          scoreCasa: j.placarMandante != null ? j.placarMandante : null,
          scoreFora: j.placarVisitante != null ? j.placarVisitante : null,
          aoVivo: status === "IN"
        };
      });
    } catch (e) {
      console.warn("api/hoje falhou:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function buscarJogosHoje() {
    var j = await buscarJogosESPN();
    if (!j) j = await buscarJogosApiLocal();
    return j;
  }

  function filtrarHoje(jogos) {
    var hoje = D.dataHojeSP ? D.dataHojeSP() : new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return (jogos || []).filter(function (j) {
      return (D.normalizarData ? D.normalizarData(j.dataISO) : String(j.dataISO || "").slice(0, 10)) === hoje;
    });
  }

  async function getJogosHoje() {
    var cached = lerCache(CACHE_JOGOS, CACHE_TTL_JOGOS);
    var jogos = cached;
    if (!jogos) {
      jogos = await buscarJogosHoje();
      if (jogos) gravarCache(CACHE_JOGOS, jogos);
    }
    return filtrarHoje(jogos || []);
  }

  async function buscarProximoJogo() {
    try {
      var res = await fetch("/api/agenda", { credentials: "same-origin" });
      if (!res.ok) return null;
      var data = await res.json();
      var hoje = D.dataHojeSP ? D.dataHojeSP() : "";
      var candidatos = [];
      (data.dias || []).forEach(function (dia) {
        (dia.jogos || []).forEach(function (j) {
          candidatos.push(Object.assign({ data: j.data || dia.data }, j));
        });
      });
      (data.grupos || []).forEach(function (g) {
        (g.jogos || []).forEach(function (j) { candidatos.push(j); });
      });
      if (!candidatos.length && Array.isArray(data.jogos)) candidatos = data.jogos;
      candidatos = candidatos
        .filter(function (j) {
          var d = j.data || "";
          return d > hoje && (j.status === "agendado" || !j.status || j.placarMandante == null);
        })
        .sort(function (a, b) {
          return String(a.data).localeCompare(String(b.data)) || String(a.horario || "").localeCompare(String(b.horario || ""));
        });
      var m = candidatos[0];
      if (!m) return null;
      return {
        casa: m.mandante,
        fora: m.visitante,
        data: m.data,
        hora: m.horario ? String(m.horario).slice(0, 5) : "--:--",
        diasAte: null
      };
    } catch (e) {
      return null;
    }
  }

  function labelStatus(s) {
    return {
      PRE: "Agendado",
      IN: "AO VIVO",
      POST: "Encerrado",
      FT: "Encerrado",
      SCHEDULED: "Agendado",
      IN_PLAY: "AO VIVO",
      FINISHED: "Encerrado"
    }[s] || s || "";
  }

  function htmlJogosHoje(jogosHoje, proximo) {
    if (!jogosHoje || !jogosHoje.length) {
      return '<div class="no-jogos" id="jogos-hoje">' +
        '<span class="nj-icon" aria-hidden="true">📅</span>' +
        '<p class="nj-title">SEM JOGOS HOJE</p>' +
        (proximo
          ? '<p class="nj-next">Próximo: ' + esc(proximo.casa) + " x " + esc(proximo.fora) +
            "<br><span class=\"nj-date\">" +
            esc((D.diaSemanaSP ? D.diaSemanaSP(proximo.data) : proximo.data) + " às " + proximo.hora) +
            "</span></p>"
          : '<p class="nj-next">Próximos jogos em breve</p>') +
        "</div>";
    }
    return '<div id="jogos-hoje">' + jogosHoje.map(function (j) {
      var placar = j.status === "PRE"
        ? esc(j.hora)
        : esc(String(j.scoreCasa != null ? j.scoreCasa : 0) + " x " + String(j.scoreFora != null ? j.scoreFora : 0));
      var statusTxt = j.status === "PRE"
        ? ("Hoje às " + j.hora)
        : (j.statusLabel || labelStatus(j.status));
      return '<div class="jogo-row' + (j.aoVivo ? " ao-vivo" : "") + '">' +
        '<div class="jogo-teams">' +
        '<div class="jogo-team">' +
        badgeImg(j.casaBadge, j.casa, 24) +
        '<span class="team-name">' + esc(j.casa) + "</span></div>" +
        '<span class="jogo-score">' + placar + "</span>" +
        '<div class="jogo-team right">' +
        '<span class="team-name">' + esc(j.fora) + "</span>" +
        badgeImg(j.foraBadge, j.fora, 24) +
        "</div></div>" +
        '<span class="jogo-status' + (j.aoVivo ? " status-live" : "") + '">' + esc(statusTxt) + "</span>" +
        "</div>";
    }).join("") + "</div>";
  }

  function badgeImg(src, nome, size) {
    size = size || 24;
    if (!src) return (global.monogramaHTML ? global.monogramaHTML(nome, size) : esc(String(nome || "?").charAt(0)));
    return '<img class="team-badge" src="' + esc(src) + '" alt="' + esc(nome) + '" width="' + size +
      '" height="' + size + '" data-size="' + size + '" data-fallback-mono loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function carregarSugestoes() {
    var teams = null;
    try {
      var res = await fetch("https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=Brazilian%20Serie%20A");
      var data = await res.json();
      teams = (data.teams || data.results || []).slice(0, 5);
    } catch (e) {
      console.warn("TheSportsDB falhou:", e && e.message ? e.message : e);
    }
    if (!teams || !teams.length) {
      teams = [
        { strTeam: "Santos", idTeam: "4437", strBadge: "" },
        { strTeam: "Flamengo", idTeam: "521", strBadge: "" },
        { strTeam: "Palmeiras", idTeam: "522", strBadge: "" },
        { strTeam: "Corinthians", idTeam: "523", strBadge: "" },
        { strTeam: "São Paulo", idTeam: "524", strBadge: "" }
      ];
    }
    return teams.map(function (t) {
      var nome = t.strTeam || "Clube";
      var handle = "@" + (D.slugify ? D.slugify(nome) : nome.toLowerCase().replace(/\s+/g, "_"));
      return {
        id: t.idTeam || handle,
        handle: handle,
        time: nome,
        badge: t.strBadge || ("/img/escudo?time=" + encodeURIComponent(nome)),
        seguidores: ""
      };
    });
  }

  global.TorcidaNacaoLive = {
    ICONE_TAG: ICONE_TAG,
    LABEL_TAG: LABEL_TAG,
    detectarTag: detectarTag,
    getNoticias: getNoticias,
    getJogosHoje: getJogosHoje,
    buscarProximoJogo: buscarProximoJogo,
    htmlJogosHoje: htmlJogosHoje,
    carregarSugestoes: carregarSugestoes,
    badgeImg: badgeImg,
    labelStatus: labelStatus
  };
})(window);
