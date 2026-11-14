/* Cadastro em três passos: dados, clube do coração, clube extra do feed. */
(function () {
  "use strict";
  var T = window.Torcida;
  var $ = function (id) { return document.getElementById(id); };
  var estado = { time: "", feedTime: "", pais: "" };
  var voltar = T.voltarUrl();
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (voltar) {
    $("irLogin").href = "/login.html?voltar=" + encodeURIComponent(voltar);
    $("semConta").href = "/onboarding.html?voltar=" + encodeURIComponent(voltar);
  }
  var eu = T.eu();
  if (eu.autenticado && eu.convidado) $("nome").value = eu.nome;

  function passo(n) {
    [1, 2, 3].forEach(function (i) {
      $("passo" + i).hidden = i !== n;
      $("p" + i + "i").classList.toggle("on", i <= n);
    });
    var primeiro = $("passo" + n).querySelector("input, .clube-item, button");
    if (primeiro && n === 1) $("nome").focus();
  }
  function aviso(n, msg, campo) {
    $("erro" + n).textContent = msg || "";
    ["nome", "usuario", "email", "senha"].forEach(function (c) { $(c).removeAttribute("aria-invalid"); });
    if (campo && $(campo)) { $(campo).setAttribute("aria-invalid", "true"); $(campo).focus(); }
  }

  var usuarioEditado = false;
  $("nome").addEventListener("input", function () {
    if (usuarioEditado) return;
    $("usuario").value = T.normaliza($("nome").value).replace(/[^a-z0-9_]/g, "").slice(0, 20);
  });
  $("usuario").addEventListener("input", function () {
    usuarioEditado = true;
    this.value = this.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  });
  $("verSenha").addEventListener("click", function () {
    var campo = $("senha");
    var mostrar = campo.type === "password";
    campo.type = mostrar ? "text" : "password";
    this.textContent = mostrar ? "ocultar" : "mostrar";
    this.setAttribute("aria-pressed", String(mostrar));
  });

  T.montarPicker($("pickCoracao"), {
    onPick: function (c) {
      estado.time = c.nome;
      estado.pais = c.pais;
      $("selCoracao").textContent = c.nome;
      aviso(2, "");
    }
  });
  T.montarPicker($("pickFeed"), {
    tema: false,
    onPick: function (c) { estado.feedTime = c.nome; $("selFeed").textContent = c.nome; }
  });

  $("prox1").addEventListener("click", function () {
    var nome = $("nome").value.trim();
    var usuario = $("usuario").value.trim();
    var email = $("email").value.trim();
    var senha = $("senha").value;
    if (nome.length < 2) return aviso(1, "Informe seu nome (mínimo 2 letras).", "nome");
    if (usuario.length < 2) return aviso(1, "Escolha um usuário com pelo menos 2 caracteres.", "usuario");
    if (!EMAIL.test(email)) return aviso(1, "Informe um e-mail válido.", "email");
    if (senha.length < 6) return aviso(1, "A senha precisa ter no mínimo 6 caracteres.", "senha");
    aviso(1, "");
    passo(2);
  });
  $("volta2").addEventListener("click", function () { passo(1); });
  $("prox2").addEventListener("click", function () {
    if (!estado.time) return aviso(2, "Escolha o time do coração para continuar.");
    aviso(2, "");
    $("selCoracao").textContent = estado.time;
    $("selFeed").textContent = estado.feedTime || estado.time;
    passo(3);
  });
  $("volta3").addEventListener("click", function () { passo(2); });
  $("mesmo").addEventListener("click", function () { estado.feedTime = estado.time; $("selFeed").textContent = estado.time; });

  $("form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!estado.time) { passo(2); return aviso(2, "Escolha o time do coração para continuar."); }
    var btn = $("criar");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Criando…";
    T.api("/api/cadastro", {
      metodo: "POST", semRedirecionar: true,
      corpo: {
        nome: $("nome").value.trim(), usuario: $("usuario").value.trim(), email: $("email").value.trim(), senha: $("senha").value,
        time: estado.time, feedTime: estado.feedTime || estado.time
      }
    }).then(function (d) {
      T.salvarSessao(d);
      location.href = voltar || "/portal.html";
    }).catch(function (err) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.textContent = "Criar conta e entrar";
      var campo = err.campo;
      if (campo === "time" || campo === "feedTime") { passo(2); return aviso(2, err.message); }
      if (campo && $(campo)) { passo(1); return aviso(1, err.message, campo); }
      aviso(3, err.message);
    });
  });

  passo(1);
})();
