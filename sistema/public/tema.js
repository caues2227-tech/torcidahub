/* Aplica o tema do clube antes da página aparecer (evita o "piscar" de cor). Carregado no <head>. */
(function () {
  function rgb(hex) {
    var h = String(hex || "#1e90ff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return "30, 144, 255";
    return ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255);
  }
  var time = "Santos";
  try {
    var c = JSON.parse(localStorage.getItem("torcida.tema") || "null");
    var clube = JSON.parse(localStorage.getItem("torcida_clube") || "null");
    var prefs = JSON.parse(localStorage.getItem("torcida.prefs") || "null");
    var sess = JSON.parse(localStorage.getItem("torcida.sessao") || "null");
    time = (sess && sess.time) || (prefs && prefs.time) || (clube && clube.nome) || time;
    var accent = (c && c.accent) || (clube && clube.color) || null;
    if (accent) {
      var r = document.documentElement.style;
      r.setProperty("--accent", accent);
      r.setProperty("--accent-rgb", rgb(accent));
      r.setProperty("--accent-soft", "rgba(" + rgb(accent) + ",0.15)");
      if (c) {
        r.setProperty("--on-accent", c.ink);
        r.setProperty("--accent-text", c.text || c.accent);
        r.setProperty("--accent-dim", c.dim);
        r.setProperty("--accent-glow", c.glow);
        r.setProperty("--accent-wash", c.wash);
        r.setProperty("--accent-line", c.line);
      } else {
        r.setProperty("--accent-text", accent);
      }
    }
  } catch (e) { /* sem tema salvo: usa o padrão */ }

  /* Prefetch do portal enquanto CSS/HTML ainda carregam */
  try {
    if (/\/(index\.html)?$/.test(location.pathname) || location.pathname === "/") {
      window.__torcidaPortalEarly = fetch("/api/portal", {
        headers: { "X-Torcida-Time": time, "Accept": "application/json" },
        credentials: "same-origin"
      }).then(function (res) { return res.json(); }).catch(function () { return null; });
    }
  } catch (e2) { /* fetch indisponível */ }
})();
