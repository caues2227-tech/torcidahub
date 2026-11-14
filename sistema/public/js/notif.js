/* Sino de notificações — botão + badge + dropdown. */
(function (global) {
  "use strict";

  var NOTIFICACOES = [
    { id: "n1", emoji: "⚽", texto: "Santos x Coritiba começa em 2h", tempo: "há 10min", lida: false },
    { id: "n2", emoji: "🔥", texto: "Seu post recebeu 45 reações", tempo: "há 1h", lida: false },
    { id: "n3", emoji: "📰", texto: "Nova notícia do Flamengo", tempo: "há 3h", lida: false },
    { id: "n4", emoji: "👥", texto: "@peixeira_oficial começou a seguir você", tempo: "ontem", lida: true }
  ];

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

  function setNotifs(lista) {
    if (Array.isArray(lista) && lista.length) {
      NOTIFICACOES.length = 0;
      lista.forEach(function (n) {
        NOTIFICACOES.push({
          id: n.id,
          emoji: n.emoji || "🔔",
          texto: n.texto || "",
          tempo: n.tempo || n.quando || "",
          lida: !!n.lida
        });
      });
    }
    renderNotificacoes();
  }

  function renderNotificacoes() {
    var e = els();
    if (!e.list) return;
    e.list.innerHTML = NOTIFICACOES.map(function (n) {
      return '<div class="notif-item' + (n.lida ? "" : " unread") + '" data-nid="' + String(n.id || "") + '">' +
        '<span class="notif-emoji" aria-hidden="true">' + n.emoji + "</span>" +
        "<div><p class=\"notif-text\">" + esc(n.texto) + "</p>" +
        '<span class="notif-time">' + esc(n.tempo) + "</span></div></div>";
    }).join("");

    var naoLidas = NOTIFICACOES.filter(function (n) { return !n.lida; }).length;
    if (e.badge) {
      if (naoLidas > 0) {
        e.badge.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
        e.badge.hidden = false;
      } else {
        e.badge.hidden = true;
      }
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fechar() {
    var e = els();
    if (e.dropdown) e.dropdown.hidden = true;
  }

  function abrir() {
    var e = els();
    if (!e.dropdown) return;
    e.dropdown.hidden = false;
    renderNotificacoes();
  }

  function toggle(ev) {
    if (ev) ev.stopPropagation();
    var e = els();
    if (!e.dropdown) return;
    if (e.dropdown.hidden) abrir();
    else fechar();
  }

  function novaNotificacao(n) {
    NOTIFICACOES.unshift(n);
    renderNotificacoes();
    var e = els();
    if (e.btn) {
      e.btn.classList.add("has-new");
      setTimeout(function () { e.btn.classList.remove("has-new"); }, 700);
    }
  }

  function bind() {
    var e = els();
    if (!e.btn || !e.dropdown || bound) {
      renderNotificacoes();
      return;
    }
    bound = true;

    e.btn.addEventListener("click", toggle);

    document.addEventListener("click", function (ev) {
      if (!e.dropdown || e.dropdown.hidden) return;
      if (e.dropdown.contains(ev.target) || e.btn.contains(ev.target)) return;
      fechar();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") fechar();
    });

    if (e.mark) {
      e.mark.addEventListener("click", function (ev) {
        ev.stopPropagation();
        NOTIFICACOES.forEach(function (n) { n.lida = true; });
        renderNotificacoes();
      });
    }

    e.list.addEventListener("click", function (ev) {
      var item = ev.target.closest(".notif-item");
      if (!item) return;
      var id = item.getAttribute("data-nid");
      NOTIFICACOES.forEach(function (n) {
        if (String(n.id) === String(id)) n.lida = true;
      });
      renderNotificacoes();
    });

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 30);
      setTimeout(boot, 400);
    });
  } else {
    setTimeout(boot, 30);
    setTimeout(boot, 400);
  }

  global.TorcidaNotif = {
    boot: boot,
    setNotifs: setNotifs,
    render: renderNotificacoes,
    nova: novaNotificacao,
    fechar: fechar
  };
})(window);
