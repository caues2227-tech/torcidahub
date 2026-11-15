/* Escolha de clube: cria o perfil rápido de visitante ou atualiza o clube de quem já tem conta. */
(function () {
  "use strict";
  var T = window.Torcida;
  var $ = function (id) { return document.getElementById(id); };
  var voltar = T.voltarUrl();
  var atual = T.eu();
  var estado = { time: atual.autenticado ? atual.time : "", feedTime: atual.autenticado ? atual.feedTime : "", pais: atual.autenticado ? atual.pais : "" };

  if (voltar) {
    $("irCadastro").href = "/cadastro.html?voltar=" + encodeURIComponent(voltar);
    $("irLogin").href = "/login.html?voltar=" + encodeURIComponent(voltar);
  }
  if (atual.autenticado) {
    $("selo").textContent = "trocando o clube";
    $("tituloOn").textContent = "trocar de clube";
    $("nome").value = atual.nome;
  } else if (atual.nome && atual.nome !== "Visitante") {
    $("nome").value = atual.nome;
  }
  if (estado.time) $("selCoracao").textContent = estado.time;
  if (estado.feedTime) $("selFeed").textContent = estado.feedTime;

  function passo(n) {
    $("passo1").hidden = n !== 1;
    $("passo2").hidden = n !== 2;
    $("p1i").classList.toggle("on", n >= 1);
    $("p2i").classList.toggle("on", n >= 2);
  }

  T.montarPicker($("pickCoracao"), {
    escolhido: estado.time,
    onPick: function (c) {
      estado.time = c.nome;
      estado.pais = c.pais;
      $("selCoracao").textContent = c.nome;
      $("erro1").textContent = "";
    }
  });
  T.montarPicker($("pickFeed"), {
    tema: false,
    escolhido: estado.feedTime && estado.feedTime !== estado.time ? estado.feedTime : "",
    onPick: function (c) { estado.feedTime = c.nome; $("selFeed").textContent = c.nome; }
  });

  $("prox").addEventListener("click", function () {
    if (!estado.time) { $("erro1").textContent = "Escolha o clube do coração para continuar."; return; }
    $("erro1").textContent = "";
    $("selCoracao").textContent = estado.time;
    if (!estado.feedTime) $("selFeed").textContent = estado.time;
    passo(2);
  });
  $("volta").addEventListener("click", function () { passo(1); });
  $("mesmo").addEventListener("click", function () { estado.feedTime = estado.time; $("selFeed").textContent = estado.time; });

  $("pronto").addEventListener("click", function () {
    var btn = this;
    var nome = $("nome").value.trim();
    if (nome && nome.length < 2) { passo(1); $("erro1").textContent = "O nome precisa ter pelo menos 2 letras."; $("nome").focus(); return; }
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Entrando…";
    T.api("/api/onboarding", {
      metodo: "POST", semRedirecionar: true,
      corpo: { nome: nome, time: estado.time, feedTime: estado.feedTime || estado.time }
    }).then(function (d) {
      T.salvarSessao(d);
      location.href = voltar || "/";
    }).catch(function (err) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.textContent = "Entrar na Torcida";
      $("erro2").textContent = err.status === 429 ? "Muitos perfis criados deste computador agora. Tente de novo mais tarde." : err.message;
    });
  });

  passo(1);
})();
