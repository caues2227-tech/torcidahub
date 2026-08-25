const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "db.json");
const PUBLIC = path.join(ROOT, "public");

const TIMES = [
  "Flamengo", "Palmeiras", "Corinthians", "São Paulo", "Santos",
  "Vasco", "Grêmio", "Internacional", "Atlético-MG", "Cruzeiro"
];

function load() {
  if (!fs.existsSync(DATA)) {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFileSync(DATA, JSON.stringify({ usuarios: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
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
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, time: user.time })).toString("base64url");
  const sig = crypto.createHmac("sha256", "torcida-aps2").update(payload).digest("base64url");
  return `${payload}.${sig}`;
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

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

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
      if (!nome || !email || !senha || !time) return json(res, 400, { erro: "Preencha nome, e-mail, senha e time de coração." });
      if (senha.length < 6) return json(res, 400, { erro: "A senha deve ter no mínimo 6 caracteres." });
      if (!TIMES.includes(time)) return json(res, 400, { erro: "Escolha um time da lista." });
      const db = load();
      if (db.usuarios.some((x) => x.email === email)) return json(res, 400, { erro: "E-mail já cadastrado." });
      const user = { id: Date.now(), nome, email, senhaHash: hashSenha(senha), time, papel: "torcedor" };
      db.usuarios.push(user);
      save(db);
      return json(res, 201, { ok: true, mensagem: "Cadastro realizado." });
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
      return json(res, 200, { ok: true, token: token(user), nome: user.nome, time: user.time });
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
  }

  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/login.html")) return sendFile(res, "login.html");
  if (req.method === "GET" && u.pathname === "/cadastro.html") return sendFile(res, "cadastro.html");
  if (req.method === "GET" && u.pathname === "/feed.html") return sendFile(res, "feed.html");
  if (req.method === "GET" && u.pathname === "/estilos.css") return sendFile(res, "estilos.css");

  res.writeHead(404);
  res.end("Não encontrado");
});

server.listen(PORT, () => {
  console.log(`Torcida em http://localhost:${PORT}`);
});
