/* Atalhos / e 1-5, menu mobile. Depende de Torcida.MENU via data no DOM. */
(function () {
  "use strict";

  function ligarAtalhos() {
    document.addEventListener("keydown", function (ev) {
      var tag = (ev.target && ev.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || ev.target.isContentEditable) return;
      if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey) {
        var inp = document.getElementById("buscaQ");
        if (!inp) return;
        ev.preventDefault();
        var form = document.getElementById("buscaForm");
        if (form) form.classList.add("aberta");
        inp.focus();
        return;
      }
      if (ev.key >= "1" && ev.key <= "5") {
        var links = document.querySelectorAll(".menu a, .dock a");
        var mapa = {};
        Array.prototype.forEach.call(document.querySelectorAll(".dock a"), function (a, i) {
          mapa[String(i + 1)] = a.getAttribute("href");
        });
        if (mapa[ev.key]) location.href = mapa[ev.key];
      }
    });
  }

  function ligarHamburguer() {
    var btn = document.getElementById("btnHamb");
    var mobile = document.getElementById("menuMobile");
    if (!btn || !mobile) return;
    btn.addEventListener("click", function () {
      document.body.classList.add("menu-aberto");
    });
    mobile.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-fechar-menu]") || ev.target.tagName === "A") {
        document.body.classList.remove("menu-aberto");
      }
    });
  }

  function ligarBuscaIcone() {
    var form = document.getElementById("buscaForm");
    if (!form) return;
    form.addEventListener("click", function () {
      if (window.matchMedia("(max-width: 900px)").matches) form.classList.add("aberta");
    });
  }

  function boot() {
    ligarAtalhos();
    ligarHamburguer();
    ligarBuscaIcone();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
