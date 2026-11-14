/* Regra de acesso: Visitante (só olha) vs Conta (tudo liberado). */
(function () {
  "use strict";

  var KEY_SESSAO = "torcida_sessao";
  var KEY_CLUBE = "torcida_clube";
  var KEY_VISITANTE = "torcida_visitante";
  var DIAS = 30;

  function lerJson(chave) {
    try {
      var raw = localStorage.getItem(chave);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function estaLogado() {
    // Conta real via API (token Torcida)
    if (window.Torcida && typeof Torcida.eu === "function") {
      try {
        if (Torcida.eu().autenticado) return true;
      } catch (e) { /* segue */ }
    }

    var sessao = lerJson(KEY_SESSAO);
    if (!sessao || !sessao.nome) return false;

    var data = sessao.data ? new Date(sessao.data).getTime() : 0;
    if (!data || isNaN(data)) return false;
    var expiraEm = data + DIAS * 24 * 60 * 60 * 1000;
    if (Date.now() > expiraEm) {
      try {
        localStorage.removeItem(KEY_SESSAO);
      } catch (e) { /* quota */ }
      return false;
    }
    return true;
  }

  function estaVisitante() {
    return !estaLogado();
  }

  function getUser() {
    if (!estaLogado()) return null;
    if (window.Torcida && typeof Torcida.eu === "function") {
      var e = Torcida.eu();
      if (e.autenticado) {
        return {
          nome: e.nome,
          email: "",
          clube: e.time,
          data: new Date().toISOString(),
          id: e.id,
          autenticadoApi: true
        };
      }
    }
    return lerJson(KEY_SESSAO);
  }

  function getClubeUsuario() {
    if (!estaLogado()) return null;
    var clube = lerJson(KEY_CLUBE);
    if (clube && (clube.name || clube.nome)) return clube;
    var u = getUser();
    if (u && u.clube) return { name: u.clube, color: "#1e90ff" };
    if (window.Torcida && Torcida.eu) {
      var t = Torcida.eu().time;
      if (t) return { name: t, color: "#1e90ff" };
    }
    return null;
  }

  function exigirConta(acao) {
    var texto = acao || "participar";
    if (window.Torcida && typeof Torcida.exigirConta === "function") {
      return Torcida.exigirConta(texto);
    }
    if (window.Torcida && typeof Torcida.toast === "function") {
      Torcida.toast("Crie uma conta pra " + texto);
    }
    var voltar = encodeURIComponent(location.pathname + location.search + location.hash);
    location.href = "/login.html?voltar=" + voltar + "#criar";
    return null;
  }

  /** true = bloqueado (visitante). false = pode seguir. */
  function bloquearSeVisitante(acao) {
    if (!estaVisitante()) return false;
    exigirConta(acao || "isso");
    return true;
  }

  function marcarVisitante() {
    try {
      localStorage.setItem(KEY_VISITANTE, "true");
    } catch (e) { /* quota */ }
  }

  function limparVisitante() {
    try {
      localStorage.removeItem(KEY_VISITANTE);
    } catch (e) { /* quota */ }
  }

  function salvarSessaoLocal(dados) {
    try {
      localStorage.setItem(KEY_SESSAO, JSON.stringify({
        nome: dados.nome,
        email: dados.email || "",
        clube: dados.clube || "",
        data: dados.data || new Date().toISOString()
      }));
      limparVisitante();
    } catch (e) { /* quota */ }
  }

  function aplicarUi() {
    var visitante = estaVisitante();
    document.documentElement.classList.toggle("modo-visitante", visitante);
    document.body.classList.toggle("modo-visitante", visitante);

    var chip = document.getElementById("chipVisitante");
    if (visitante) {
      if (!chip) {
        chip = document.createElement("a");
        chip.id = "chipVisitante";
        chip.className = "chip-visitante";
        chip.href = "/login.html#criar";
        chip.textContent = "Visitante · criar conta";
        chip.title = "Você está só olhando. Crie uma conta pra participar.";
        var topo = document.querySelector(".topo-direita") || document.querySelector(".topo .usuario");
        if (topo) topo.insertBefore(chip, topo.firstChild);
        else document.body.appendChild(chip);
      }
    } else if (chip) {
      chip.remove();
    }

    // Composer / botões que exigem conta
    document.querySelectorAll("[data-exige-conta]").forEach(function (el) {
      if (visitante) {
        el.setAttribute("aria-disabled", "true");
        el.classList.add("exige-conta");
      } else {
        el.removeAttribute("aria-disabled");
        el.classList.remove("exige-conta");
      }
    });
  }

  var AUTH = {
    estaLogado: estaLogado,
    estaVisitante: estaVisitante,
    getUser: getUser,
    getClubeUsuario: getClubeUsuario,
    exigirConta: exigirConta,
    bloquearSeVisitante: bloquearSeVisitante,
    marcarVisitante: marcarVisitante,
    limparVisitante: limparVisitante,
    salvarSessaoLocal: salvarSessaoLocal,
    aplicarUi: aplicarUi
  };

  window.AUTH = AUTH;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplicarUi);
  } else {
    aplicarUi();
  }
  // topo monta depois do app.js — reaplica
  setTimeout(aplicarUi, 80);
  setTimeout(aplicarUi, 400);
})();
