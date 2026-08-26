const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "db.json");
const PUBLIC = path.join(ROOT, "public");
const SECRET = "torcida-aps2";

const TIMES = [
  "Flamengo", "Palmeiras", "Corinthians", "São Paulo", "Santos",
  "Vasco", "Grêmio", "Internacional", "Atlético-MG", "Cruzeiro"
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function load() {
  if (!fs.existsSync(DATA)) {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    const seed = {
      usuarios: [],
      posts: [],
      curtidas: [],
      comentarios: [],
      jogos: [
        { id: 1, mandante: "Flamengo", visitante: "Palmeiras", data: hoje(), horario: "16:00", placarMandante: null, placarVisitante: null },
        { id: 2, mandante: "Grêmio", visitante: "Internacional", data: hoje(), horario: "18:30", placarMandante: null, placarVisitante: null }
      ]
    };
    fs.writeFileSync(DATA, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DATA, "utf8"));
  db.usuarios = db.usuarios || [];
  db.posts = db.posts || [];
  db.curtidas = db.curtidas || [];
  db.comentarios = db.comentarios || [];
  db.jogos = db.jogos || [];
  if (db.usuarios.length && !db.usuarios.some((u) => u.papel === "admin")) {
    db.usuarios[0].papel = "admin";
    save(db);
  }
  if (!db.jogos.length) {
    db.jogos = [
      { id: 1, mandante: "Flamengo", visitante: "Palmeiras", data: hoje(), horario: "16:00", placarMandante: null, placarVisitante: null },
      { id: 2, mandante: "Grêmio", visitante: "Internacional", data: hoje(), horario: "18:30", placarMandante: null, placarVisitante: null }
    ];
    save(db);
  }
  return db;
}

function save(db) {
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(senha, salt, 100000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function senhaOk(senha, gravado) {
  const [salt, hash] = gravado.split(":");
  const teste = crypto.pbkdf2Sync(senha, salt, 100000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(teste, "hex"));
}

function token(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, time: user.time, nome: user.nome, papel: user.papel || "torcedor" })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function usuarioDoReq(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!t || !t.includes(".")) return null;
  const [payload, sig] = t.split(".");
  const ok = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (ok !== sig) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendFile(res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full)) {
    res.writeHead(404);
    res.end("Não encontrado");
    return;
  }
  const ext = path.extname(full);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  res.writeHead(200, { "Content-Type": types[ext] || "text/plain; charset=utf-8" });
  res.end(fs.readFileSync(full));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); }
    });
  });
}

