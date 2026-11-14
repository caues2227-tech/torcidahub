/* Bot da Torcida: página própria (#chat-root) ou botão flutuante com gaveta nas demais páginas. */
(function () {
  "use strict";
  var T = window.Torcida;
  if (!T) return;
  var esc = T.esc;
  var e = T.eu();
  var raizPagina = document.getElementById("chat-root");
  var chaveHist = "torcida.chat." + (e.autenticado ? "u" + e.id : "v" + T.clienteId());
  var historico = [];
  try { historico = JSON.parse(localStorage.getItem(chaveHist) || "[]").slice(-24); } catch (x) { historico = []; }
  var ocupado = false;

  var sugestoes = [
    "oi",
    "onde eu tô na tabela?",
    "quem é meu rival?",
    "quanto falta pra não cair?",
    "próximos jogos do " + e.time,
    "tô no G4?"
  ];

  var painel = document.createElement("section");
  painel.className = "card chat";
  painel.setAttribute("aria-label", "Conversa com o Bot da Torcida");
  painel.innerHTML =
    '<div class="chat-cab"><div><strong>Canal · Bot</strong><div class="muted pequeno" id="chatEstado"><span class="online">link ativo</span></div></div>' +
    '<div class="btn-grupo" style="margin:0"><button type="button" class="chip" id="chatLimpar">limpar</button>' +
    (raizPagina ? "" : '<button type="button" class="chip" id="chatFechar">fechar</button>') + "</div></div>" +
    '<div class="chat-sugestoes"><div class="chips chips-rolagem" id="chatSug">' + sugestoes.map(function (s) {
      return '<button type="button" class="chip">' + esc(s) + "</button>";
    }).join("") + "</div></div>" +
    '<div class="chat-msgs" id="chatMsgs" role="log" aria-live="polite" aria-relevant="additions"></div>' +
    '<form class="chat-form" id="chatForm"><label class="so-leitor" for="chatPergunta">Sua pergunta</label>' +
    '<input id="chatPergunta" name="pergunta" placeholder="ex.: próximo jogo do ' + esc(e.time) + '…" autocomplete="off" maxlength="400">' +
    '<button type="submit" class="btn" id="chatEnviar">Enviar</button></form>';

  var gaveta = null, fab = null;
  if (raizPagina) {
    raizPagina.appendChild(painel);
  } else {
    gaveta = document.createElement("aside");
    gaveta.className = "chat-gaveta";
    gaveta.id = "chatGaveta";
    gaveta.setAttribute("aria-label", "Bot da Torcida");
    gaveta.appendChild(painel);
    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "chat-fab";
    fab.setAttribute("aria-label", "Abrir o Bot da Torcida");
    fab.setAttribute("aria-controls", "chatGaveta");
    fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = T.icone("bot");
    document.body.appendChild(gaveta);
    document.body.appendChild(fab);
  }

  var msgs = painel.querySelector("#chatMsgs");
  var campo = painel.querySelector("#chatPergunta");
  var botaoEnviar = painel.querySelector("#chatEnviar");

  function abrir() {
    gaveta.classList.add("aberta");
    fab.setAttribute("aria-expanded", "true");
    campo.focus();
  }
  function fechar() {
    gaveta.classList.remove("aberta");
    fab.setAttribute("aria-expanded", "false");
    fab.focus();
  }
  if (fab) {
    fab.addEventListener("click", function () { gaveta.classList.contains("aberta") ? fechar() : abrir(); });
    painel.querySelector("#chatFechar").addEventListener("click", fechar);
    gaveta.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fechar(); });
  }

  function guardar() {
    try { localStorage.setItem(chaveHist, JSON.stringify(historico.slice(-24))); } catch (x) { /* sem espaço */ }
  }
  function bolha(texto, quem, opcoes) {
    var d = document.createElement("div");
    d.className = "msg " + quem + ((opcoes && opcoes.digitando) ? " digitando" : "");
    if (opcoes && opcoes.digitando) d.innerHTML = "<span>•</span> <span>•</span> <span>•</span>";
    else d.innerHTML = esc(texto).replace(/\n/g, "<br>");
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function saudacao() {
    var nome = e.autenticado ? e.nome.split(" ")[0] : "parceiro";
    var time = e.time || "seu clube";
    var frases = [
      "Fala, " + nome + "! ⚽ Pronto pra mais uma rodada de sofrimento (ou alegria) com o " + time + "? Tabela, rival, rebaixamento — eu respondo. Com farpa, claro.",
      "E aí, " + nome + "! 🏟️ Manda a pergunta sobre o " + time + ". Eu sou Bot de bancada, não locutor de TV.",
      "Bem-vindo, " + nome + "! 🔥 Quer tabela, clássico ou provocação? Pode mandar."
    ];
    return frases[Math.floor(Math.random() * frases.length)];
  }
  function pintarHistorico() {
    msgs.innerHTML = "";
    if (!historico.length) { bolha(saudacao(), "bot"); return; }
    historico.forEach(function (m) { bolha(m.texto, m.quem); });
  }

  function enviar(pergunta) {
    pergunta = String(pergunta || "").trim();
    if (!pergunta || ocupado) return;
    if (window.AUTH && AUTH.bloquearSeVisitante("falar com o Bot")) return;
    ocupado = true;
    botaoEnviar.disabled = true;
    campo.value = "";
    bolha(pergunta, "user");
    historico.push({ texto: pergunta, quem: "user" });
    var espera = bolha("", "bot", { digitando: true });
    T.api("/api/chatbot", { metodo: "POST", corpo: { pergunta: pergunta }, semRedirecionar: true }).then(function (d) {
      espera.remove();
      bolha(d.resposta, "bot");
      historico.push({ texto: d.resposta, quem: "bot" });
    }).catch(function (err) {
      espera.remove();
      var txt = err.status === 429 ? "Calma, torcedor! Muitas perguntas seguidas. Respire um instante e pergunte de novo."
        : err.offline ? "A conexão caiu. Confira a internet e tente de novo."
        : (err.message || "Não rolou agora. Tente de novo.");
      bolha(txt, "bot");
    }).then(function () {
      ocupado = false;
      botaoEnviar.disabled = false;
      guardar();
      campo.focus();
    });
  }

  painel.querySelector("#chatForm").addEventListener("submit", function (ev) { ev.preventDefault(); enviar(campo.value); });
  painel.querySelector("#chatSug").addEventListener("click", function (ev) {
    var b = ev.target.closest(".chip");
    if (b) { if (gaveta && !gaveta.classList.contains("aberta")) abrir(); enviar(b.textContent); }
  });
  painel.querySelector("#chatLimpar").addEventListener("click", function () {
    historico = [];
    guardar();
    pintarHistorico();
    campo.focus();
  });

  pintarHistorico();
  if (window.AUTH && AUTH.estaVisitante && AUTH.estaVisitante()) {
    painel.querySelector("#chatEstado").textContent = "visitante — só olha · crie conta pra perguntar";
    campo.disabled = true;
    botaoEnviar.disabled = true;
    painel.querySelector("#chatForm").addEventListener("click", function () {
      AUTH.exigirConta("falar com o Bot");
    });
  }
  T.api("/api/chatbot/status", { semRedirecionar: true }).then(function (d) {
    if (window.AUTH && AUTH.estaVisitante && AUTH.estaVisitante()) return;
    painel.querySelector("#chatEstado").textContent = d.ia ? "respostas com IA e dados do site" : "respostas com os dados do site";
  }).catch(function () { /* sem status, sem problema */ });

  var q = new URLSearchParams(location.search).get("q");
  if (raizPagina && q) {
    history.replaceState(null, "", location.pathname);
    setTimeout(function () { enviar(q); }, 250);
  }
})();
