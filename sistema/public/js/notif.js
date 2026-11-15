/* Sino de notificações — UI real; lista vazia até haver evento (sem fake). */
(function (global) {
  "use strict";

  var NOTIFICACOES = [];
  var bound = false;

  function els() {
    return {
      btn: document.getElementById("notifBtn"),
      dropdown: document.getElementById("notifDropdown"),
      badge: document.getElementById("notifBadge"),
      list: document.getElementById("notifList"),
      mark: document.getElementById("markRead")
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setNotifs(lista) {
    NOTIFICACOES.length = 0;
    (lista || []).forEach(function (n) {
      NOTIFICACOES.push({
        id: n.id || ("n" + NOTIFICACOES.length),
        emoji: n.emoji || "⚽",
        texto: n.texto || "",
        tempo: n.tempo || n.quando || "",
        lida: !!n.lida
      });
    });
    renderNotificacoes();
  }

  function renderNotificacoes() {
    var e = els();
    if (!e.list) return;
    if (!NOTIFICACOES.length) {
      e.list.innerHTML = '<p class="notif-vazio muted pequeno" style="padding:14px 16px;margin:0">Sem notificações por agora.</p>';
    } else {
      e.list.innerHTML = NOTIFICACOES.map(function (n) {
        return '<div class="notif-item' + (n.lida ? "" : " unread") + '" data-nid="' + esc(String(n.id || "")) + '">' +
          '<span class="notif-emoji" aria-hidden="true">' + n.emoji + "</span>" +
          "<div><p class=\"notif-text\">" + esc(n.texto) + "</p>" +
          '<span class="notif-time">' + esc(n.tempo) + "</span></div></div>";
      }).join("");
    }
    var naoLidas = NOTIFICACOES.filter(function (n) { return !n.lida; }).length;
    if (e.badge) {
      if (naoLidas > 0) {
        e.badge.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
        e.badge.hidden = false;
        if (e.btn) e.btn.classList.add("has-new");
      } else {
        e.badge.hidden = true;
        if (e.btn) e.btn.classList.remove("has-new");
      }
    }
  }

  function fechar() {
    var e = els();
    if (e.dropdown) e.dropdown.hidden = true;
    if (e.btn) e.btn.setAttribute("aria-expanded", "false");
  }

  function abrir() {
    var e = els();
    if (!e.dropdown) return;
    e.dropdown.hidden = false;
    if (e.btn) e.btn.setAttribute("aria-expanded", "true");
    renderNotificacoes();
  }

  function toggle() {
    var e = els();
    if (!e.dropdown) return;
    if (e.dropdown.hidden) abrir();
    else fechar();
  }

  function bind() {
    if (bound) return;
    var e = els();
    if (!e.btn) return;
    bound = true;
    e.btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      toggle();
    });
    if (e.mark) {
      e.mark.addEventListener("click", function () {
        NOTIFICACOES.forEach(function (n) { n.lida = true; });
        renderNotificacoes();
      });
    }
    document.addEventListener("click", function (ev) {
      var wrap = document.querySelector(".notif-wrap");
      if (!wrap || wrap.contains(ev.target)) return;
      fechar();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") fechar();
    });
    if (e.list) {
      e.list.addEventListener("click", function (ev) {
        var item = ev.target.closest(".notif-item");
        if (!item) return;
        var id = item.getAttribute("data-nid");
        NOTIFICACOES.forEach(function (n) {
          if (String(n.id) === String(id)) n.lida = true;
        });
        renderNotificacoes();
      });
    }
    renderNotificacoes();
  }

  function injectHtml() {
    if (document.getElementById("notifBtn")) return;
    var direita = document.querySelector(".topo-direita");
    if (!direita) return;
    var wrap = document.createElement("div");
    wrap.className = "notif-wrap";
    wrap.innerHTML =
      '<button type="button" class="notif-btn" id="notifBtn" aria-label="Notificações" aria-haspopup="true" aria-expanded="false">' +
      '<svg class="notif-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
      '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
      "</svg>" +
      '<span class="notif-badge" id="notifBadge" hidden>0</span>' +
      "</button>" +
      '<div class="notif-dropdown" id="notifDropdown" hidden>' +
      '<div class="notif-header"><span>Notificações</span>' +
      '<button type="button" class="notif-mark-read" id="markRead">Marcar lidas</button></div>' +
      '<div class="notif-list" id="notifList"></div></div>';
    var usuario = direita.querySelector(".usuario");
    if (usuario) direita.insertBefore(wrap, usuario);
    else direita.appendChild(wrap);
  }

  function boot() {
    injectHtml();
    bind();
  }

  function novaNotificacao(n) {
    NOTIFICACOES.unshift({
      id: n.id || ("n" + Date.now()),
      emoji: n.emoji || "⚽",
      texto: n.texto || "",
      tempo: n.tempo || "agora",
      lida: false
    });
    renderNotificacoes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 40);
      setTimeout(boot, 350);
    });
  } else {
    setTimeout(boot, 40);
    setTimeout(boot, 350);
  }

  global.TorcidaNotif = {
    boot: boot,
    setNotifs: setNotifs,
    render: renderNotificacoes,
    nova: novaNotificacao,
    fechar: fechar
  };
})(window);
