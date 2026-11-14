(function () {
  "use strict";
  var T = window.Torcida;
  var $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get("token") || "";

  if (!token) {
    $("erro").textContent = "Link inválido. Peça um novo em Esqueci minha senha.";
    $("salvar").disabled = true;
  }

  $("ver").addEventListener("click", function () {
    var c = $("senha");
    var m = c.type === "password";
    c.type = m ? "text" : "password";
    $("senha2").type = c.type;
    this.textContent = m ? "ocultar" : "mostrar";
  });

  $("form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var s1 = $("senha").value;
    var s2 = $("senha2").value;
    $("erro").textContent = "";
    if (s1.length < 6) return ($("erro").textContent = "Mínimo 6 caracteres.");
    if (s1 !== s2) return ($("erro").textContent = "As senhas não batem.");
    var btn = $("salvar");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    T.api("/api/senha/redefinir", {
      metodo: "POST",
      corpo: { token: token, senha: s1 },
      semRedirecionar: true
    }).then(function () {
      location.href = "/login.html?ok=senha";
    }).catch(function (err) {
      $("erro").textContent = err.message || "Não deu para salvar.";
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    });
  });
})();
