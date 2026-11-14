/* Painel de administração: status das integrações, sincronização, jogos e times cadastrados à mão. */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };

  // A chave vem do link (?k=...), fica só nesta aba e some da barra de endereço.
  var chave = new URLSearchParams(location.search).get("k") || sessionStorage.getItem("torcida.admin") || "";
  if (chave) {
    sessionStorage.setItem("torcida.admin", chave);
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  function adm(caminho, metodo, corpo) {
    return T.api(caminho, { metodo: metodo || "GET", corpo: corpo, cabecalhos: { "X-Admin-Key": chave }, semRedirecionar: true });
  }
  function semAcesso(e) {
    if (e && e.status === 403) { $("avisoChave").hidden = false; return true; }
    return false;
  }

  function cartao(titulo, valor, detalhe, classe) {
    return '<div class="stat"><b class="' + (classe || "") + '" style="font-size:22px">' + esc(valor) + "</b><span>" + esc(titulo) + (detalhe ? "<br>" + esc(detalhe) : "") + "</span></div>";
  }

  function pintarStatus(s) {
    var ia = s.ia || {};
    var g = ia.groq, m = ia.gemini;
    var iaTxt = !ia.ligada ? "desligada" : (g && g.ok) || (m && m.ok) ? "funcionando" : "com falha";
    var uso = (s.apiFootball || {}).uso || {};
    var c = s.contagens || {};
    $("status").innerHTML =
      cartao("versão", s.versao, Math.floor(s.uptimeSeg / 60) + " min no ar") +
      cartao("memória", s.memoriaMB + " MB") +
      cartao("IA do chatbot", iaTxt, [g ? "Groq " + (g.ok ? "ok" : "falhou") : "", m ? "Gemini " + (m.ok ? "ok" : "falhou") : ""].filter(Boolean).join(" · "), iaTxt === "funcionando" ? "ok-txt" : (iaTxt === "com falha" ? "ruim-txt" : "")) +
      cartao("API-Football", (s.apiFootball || {}).ligada ? (uso.chamadas + "/" + uso.teto) : "desligada", (s.apiFootball || {}).ligada ? "chamadas hoje" : "sem chave") +
      cartao("football-data.org", (s.footballData || {}).ligada ? "ligada" : "desligada", (s.footballData || {}).ligada ? "agenda extra" : "sem chave") +
      cartao("TheSportsDB", (s.sportsDb || {}).ligada ? "ligada" : "desligada", (s.sportsDb || {}).chave || "") +
      cartao("jogos no calendário", String((s.espn || {}).jogosNoCalendario || 0), (s.espn || {}).atualizadoEm ? "atualizado " + T.tempoRelativo(s.espn.atualizadoEm) : "") +
      cartao("tabela", String((s.tabela || {}).times || 0) + " clubes", ((s.tabela || {}).meta || {}).fonte || "") +
      cartao("notícias", String((s.noticias || {}).total || 0)) +
      cartao("usuários", String(c.usuarios), c.convidados + " perfis rápidos") +
      cartao("posts", String(c.posts), c.comentarios + " coment. · " + c.curtidas + " curtidas");
  }

  function carregarStatus() {
    $("status").innerHTML = '<div class="esqueleto esqueleto-card"></div>';
    return adm("/api/admin/status").then(pintarStatus).catch(function (e) {
      if (!semAcesso(e)) $("status").innerHTML = T.erroBloco(e.message, "tentarStatus");
      var b = $("tentarStatus");
      if (b) b.addEventListener("click", carregarStatus);
    });
  }
  $("atualizarStatus").addEventListener("click", carregarStatus);

  $("sincronizar").addEventListener("click", function () {
    var btn = this;
    btn.disabled = true;
    $("msgSync").className = "campo-erro";
    $("msgSync").textContent = "Puxando tabela e manchetes…";
    adm("/api/sincronizar", "POST").then(function (d) {
      $("msgSync").className = "campo-erro ok-txt";
      $("msgSync").textContent = "Atualizado: tabela com " + d.qtdTabela + " clubes e " + d.qtdNoticias + " matérias.";
      carregarStatus();
    }).catch(function (e) { $("msgSync").className = "campo-erro"; $("msgSync").textContent = e.message; })
      .then(function () { btn.disabled = false; });
  });

  /* ---------------- jogos ---------------- */
  function carregarJogos() {
    return adm("/api/admin/jogos").then(function (d) {
      $("listaJogos").innerHTML = (d.jogos || []).length ? d.jogos.map(function (j) {
        var placar = j.placarMandante != null ? j.placarMandante + " x " + j.placarVisitante : "—";
        return '<tr><td>' + esc(j.data.split("-").reverse().join("/")) + " " + esc(j.horario) + "</td><td>" + esc(j.mandante) + " x " + esc(j.visitante) +
          '<br><span class="muted pequeno">' + esc(j.competicao) + "</span></td><td>" + esc(placar) + "</td>" +
          '<td style="white-space:nowrap"><button type="button" class="btn btn-ghost btn-pequeno" data-resultado="' + j.id + '">Resultado</button> ' +
          '<button type="button" class="btn btn-perigo btn-pequeno" data-apagar-jogo="' + j.id + '">Excluir</button></td></tr>';
      }).join("") : '<tr><td colspan="4" class="muted">Nenhum jogo cadastrado à mão.</td></tr>';
      var dl = $("listaJogos");
      dl.dataset.jogos = JSON.stringify(d.jogos || []);
    }).catch(function (e) { semAcesso(e); });
  }

  $("listaJogos").addEventListener("click", function (ev) {
    var jogos = JSON.parse(this.dataset.jogos || "[]");
    var r = ev.target.closest("[data-resultado]");
    var a = ev.target.closest("[data-apagar-jogo]");
    if (a) {
      if (!window.confirm("Excluir esse jogo?")) return;
      adm("/api/jogos/" + a.getAttribute("data-apagar-jogo"), "DELETE").then(function () { T.toast("Jogo excluído."); carregarJogos(); }).catch(function (e) { T.toast(e.message, "erro"); });
    }
    if (r) {
      var j = jogos.filter(function (x) { return String(x.id) === r.getAttribute("data-resultado"); })[0];
      if (!j) return;
      var m = T.abrirModal({
        titulo: j.mandante + " x " + j.visitante,
        html: '<form id="formRes"><div class="form-linha"><div><label for="rPm">Gols ' + esc(j.mandante) + '</label><input id="rPm" type="number" min="0" max="99" required value="' + (j.placarMandante == null ? "" : j.placarMandante) + '"></div>' +
          '<div><label for="rPv">Gols ' + esc(j.visitante) + '</label><input id="rPv" type="number" min="0" max="99" required value="' + (j.placarVisitante == null ? "" : j.placarVisitante) + '"></div></div>' +
          '<p class="campo-erro" id="erroRes" role="alert"></p><button class="btn" type="submit">Salvar resultado</button></form>'
      });
      m.corpo.querySelector("#formRes").addEventListener("submit", function (e2) {
        e2.preventDefault();
        adm("/api/jogos/" + j.id, "PUT", { placarMandante: m.corpo.querySelector("#rPm").value, placarVisitante: m.corpo.querySelector("#rPv").value }).then(function () {
          m.fechar();
          T.toast("Resultado salvo.");
          carregarJogos();
        }).catch(function (err) { m.corpo.querySelector("#erroRes").textContent = err.message; });
      });
    }
  });

  $("formJogo").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var erro = $("erroJogo");
    erro.textContent = "";
    var corpo = {
      mandante: $("jMandante").value.trim(), visitante: $("jVisitante").value.trim(), data: $("jData").value, horario: $("jHorario").value,
      competicao: $("jComp").value.trim(), local: $("jLocal").value.trim(), placarMandante: $("jPm").value, placarVisitante: $("jPv").value
    };
    adm("/api/jogos", "POST", corpo).then(function () {
      T.toast("Jogo cadastrado.");
      ["jMandante", "jVisitante", "jComp", "jLocal", "jPm", "jPv"].forEach(function (c) { $(c).value = ""; });
      carregarJogos();
    }).catch(function (e) { erro.textContent = e.message; });
  });

  /* ---------------- times ---------------- */
  function carregarTimes() {
    return T.api("/api/times", { semRedirecionar: true }).then(function (d) {
      var extras = d.extras || [];
      $("listaTimes").innerHTML = extras.length ? extras.map(function (t) {
        return "<tr><td>" + esc(t.nome) + "</td><td>" + esc(t.sigla) + "</td><td>" + esc(t.pais) + '</td><td><button type="button" class="btn btn-perigo btn-pequeno" data-apagar-time="' + esc(t.nome) + '">Excluir</button></td></tr>';
      }).join("") : '<tr><td colspan="4" class="muted">Nenhum time cadastrado à mão.</td></tr>';
    });
  }
  $("listaTimes").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-apagar-time]");
    if (!b || !window.confirm("Excluir esse time?")) return;
    adm("/api/times/" + encodeURIComponent(b.getAttribute("data-apagar-time")), "DELETE").then(function () {
      T.toast("Time excluído.");
      carregarTimes();
    }).catch(function (e) { T.toast(e.message, "erro"); });
  });
  $("formTime").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var erro = $("erroTime");
    erro.textContent = "";
    adm("/api/times", "POST", { nome: $("tNome").value.trim(), sigla: $("tSigla").value.trim(), pais: $("tPais").value.trim(), liga: $("tLiga").value.trim() }).then(function () {
      T.toast("Time cadastrado.");
      $("tNome").value = "";
      $("tSigla").value = "";
      carregarTimes();
      carregarClubes();
    }).catch(function (e) { erro.textContent = e.message; });
  });

  function carregarClubes() {
    return T.api("/api/clubes", { semRedirecionar: true }).then(function (d) {
      $("listaClubes").innerHTML = (d.clubes || []).map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join("");
    }).catch(function () {});
  }

  if (!chave) $("avisoChave").hidden = false;
  carregarStatus();
  carregarJogos();
  carregarTimes();
  carregarClubes();
})();
