/* Utilitários de data (America/Sao_Paulo) + monograma de escudo. */
(function (global) {
  "use strict";

  function dataHojeSP() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }

  function normalizarData(dateStr) {
    if (!dateStr) return "";
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }

  function horaSP(dateISO) {
    if (!dateISO) return "--:--";
    var d = new Date(dateISO);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function diaSemanaSP(dateStr) {
    var dias = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
    var raw = String(dateStr || "");
    var d = new Date(raw.length === 10 ? raw + "T12:00:00" : raw);
    if (isNaN(d.getTime())) return "";
    return dias[d.getDay()] + " " +
      String(d.getDate()).padStart(2, "0") + "/" +
      String(d.getMonth() + 1).padStart(2, "0");
  }

  function tempoRelativo(isoDate) {
    var t = new Date(isoDate).getTime();
    if (isNaN(t)) return "";
    var diff = Date.now() - t;
    var m = Math.floor(diff / 60000);
    if (m < 1) return "agora";
    if (m < 60) return "há " + m + "min";
    var h = Math.floor(m / 60);
    if (h < 24) return "há " + h + "h";
    return "há " + Math.floor(h / 24) + "d";
  }

  function iniciais(nome) {
    var parts = String(nome || "?")
      .replace(/@/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function monogramaHTML(nome, tamanho) {
    var size = Number(tamanho) || 24;
    var initials = iniciais(nome);
    return '<span class="team-monogram" style="width:' + size + "px;height:" + size +
      "px;font-size:" + Math.round(size * 0.4) + 'px" title="' +
      String(nome || "").replace(/"/g, "&quot;") + '">' + initials + "</span>";
  }

  function slugify(nome) {
    return String(nome || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /* Escudos/fotos: troca img quebrada por monograma ou remove capa. */
  document.addEventListener("error", function (ev) {
    var img = ev.target;
    if (!img || img.tagName !== "IMG") return;
    if (img.classList.contains("news-media-img")) {
      img.remove();
      return;
    }
    if (img.classList.contains("team-badge") || img.getAttribute("data-fallback-mono") != null) {
      var nome = img.getAttribute("alt") || img.getAttribute("data-nome") || "?";
      var size = parseInt(img.getAttribute("data-size") || img.width || "24", 10) || 24;
      img.outerHTML = monogramaHTML(nome, size);
    }
  }, true);

  global.TorcidaData = {
    dataHojeSP: dataHojeSP,
    normalizarData: normalizarData,
    horaSP: horaSP,
    diaSemanaSP: diaSemanaSP,
    tempoRelativo: tempoRelativo,
    monogramaHTML: monogramaHTML,
    iniciais: iniciais,
    slugify: slugify
  };
  global.monogramaHTML = monogramaHTML;
})(window);
