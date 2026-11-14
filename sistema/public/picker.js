/* Seletor de clube: busca por nome, filtro por país e prévia do tema do clube escolhido. */
(function (w) {
  "use strict";
  var T = w.Torcida;
  var esc = T.esc;
  var contador = 0;
  var cache = null; // lista de clubes é a mesma para todos os seletores da página

  function carregarClubes() {
    if (cache) return Promise.resolve(cache);
    return T.api("/api/clubes", { semRedirecionar: true }).then(function (d) { cache = d; return d; });
  }

  // estado: { escolhido, tema (false = não muda as cores), onPick({nome, pais, logo}) }
  T.montarPicker = function (raiz, estado) {
    estado = estado || {};
    var n = ++contador;
    raiz.innerHTML =
      '<label for="pk-q-' + n + '">Busque o clube</label>' +
      '<input id="pk-q-' + n + '" class="pk-q" placeholder="Santos, Real Madrid, Al Hilal…" autocomplete="off" maxlength="60">' +
      '<div class="paises pk-paises" role="group" aria-label="Filtrar por país"></div>' +
      '<div class="agora-escolhido pk-agora" aria-live="polite"></div>' +
      '<div class="clube-grade pk-grade" role="list"><p class="muted">Carregando clubes…</p></div>';
    var q = raiz.querySelector(".pk-q");
    var paisesEl = raiz.querySelector(".pk-paises");
    var agora = raiz.querySelector(".pk-agora");
    var grade = raiz.querySelector(".pk-grade");
    var dados = null;
    var pais = "";

    function textoAgora() {
      agora.innerHTML = estado.escolhido
        ? "Escolhido: <strong>" + esc(estado.escolhido) + "</strong>. Toque em outro para trocar."
        : "Nenhum clube ainda. Escolha um da lista.";
    }

    function pintar() {
      var busca = T.normaliza(q.value);
      var lista = (dados.clubes || []).filter(function (c) {
        if (pais && c.pais !== pais) return false;
        if (!busca) return true;
        return T.normaliza(c.nome + " " + c.liga + " " + c.pais).indexOf(busca) >= 0;
      });
      grade.innerHTML = lista.length ? lista.map(function (c) {
        return '<button type="button" class="clube-item" role="listitem" data-nome="' + esc(c.nome) + '" data-pais="' + esc(c.pais) + '" aria-pressed="' + (estado.escolhido === c.nome) + '">' +
          T.escudo(c.logo, c.nome) + "<strong>" + esc(c.nome) + "</strong><span>" + esc(c.pais) + " · " + esc(c.liga) + "</span></button>";
      }).join("") : '<p class="muted">Nenhum clube com esse nome. Tente outro termo ou limpe o filtro de país.</p>';
    }

    function escolher(nome, paisClube, logo) {
      estado.escolhido = nome;
      estado.paisClube = paisClube;
      textoAgora();
      grade.querySelectorAll(".clube-item").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-nome") === nome)); });
      if (estado.tema !== false) {
        T.api("/api/tema?time=" + encodeURIComponent(nome) + "&pais=" + encodeURIComponent(paisClube || ""), { semRedirecionar: true })
          .then(function (t) { if (t && t.cores && estado.escolhido === nome) T.aplicarTema(t.cores, nome); })
          .catch(function () { /* prévia é só enfeite */ });
      }
      if (estado.onPick) estado.onPick({ nome: nome, pais: paisClube || "", logo: logo || "" });
    }

    grade.addEventListener("click", function (ev) {
      var b = ev.target.closest(".clube-item");
      if (!b) return;
      var img = b.querySelector("img");
      escolher(b.getAttribute("data-nome"), b.getAttribute("data-pais"), img ? img.getAttribute("src") : "");
    });
    paisesEl.addEventListener("click", function (ev) {
      var b = ev.target.closest(".chip");
      if (!b) return;
      pais = b.getAttribute("data-pais") || "";
      paisesEl.querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      pintar();
    });
    q.addEventListener("input", pintar);

    textoAgora();
    carregarClubes().then(function (d) {
      dados = d;
      paisesEl.innerHTML = '<button type="button" class="chip" data-pais="" aria-pressed="true">todos</button>' +
        (d.paises || []).map(function (p) {
          return '<button type="button" class="chip" data-pais="' + esc(p.pais) + '" aria-pressed="false">' + esc(p.bandeira) + " " + esc(p.pais) + "</button>";
        }).join("");
      pintar();
    }).catch(function (e) {
      grade.innerHTML = T.erroBloco(e.message, "tentarClubes-" + n);
      var b = document.getElementById("tentarClubes-" + n);
      if (b) b.addEventListener("click", function () { T.montarPicker(raiz, estado); });
    });
    return estado;
  };
})(window);
