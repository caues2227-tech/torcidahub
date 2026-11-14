/* Análise do próximo jogo de um clube (o do coração por padrão, ou ?time=Outro). */
(function () {
  "use strict";
  var T = window.Torcida;
  var raiz = document.getElementById("conteudo");
  var time = new URLSearchParams(location.search).get("time") || "";
  var pintou = false;

  function carregar() {
    var q = time ? "?time=" + encodeURIComponent(time) : "";
    return T.api("/api/coracao" + q).then(function (d) {
      var e = T.eu();
      var alvo = time || e.time;
      document.title = "Análise do " + alvo + " | Torcida";
      var alheio = !!(d.jogo && !T.nomeBate(d.jogo.mandante, e.time) && !T.nomeBate(d.jogo.visitante, e.time));
      raiz.innerHTML = T.renderAnalise(d, { hojeLista: true, alheio: alheio, linkJogo: true });
      pintou = true;
    }, function (e) {
      if (pintou) return;
      raiz.innerHTML = T.erroBloco(e.message, "tentarAnalise");
      var b = document.getElementById("tentarAnalise");
      if (b) b.addEventListener("click", function () { ctrl.agora(); });
    });
  }
  var ctrl = T.atualizar(carregar, 30000);
})();
