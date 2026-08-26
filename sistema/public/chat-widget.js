(function () {
  const s = sessionStorage.getItem("torcida");
  if (!s) return;
  const eu = JSON.parse(s);
  const pagina = document.body.classList.contains("chat-page");

  const atalhos = [
    "quais jogos tem hoje?",
    "meu time joga?",
    "o que a torcida tá falando?",
    "quem tá na frente no ranking?"
  ];

  function esc(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  const wrap = document.createElement("div");
  wrap.className = "chat-widget" + (pagina ? " chat-widget-page" : "");
  wrap.innerHTML = `
    ${pagina ? "" : '<button type="button" class="chat-fab" id="chatFab">Bot</button>'}
    <aside class="chat-drawer" id="chatDrawer">
      <div class="chat-head">
        <div>
          <strong>Bot da Torcida</strong>
          <div class="muted" id="chatFonte">lê o banco · IA só redige</div>
        </div>
        ${pagina ? "" : '<button type="button" class="chip" id="chatFecha">fechar</button>'}
      </div>
      <div class="chips" id="chatChips"></div>
      <div class="chat-box" id="chatMsgs"></div>
      <div class="composer">
        <input id="chatPergunta" placeholder="pergunta em linguagem natural…" autocomplete="off" />
        <button class="btn" id="chatEnviar" type="button">Enviar</button>
      </div>
    </aside>
  `;
  const alvo = document.getElementById("chat-root") || document.body;
  alvo.appendChild(wrap);

  const drawer = wrap.querySelector("#chatDrawer");
  const msgs = wrap.querySelector("#chatMsgs");
  const inp = wrap.querySelector("#chatPergunta");
  const fab = wrap.querySelector("#chatFab");
  const fecha = wrap.querySelector("#chatFecha");

  function abrir() { drawer.classList.add("open"); if (inp) inp.focus(); }
  function fechar() { drawer.classList.remove("open"); }
  if (pagina) drawer.classList.add("open");
  if (fab) fab.onclick = abrir;
  if (fecha) fecha.onclick = fechar;

  function bolha(texto, quem) {
    const div = document.createElement("div");
    div.className = "bubble " + quem;
    div.innerHTML = esc(texto).replace(/\n/g, "<br>");
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  wrap.querySelector("#chatChips").innerHTML = atalhos.map((a) =>
    `<button type="button" class="chip">${esc(a)}</button>`
  ).join("");
  wrap.querySelectorAll("#chatChips .chip").forEach((b) => {
    b.onclick = () => { inp.value = b.textContent; manda(); };
  });

  bolha("Fala, " + eu.nome + "! Pergunta do jeito que quiser. Eu puxo jogo, post e ranking do banco e só então redijo a resposta.", "bot");

  fetch("/api/chatbot/status", { headers: { Authorization: "Bearer " + eu.token } })
    .then((r) => r.json())
    .then((d) => {
      wrap.querySelector("#chatFonte").textContent = d.ia
        ? "banco + IA (a IA não inventa jogo)"
        : "banco agora · sem chave de IA (ainda responde)";
    })
    .catch(() => {});

  async function manda() {
    const pergunta = inp.value.trim();
    if (!pergunta) return;
    inp.value = "";
    bolha(pergunta, "user");
    const espera = bolha("buscando no banco…", "bot");
    const r = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + eu.token },
      body: JSON.stringify({ pergunta })
    });
    const d = await r.json();
    espera.remove();
    bolha(d.resposta || d.erro || "Não rolou.", "bot");
  }

  wrap.querySelector("#chatEnviar").onclick = manda;
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") manda(); });
})();
