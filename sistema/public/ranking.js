/* Ranking de torcida: clubes ordenados pelo número de torcedores cadastrados. */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var lista = document.getElementById("lista");

  function pintar(d) {
    var e = T.eu();
    var itens = d.ranking || [];
    if (!itens.length) {
      lista.innerHTML = T.vazio("Ranking zerado — seja o primeiro", "Cada pessoa que escolhe o clube sobe o time de verdade. Sem número inventado.",
        '<a class="btn" href="/onboarding.html">Escolher meu clube</a>');
      return;
    }
    var max = Math.max.apply(null, itens.map(function (x) { return x.torcedores; }).concat([1]));
    var podio = itens.slice(0, 3);
    var resto = itens.slice(3);
    var html = "";
    if (podio.length) {
      html += '<div class="rank-podio">' + podio.map(function (x) {
        var meu = T.nomeBate(x.time, e.time);
        return '<div class="rank-podio-item pos-' + x.posicao + (meu ? " eu" : "") + '">' +
          '<span class="rank-medal">#' + x.posicao + "</span>" + T.escudo(x.escudo, x.time, "g") +
          "<strong>" + esc(x.time) + "</strong>" +
          '<span class="muted pequeno">' + x.torcedores + (x.torcedores === 1 ? " torcedor" : " torcedores") + " · " + x.posts + " posts</span></div>";
      }).join("") + "</div>";
    }
    html += resto.map(function (x) {
      var meu = T.nomeBate(x.time, e.time);
      return '<div class="rank-linha revelar' + (meu ? " eu" : "") + '"><span class="rank-pos">' + x.posicao + "</span>" + T.escudo(x.escudo, x.time) +
        '<div class="rank-nome"><strong>' + esc(x.time) + (meu ? ' <span class="muted pequeno">· seu clube</span>' : "") + "</strong>" +
        '<div class="rank-barra"><i style="width:' + Math.max(4, Math.round(x.torcedores / max * 100)) + '%"></i></div></div>' +
        '<div class="rank-num"><b>' + x.torcedores + "</b><small>" + (x.torcedores === 1 ? "torcedor" : "torcedores") + " · " + x.posts + (x.posts === 1 ? " post" : " posts") + "</small></div></div>";
    }).join("");
    lista.innerHTML = html;
    document.getElementById("rodape").innerHTML = 'Quer subir o seu clube? <a href="/cadastro.html" style="color:var(--accent-text)">Convide a torcida a se cadastrar</a>.';
  }

  function carregar() {
    return T.api("/api/ranking").then(pintar, function (err) {
      lista.innerHTML = T.erroBloco(err.message, "tentarRanking");
      var b = document.getElementById("tentarRanking");
      if (b) b.addEventListener("click", function () { lista.innerHTML = T.skeleton(1); carregar(); });
    });
  }
  T.atualizar(carregar, 60000);
})();
