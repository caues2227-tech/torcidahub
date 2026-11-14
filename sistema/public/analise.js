/* Desenho da análise de um confronto (usado por jogo.html e coracao.html). */
(function (w) {
  "use strict";
  var T = w.Torcida;
  var esc = T.esc;

  function coluna(lado, papel) {
    if (!lado) return "";
    var tab = lado.tab;
    var linha = tab ? tab.posicao + "º · " + tab.pontos + " pts · " + tab.jogos + " jogos" : "fora da Série A";
    return '<div class="lado ' + papel + '"><span class="papel">' + (papel === "casa" ? "mandante" : "visitante") + "</span>" +
      T.escudo(lado.escudo, lado.nome, "g") + "<strong>" + esc(lado.nome) + '</strong><span class="muted pequeno">' + esc(linha) + "</span>" +
      T.formaPills(lado.letras) + "</div>";
  }

  function ultimos(lista) {
    if (!lista || !lista.length) return '<p class="muted pequeno">Sem sequência recente.</p>';
    return '<div class="lista-vertical">' + lista.map(function (j) {
      return '<a class="ultimo" href="' + esc(T.hrefJogo(j)) + '"><span class="pill-res pill-' + esc(j.letra) + '">' + esc(j.letra) + "</span><span>" +
        esc(j.mandante) + " " + j.placarMandante + "–" + j.placarVisitante + " " + esc(j.visitante) + "</span><small>" + esc(T.dataCurta(j.data)) + "</small></a>";
    }).join("") + "</div>";
  }

  function noticias(lista) {
    if (!lista || !lista.length) return "";
    return '<div class="secao-cab"><h2 class="secao-titulo">Na redação</h2></div><div class="grade-2">' + lista.map(function (n) {
      return '<a class="noticia" href="' + esc(T.hrefSeguro(n.url)) + '" target="_blank" rel="noopener">' +
        (n.imagem ? '<img src="' + esc(n.imagem) + '" alt="" loading="lazy" data-some>' : "") +
        '<span class="kicker">' + esc(n.fonteNome || "redação") + "</span><h3>" + esc(n.titulo) + "</h3></a>";
    }).join("") + "</div>";
  }

  // opcoes: { atual: nome do clube em foco, hojeLista: bool, alheio: bool }
  function renderAnalise(d, opcoes) {
    opcoes = opcoes || {};
    var e = T.eu();
    var cobertura = "";
    if (opcoes.hojeLista && (d.coberturaHoje || []).length) {
      cobertura = '<div class="secao-cab"><h2 class="secao-titulo">Jogos de hoje</h2><span class="muted">escolha outro confronto</span></div><div class="grade-2">' +
        d.coberturaHoje.map(function (j) { return T.cardJogo(j); }).join("") + "</div>";
    }

    if (!d.jogo) {
      return '<div class="hero-jogo"><span class="selo-pagina">' + esc(d.meuTime || e.time) + "</span><h1>Sem jogo na cobertura agora</h1>" +
        '<p class="lead muted" style="margin-top:12px">' + esc(d.resumo || "") + "</p>" +
        '<div class="btn-grupo"><a class="btn" href="/jogos.html">Ver agenda</a><a class="btn btn-ghost" href="/chatbot.html?q=' + encodeURIComponent("próximo jogo do " + (d.meuTime || e.time)) + '">Perguntar ao bot</a></div></div>' + cobertura;
    }

    var j = d.jogo;
    var c = d.chances || { casa: 0, empate: 0, fora: 0 };
    var placar = T.placarTxt(j);
    var foto = j.fotoCasa ? ' com-foto" style="--foto:url(&quot;' + esc(j.fotoCasa) + '&quot;)' : "";
    var perguntaBot = "quem ganha " + j.mandante + " x " + j.visitante + "?";
    var quando = (j.hoje ? "Hoje" : T.dataCurta(j.data)) + " · " + (j.horario || "") + (j.local ? " · " + j.local : "");
    // jogo que já acabou mostra o resultado; chances e "quem ganha" só fazem sentido antes do apito
    var fim = !!d.encerrado;
    var chancesHtml = fim ? "" :
      '<div class="chances-txt"><span>' + esc(j.mandante) + " " + c.casa + "%</span><span>empate " + c.empate + "%</span><span>" + esc(j.visitante) + " " + c.fora + "%</span></div>" +
      '<div class="barra-chances" role="img" aria-label="Chances: ' + c.casa + '% mandante, ' + c.empate + '% empate, ' + c.fora + '% visitante"><span style="width:' + c.casa + '%"></span><span style="width:' + c.empate + '%"></span><span style="width:' + c.fora + '%"></span></div>';
    var notaHtml = fim ? "" :
      '<p class="muted pequeno" style="margin-top:8px">Leitura feita com tabela, mando e forma recente' + (d.conselho ? " e previsão da API-Football" : "") + ". Não é odd de aposta." +
      (d.detalhado === false ? " Buscando dados detalhados em segundo plano…" : "") + "</p>";
    var botHtml = fim ? "" : '<a class="btn" href="/chatbot.html?q=' + encodeURIComponent(perguntaBot) + '">Quem ganha? Pergunte ao bot</a>';

    return '<section class="hero-jogo' + foto + '">' +
      '<div class="jogo-topo">' + T.statusHtml(j) + '<span class="jogo-comp">' + esc(j.competicao || "confronto") + (opcoes.alheio ? " · outro clube" : "") + "</span></div>" +
      '<div class="jogo-placar"><div class="jogo-time">' + T.escudo(j.escudoCasa, j.mandante, "g") + "<strong>" + esc(j.mandante) + "</strong></div>" +
      '<div class="jogo-centro' + (placar ? "" : " sem") + '">' + esc(placar || "x") + "</div>" +
      '<div class="jogo-time dir">' + T.escudo(j.escudoFora, j.visitante, "g") + "<strong>" + esc(j.visitante) + "</strong></div></div>" +
      '<p class="muted">' + esc(quando) + "</p>" +
      (opcoes.alheio ? '<p class="muted pequeno" style="margin-top:6px">Seu coração é ' + esc(e.time) + ". Esta é a leitura de quem está em campo.</p>" : "") +
      "</section>" +

      '<section class="card"><div class="versus">' + coluna(d.casa, "casa") + '<div class="x">x</div>' + coluna(d.fora, "fora") + "</div>" +
      chancesHtml +
      '<p class="lead" style="margin-top:14px">' + esc(d.leitura || d.resumo || "") + "</p>" +
      notaHtml +
      '<div class="btn-grupo">' + botHtml +
      (opcoes.linkAnalise ? '<a class="btn btn-ghost" href="/coracao.html?time=' + encodeURIComponent(j.mandante) + '">Análise do ' + esc(j.mandante) + "</a>" : "") +
      (opcoes.linkJogo && j.idJogo ? '<a class="btn btn-ghost" href="' + esc(T.hrefJogo(j)) + '">Página do jogo</a>' : "") + "</div></section>" +

      ((d.fatos || []).length ? '<div class="fatos">' + d.fatos.map(function (f) {
        return '<div class="fato"><div class="k">' + esc(f.k) + '</div><div class="v">' + esc(f.v) + "</div></div>";
      }).join("") + "</div>" : "") +

      '<div class="grade-2"><div class="card"><div class="card-titulo">Últimos do ' + esc(j.mandante) + "</div>" + ultimos(d.ultimosCasa) + "</div>" +
      '<div class="card"><div class="card-titulo">Últimos do ' + esc(j.visitante) + "</div>" + ultimos(d.ultimosFora) + "</div></div>" +
      (d.caminho ? '<div class="card"><div class="card-titulo">Caminho do ' + esc(d.zebra || "azarão") + "</div><p>" + esc(d.caminho) + "</p></div>" : "") +
      noticias(d.noticias) + cobertura;
  }

  T.renderAnalise = renderAnalise;
})(window);