function normaliza(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function linhaJogo(j) {
  const placar = j.placarMandante == null ? "ainda sem placar" : `${j.placarMandante} x ${j.placarVisitante}`;
  return `${j.mandante} x ${j.visitante} — ${j.data} às ${j.horario} (${placar})`;
}

function rankingTimes(db) {
  const contagem = {};
  for (const t of TIMES) contagem[t] = 0;
  for (const user of db.usuarios) contagem[user.time] = (contagem[user.time] || 0) + 1;
  return Object.entries(contagem)
    .map(([time, qtd]) => ({ time, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.time.localeCompare(b.time));
}

function responderChat(pergunta, eu, db) {
  const p = normaliza(pergunta).trim();
  if (!p) return "Manda uma pergunta aí. Pode ser jogo de hoje, teu time, ranking ou placar.";

  const jogosHoje = db.jogos.filter((j) => j.data === hoje());
  const timeFalado = TIMES.find((t) => p.includes(normaliza(t)));
  const meuTime = eu.time;
  const postsTime = db.posts.filter((x) => x.time === meuTime).length;

  if (/^(oi|ola|eai|e ae|fala|hey|opa|bom dia|boa tarde|boa noite)\b/.test(p) || p === "oi" || p === "ola") {
    return `Fala, ${eu.nome}! Sou o bot da Torcida. Tua torcida é ${meuTime}. Pergunta dos jogos de hoje, se o ${meuTime} joga, do ranking ou do placar.`;
  }

  if (p.includes("ajuda") || p.includes("o que voce") || p.includes("comandos") || p.includes("pode fazer")) {
    return [
      "Eu leio o banco do Torcida (sem API de fora). Pode perguntar:",
      "• quais jogos tem hoje?",
      `• o ${meuTime} joga hoje?`,
      "• qual o placar?",
      "• quem tá na frente no ranking?",
      "• quantos posts a torcida fez?"
    ].join("\n");
  }

  if (p.includes("ranking") || p.includes("quem esta na frente") || p.includes("quem ta na frente") || p.includes("lider") || (p.includes("mais") && p.includes("torcedor"))) {
    const rank = rankingTimes(db);
    const top = rank.slice(0, 5).map((x, i) => `${i + 1}º ${x.time} — ${x.qtd} torcedor(es)`).join("\n");
    const pos = rank.findIndex((x) => x.time === meuTime) + 1;
    return `Ranking de torcida na plataforma:\n${top}\n\nO ${meuTime} está em ${pos}º.`;
  }

  if (p.includes("post") || p.includes("feed") || p.includes("torcida postou") || p.includes("quantos post")) {
    return `A torcida do ${meuTime} já soltou ${postsTime} post(s) no feed.`;
  }

  const querPlacar = p.includes("placar") || p.includes("resultado") || p.includes("quanto ficou") || p.includes("quanto ta");
  const querMeuTime = p.includes("meu time") || p.includes("resumo") || p.includes("a gente joga") || p.includes("nosso jogo");
  const querHoje = p.includes("hoje") || p.includes("agora") || p.includes("rodada");

  if (querMeuTime || (timeFalado === meuTime && (querHoje || querPlacar || p.includes("joga")))) {
    const jogos = (querHoje ? jogosHoje : db.jogos).filter((j) => j.mandante === meuTime || j.visitante === meuTime);
    if (!jogos.length) {
      return querHoje
        ? `Hoje o ${meuTime} não tem jogo cadastrado. Posts da torcida: ${postsTime}.`
        : `Ainda não tem jogo do ${meuTime} no banco. O admin cadastra na tela Admin.`;
    }
    return `Resumo do ${meuTime}:\n` + jogos.map(linhaJogo).join("\n") + `\n\nPosts da torcida: ${postsTime}.`;
  }

  if (timeFalado) {
    const lista = (querHoje ? jogosHoje : db.jogos).filter((j) => j.mandante === timeFalado || j.visitante === timeFalado);
    if (!lista.length) {
      return querHoje
        ? `Hoje não tem ${timeFalado} no banco.`
        : `Não achei jogo do ${timeFalado} cadastrado.`;
    }
    return `Jogos do ${timeFalado}:\n` + lista.map(linhaJogo).join("\n");
  }

  if (querPlacar) {
    const comPlacar = db.jogos.filter((j) => j.placarMandante != null);
    if (!comPlacar.length) {
      const pendentes = (querHoje ? jogosHoje : db.jogos);
      if (!pendentes.length) return "Não tem jogo cadastrado pra olhar placar.";
      return "Ainda ninguém lançou placar. Jogos no banco:\n" + pendentes.map(linhaJogo).join("\n");
    }
    return "Placares cadastrados:\n" + comPlacar.map(linhaJogo).join("\n");
  }

  if (p.includes("jogo") || p.includes("partida") || querHoje) {
    if (!jogosHoje.length) return "Não tem jogo cadastrado pra hoje. O admin lança mandante, visitante e horário.";
    return "Jogos de hoje:\n" + jogosHoje.map(linhaJogo).join("\n");
  }

  return `Não peguei essa. Tenta “jogos de hoje”, “meu time”, “ranking” ou “placar”. Eu sou do ${meuTime} também.`;
}

function postPublico(db, p) {
  const autor = db.usuarios.find((u) => u.id === p.usuarioId);
  return {
    id: p.id,
    texto: p.texto,
    time: p.time,
    nome: autor ? autor.nome : "torcedor",
    criadoEm: p.criadoEm,
    likes: db.curtidas.filter((c) => c.postId === p.id).length,
    comentarios: db.comentarios.filter((c) => c.postId === p.id).map((c) => {
      const u = db.usuarios.find((x) => x.id === c.usuarioId);
      return { id: c.id, texto: c.texto, nome: u ? u.nome : "torcedor", criadoEm: c.criadoEm };
    })
  };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const eu = usuarioDoReq(req);

  if (req.method === "GET" && u.pathname === "/api/times") {
    return json(res, 200, { times: TIMES });
  }

  if (req.method === "POST" && u.pathname === "/api/cadastro") {
    try {
      const b = await readBody(req);
      const nome = String(b.nome || "").trim();
      const email = String(b.email || "").trim().toLowerCase();
      const senha = String(b.senha || "");
      const time = String(b.time || "").trim();
      if (!nome || !email || !senha || !time) return json(res, 400, { erro: "Preencha nome, e-mail, senha e time." });
      if (senha.length < 6) return json(res, 400, { erro: "Senha com no mínimo 6 caracteres." });
      if (!TIMES.includes(time)) return json(res, 400, { erro: "Escolha um time da lista." });
      const db = load();
      if (db.usuarios.some((x) => x.email === email)) return json(res, 400, { erro: "E-mail já cadastrado." });
      const papel = db.usuarios.length === 0 ? "admin" : "torcedor";
      const user = { id: Date.now(), nome, email, senhaHash: hashSenha(senha), time, papel };
      db.usuarios.push(user);
      save(db);
      return json(res, 201, { ok: true });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "POST" && u.pathname === "/api/login") {
    try {
      const b = await readBody(req);
      const email = String(b.email || "").trim().toLowerCase();
      const senha = String(b.senha || "");
      if (!email || !senha) return json(res, 400, { erro: "Informe e-mail e senha." });
      const db = load();
      const user = db.usuarios.find((x) => x.email === email);
      if (!user || !senhaOk(senha, user.senhaHash)) return json(res, 401, { erro: "E-mail ou senha inválidos." });
      return json(res, 200, { ok: true, token: token(user), nome: user.nome, time: user.time, papel: user.papel });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "GET" && u.pathname === "/api/feed") {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    const db = load();
    const lista = db.posts.slice().sort((a, b) => b.id - a.id).map((p) => postPublico(db, p));
    return json(res, 200, { posts: lista });
  }

  if (req.method === "POST" && u.pathname === "/api/posts") {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    try {
      const b = await readBody(req);
      const texto = String(b.texto || "").trim();
      if (!texto) return json(res, 400, { erro: "Escreve alguma coisa." });
      if (texto.length > 280) return json(res, 400, { erro: "Máximo 280 caracteres." });
      const db = load();
      const post = { id: Date.now(), usuarioId: eu.id, time: eu.time, texto, criadoEm: new Date().toISOString() };
      db.posts.push(post);
      save(db);
      return json(res, 201, { post: postPublico(db, post) });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "POST" && u.pathname.match(/^\/api\/posts\/\d+\/curtir$/)) {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    const postId = Number(u.pathname.split("/")[3]);
    const db = load();
    const i = db.curtidas.findIndex((c) => c.postId === postId && c.usuarioId === eu.id);
    if (i >= 0) db.curtidas.splice(i, 1);
    else db.curtidas.push({ postId, usuarioId: eu.id });
    save(db);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && u.pathname.match(/^\/api\/posts\/\d+\/comentar$/)) {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    const postId = Number(u.pathname.split("/")[3]);
    try {
      const b = await readBody(req);
      const texto = String(b.texto || "").trim();
      if (!texto) return json(res, 400, { erro: "Comentário vazio." });
      const db = load();
      db.comentarios.push({ id: Date.now(), postId, usuarioId: eu.id, texto, criadoEm: new Date().toISOString() });
      save(db);
      return json(res, 201, { ok: true });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "GET" && u.pathname === "/api/ranking") {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    const db = load();
    const contagem = {};
    for (const t of TIMES) contagem[t] = 0;
    for (const user of db.usuarios) contagem[user.time] = (contagem[user.time] || 0) + 1;
    const ranking = Object.entries(contagem)
      .map(([time, qtd]) => ({ time, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.time.localeCompare(b.time));
    return json(res, 200, { ranking });
  }

  if (req.method === "GET" && u.pathname === "/api/resumo") {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    const db = load();
    const jogos = db.jogos.filter((j) => j.data === hoje() && (j.mandante === eu.time || j.visitante === eu.time));
    const postsTime = db.posts.filter((p) => p.time === eu.time).length;
    let texto;
    if (!jogos.length) texto = `Hoje o ${eu.time} não tem jogo cadastrado. A torcida já soltou ${postsTime} post(s).`;
    else {
      const j = jogos[0];
      const placar = j.placarMandante == null ? "ainda sem placar" : `${j.placarMandante} x ${j.placarVisitante}`;
      texto = `Hoje: ${j.mandante} x ${j.visitante} às ${j.horario} (${placar}). Posts do ${eu.time}: ${postsTime}.`;
    }
    return json(res, 200, { texto, time: eu.time });
  }

  if (req.method === "POST" && u.pathname === "/api/chatbot") {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    try {
      const b = await readBody(req);
      const pergunta = String(b.pergunta || "").trim();
      const db = load();
      return json(res, 200, { resposta: responderChat(pergunta, eu, db) });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "POST" && u.pathname === "/api/jogos") {
    if (!eu) return json(res, 401, { erro: "Faça login." });
    if (eu.papel !== "admin") return json(res, 403, { erro: "Só admin cadastra jogo." });
    try {
      const b = await readBody(req);
      const mandante = String(b.mandante || "").trim();
      const visitante = String(b.visitante || "").trim();
      const data = String(b.data || hoje());
      const horario = String(b.horario || "").trim();
      if (!mandante || !visitante || !horario) return json(res, 400, { erro: "Preenche mandante, visitante e horário." });
      const db = load();
      db.jogos.push({
        id: Date.now(), mandante, visitante, data, horario,
        placarMandante: b.placarMandante == null || b.placarMandante === "" ? null : Number(b.placarMandante),
        placarVisitante: b.placarVisitante == null || b.placarVisitante === "" ? null : Number(b.placarVisitante)
      });
      save(db);
      return json(res, 201, { ok: true });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/login.html")) return sendFile(res, "login.html");
  if (req.method === "GET" && u.pathname === "/cadastro.html") return sendFile(res, "cadastro.html");
  if (req.method === "GET" && u.pathname === "/feed.html") return sendFile(res, "feed.html");
  if (req.method === "GET" && u.pathname === "/ranking.html") return sendFile(res, "ranking.html");
  if (req.method === "GET" && u.pathname === "/chatbot.html") return sendFile(res, "chatbot.html");
  if (req.method === "GET" && u.pathname === "/admin.html") return sendFile(res, "admin.html");
  if (req.method === "GET" && u.pathname === "/estilos.css") return sendFile(res, "estilos.css");

  res.writeHead(404);
  res.end("Não encontrado");
});

server.listen(PORT, () => {
  console.log(`Torcida em http://localhost:${PORT}`);
});
