// Torcida: ponto de entrada. Cuida só de HTTP (despacho, limites, erros) e do ciclo de vida do processo.
// As regras de negócio ficam em lib/ (dominio.js, servicos.js) e as rotas em lib/rotas.js.
const http = require("http");
const { URL } = require("url");
const C = require("./lib/config");
const banco = require("./lib/db");
const A = require("./lib/auth");
const H = require("./lib/http");
const { definirExtras } = require("./clubes");
const { registrar } = require("./lib/rotas");
const S = require("./lib/servicos");
const D = require("./lib/dominio");

// Páginas que mudaram de lugar continuam abrindo.
const REDIRECIONAMENTOS = { "/hoje.html": "/jogos.html", "/bolao.html": "/feed.html", "/notificacoes.html": "/feed.html" };

// Com LOGIN_OBRIGATORIO=1 estas rotas continuam abertas para quem ainda não entrou.
const ABERTAS_SEM_LOGIN = new Set([
  "/api/saude", "/api/times", "/api/paises", "/api/clubes", "/api/tema", "/api/cadastro", "/api/login",
  "/api/senha/esqueci", "/api/senha/redefinir", "/api/me", "/api/logout", "/api/gnews"
]);

const PAGINA_404 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página não encontrada | Torcida</title><link rel="stylesheet" href="/estilos.css"></head>
<body class="splash"><div class="splash-hero"><div class="splash-copy"><div class="brand">TORCIDA<span>.</span></div>
<h1>fora de campo.</h1><p class="muted">Essa página não existe ou mudou de lugar.</p>
<p><a class="btn" href="/portal.html">Voltar ao portal</a></p></div></div></body></html>`;

function limiteExcedido(res, esperaSeg) {
  res.setHeader("Retry-After", String(esperaSeg));
  H.erro(res, 429, "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.", "limite", { esperaSeg });
}

async function executar(achada, req, res, url) {
  const { rota, params } = achada;
  const ip = H.ipDe(req);
  const geral = H.consumir("api-ip", ip);
  if (!geral.ok) return limiteExcedido(res, geral.esperaSeg);

  const eu = A.resolverEu(req);
  const op = rota.opcoes;
  const caminho = url.pathname;
  const ehImagem = caminho.startsWith("/img/") || caminho.startsWith("/fotos/");

  if (C.LOGIN_OBRIGATORIO && !eu.autenticado && !ehImagem && !ABERTAS_SEM_LOGIN.has(caminho)) {
    return H.erro(res, 401, "Entre na sua conta para continuar.", "login_necessario");
  }
  if (op.auth && !eu.autenticado) {
    return eu.tokenInvalido
      ? H.erro(res, 401, "Sua sessão expirou. Entre de novo.", "sessao_invalida")
      : H.erro(res, 401, "Entre na sua conta para continuar.", "login_necessario");
  }
  if (op.admin && !A.ehAdmin(req, eu, url)) {
    const tentativas = H.consumir("admin-ip", ip);
    if (!tentativas.ok) return limiteExcedido(res, tentativas.esperaSeg);
    return H.erro(res, 403, "Área restrita à administração.", "proibido");
  }
  for (const [nome, tipo] of op.limite || []) {
    const r = H.consumir(nome, tipo === "usuario" && eu.autenticado ? "u" + eu.id : ip);
    if (!r.ok) return limiteExcedido(res, r.esperaSeg);
  }

  const ctx = {
    req, res, url, eu, ip, params,
    query: Object.fromEntries(url.searchParams),
    corpo: (limite) => H.lerCorpo(req, limite || op.corpo)
  };
  const resultado = await rota.handler(ctx);
  if (res.headersSent || res.writableEnded) return;
  if (resultado && resultado.__status) return H.json(res, resultado.__status, resultado.corpo, req);
  H.json(res, 200, resultado === undefined ? { ok: true } : resultado, req);
}

async function tratar(req, res) {
  H.cabecalhosDeSeguranca(res);
  const url = new URL(req.url, "http://localhost");
  const caminho = url.pathname;
  const metodo = req.method === "HEAD" ? "GET" : req.method;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { Allow: "GET, HEAD, POST, PUT, DELETE, OPTIONS" });
    return res.end();
  }
  if (metodo === "GET" && REDIRECIONAMENTOS[caminho]) return H.redirect(res, REDIRECIONAMENTOS[caminho], 301);
  if (metodo === "GET" && caminho === "/favicon.ico") return H.redirect(res, "/favicon.svg", 301);

  const achada = H.acharRota(metodo, caminho);
  if (achada) return executar(achada, req, res, url);

  if (metodo === "GET") {
    if (H.servirEstatico(req, res, caminho === "/" ? "/portal.html" : caminho)) return;
  }
  const permitidos = H.metodosDoCaminho(caminho);
  if (permitidos.length) {
    res.setHeader("Allow", permitidos.join(", "));
    return H.erro(res, 405, "Método não permitido.", "metodo");
  }
  if (caminho.startsWith("/api/") || caminho.startsWith("/img/") || caminho.startsWith("/fotos/")) {
    return H.erro(res, 404, "Rota não encontrada.", "nao_encontrado");
  }
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(PAGINA_404);
}

const server = http.createServer((req, res) => {
  tratar(req, res).catch((e) => {
    if (e instanceof H.ErroHttp) {
      if (e.status === 429 && e.extra && e.extra.esperaSeg) res.setHeader("Retry-After", String(e.extra.esperaSeg));
      if (!res.headersSent) H.erro(res, e.status, e.message, e.codigo, e.extra);
      else res.end();
      return;
    }
    console.error("[erro]", req.method, req.url, e && e.stack ? e.stack : e);
    if (!res.headersSent) H.erro(res, 500, "Erro interno. Tente novamente em instantes.", "erro_interno");
    else res.end();
  });
});
server.requestTimeout = 60 * 1000;
server.headersTimeout = 20 * 1000;
server.keepAliveTimeout = 10 * 1000;

server.on("clientError", (erro, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`A porta ${C.PORT} já está em uso. Feche o outro servidor ou use outra porta (ex.: PORT=3001).`);
  } else {
    console.error("[servidor]", e);
  }
  process.exit(1);
});

// Um erro em tarefa de fundo (coleta de dados, IA) não deve derrubar o site.
process.on("unhandledRejection", (e) => console.error("[promessa sem tratamento]", e && e.stack ? e.stack : e));
process.on("uncaughtException", (e) => console.error("[exceção não tratada]", e && e.stack ? e.stack : e));

let encerrando = false;
function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`\n${sinal}: salvando dados e encerrando…`);
  banco.gravarSincrono();
  for (const res of D.clientesStream) { try { res.end(); } catch { /* já fechou */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500).unref();
}
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));
process.on("exit", () => banco.gravarSincrono());

// ---------------------------------------------------------------- início
const dados = banco.load();
definirExtras(dados.clubesExtra);
registrar();

server.listen(...(C.HOST ? [C.PORT, C.HOST] : [C.PORT]), () => {
  const modo = [];
  modo.push(D.iaLigada() ? "chatbot com IA" : "chatbot só com o banco (sem chave de IA)");
  if (D.apiFootballLigada()) modo.push("API-Football");
  if (D.footballDataLigada()) modo.push("football-data.org");
  if (D.sportsDbLigada()) modo.push(D.sportsDbKey() === "123" ? "TheSportsDB free" : "TheSportsDB");
  if (C.LOGIN_OBRIGATORIO) modo.push("login obrigatório");
  console.log(`Torcida ${C.VERSAO} em http://localhost:${C.PORT} · ${modo.join(" · ")}`);
  if (!String(process.env.ADMIN_CHAVE || "").trim()) console.log("Painel de administração desativado (defina ADMIN_CHAVE no .env para usar /admin.html?k=SUA_CHAVE).");
  S.iniciarRotinas();
});
