/* Agenda de jogos: filtros por competição, "hoje" e "meu clube"; mostra alguns dias e carrega mais sob demanda. */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };
  var pack = null;
  var filtro = "todos";
  var diasVisiveis = 4;

  function passa(j) {
    if (filtro === "hoje") return j.data === pack.dataHoje;
    // fora do filtro "hoje", jogos que já acabaram saem da lista
    if (j.status === "encerrado") return false;
    if (filtro === "todos") return true;
    if (filtro === "clube") return !!j.quente;
    return j.grupo === filtro;
  }

  function filtrosDisponiveis() {
    var f = [["todos", "Todos", 0], ["hoje", "Hoje", 0], ["clube", "Meu clube", 0]];
    (pack.grupos || []).forEach(function (g) { f.push([g.id, g.nome, g.qtd]); });
    return f;
  }

  function pintar() {
    if (!pack) return;
    var hojeIso = pack.dataHoje;
    $("quando").textContent = pack.atualizadoEm
      ? "Placar atualizado às " + new Date(pack.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ". " + pack.time + " em destaque."
      : "Ao vivo e próximos jogos.";

    $("filtros").innerHTML = filtrosDisponiveis().map(function (f) {
      return '<button type="button" class="chip" data-f="' + esc(f[0]) + '" aria-pressed="' + (filtro === f[0]) + '">' + esc(f[1]) + (f[2] ? " <small>" + f[2] + "</small>" : "") + "</button>";
    }).join("");

    var dias = (pack.dias || []).map(function (d) {
      return { data: d.data, jogos: d.jogos.filter(passa) };
    }).filter(function (d) { return d.jogos.length; });
    var total = dias.reduce(function (n, d) { return n + d.jogos.length; }, 0);
    var mostrar = dias.slice(0, diasVisiveis);
    var mostrados = mostrar.reduce(function (n, d) { return n + d.jogos.length; }, 0);

    $("contagem").textContent = total ? (mostrados === total ? total : mostrados + " de " + total) + (total === 1 ? " jogo" : " jogos") + " em " + dias.length + (dias.length === 1 ? " dia" : " dias") : "";
    $("agenda").innerHTML = mostrar.length
      ? mostrar.map(function (d) {
          return '<section class="dia" aria-label="' + esc(T.dataLonga(d.data, hojeIso)) + '"><h2>' + esc(T.dataLonga(d.data, hojeIso)) +
            "<small>" + d.jogos.length + (d.jogos.length === 1 ? " jogo" : " jogos") + '</small></h2><div class="grade-2">' +
            d.jogos.map(function (j) { return T.cardJogo(j); }).join("") + "</div></section>";
        }).join("")
      : T.vazio(filtro === "clube" ? "Seu clube não tem jogo na janela" : "Nenhum jogo nesse recorte",
          filtro === "hoje" ? "Hoje não há partidas nas competições acompanhadas." : "Tente outro filtro ou volte mais tarde.");
    $("maisDias").hidden = dias.length <= diasVisiveis;
  }

  $("filtros").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-f]");
    if (!b) return;
    filtro = b.getAttribute("data-f");
    diasVisiveis = 4;
    pintar();
  });
  $("maisDias").addEventListener("click", function () { diasVisiveis += 4; pintar(); });

  function carregar() {
    return T.api("/api/agenda").then(function (d) { pack = d; pintar(); }, function (e) {
      if (pack) return;
      $("agenda").innerHTML = T.erroBloco(e.message, "tentarAgenda");
      var b = $("tentarAgenda");
      if (b) b.addEventListener("click", function () { ctrl.agora(); });
    });
  }
  var ctrl = T.atualizar(carregar, 30000);
  T.aoVivo(function (d) { if (d.tipo === "gol" || d.tipo === "status") ctrl.agora(); });
})();
