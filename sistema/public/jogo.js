/* Página de um jogo: placar, leitura do confronto, forma dos dois lados e notícias. */
(function () {
  "use strict";
  var T = window.Torcida;
  var raiz = document.getElementById("conteudo");
  var id = new URLSearchParams(location.search).get("id") || "";
  if (!id) { location.replace("/jogos.html"); return; }
  var pintouUmaVez = false;

  function carregar() {
    return T.api("/api/jogo?id=" + encodeURIComponent(id)).then(function (d) {
      if (d.tema && d.tema.cores) T.aplicarTema(d.tema.cores, T.eu().time);
      var j = d.jogo;
      document.title = j.mandante + " x " + j.visitante + " | Torcida";
      raiz.innerHTML = T.renderAnalise(d, { linkAnalise: true });
      pintouUmaVez = true;
    }, function (e) {
      if (pintouUmaVez) return;
      if (e.status === 404) {
        raiz.innerHTML = '<div class="hero-jogo"><h1>Jogo não encontrado</h1><p class="lead muted" style="margin-top:12px">Esse confronto saiu da agenda ou o link está incompleto.</p><div class="btn-grupo"><a class="btn" href="/jogos.html">Ver jogos</a></div></div>';
        return;
      }
      raiz.innerHTML = T.erroBloco(e.message, "tentarJogo");
      var b = document.getElementById("tentarJogo");
      if (b) b.addEventListener("click", function () { ctrl.agora(); });
    });
  }
  var ctrl = T.atualizar(carregar, 25000);
})();
