// Camada HTTP: respostas padronizadas, leitura de corpo, limites de uso, roteador e arquivos estáticos.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { PUBLIC, CONFIAR_PROXY } = require("./config");

class ErroHttp extends Error {
  constructor(status, mensagem, codigo, extra) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo || "";
    this.extra = extra || null;
  }
}

// ---------------------------------------------------------------- cabeçalhos de segurança
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

function cabecalhosDeSeguranca(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", CSP);
}

// ---------------------------------------------------------------- respostas
function aceitaGzip(req) {
  return /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
}

function enviar(req, res, status, tipo, corpo, extras) {
  const cab = { "Content-Type": tipo, ...(extras || {}) };
  if (req && corpo.length > 1024 && aceitaGzip(req) && !cab["Content-Encoding"]) {
    zlib.gzip(corpo, (erro, comprimido) => {
      if (erro) {
        res.writeHead(status, cab);
        return res.end(corpo);
      }
      res.writeHead(status, { ...cab, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
      res.end(comprimido);
    });
    return;
  }
  res.writeHead(status, cab);
  res.end(corpo);
}

function json(res, status, corpo, req) {
  enviar(req, res, status, "application/json; charset=utf-8", Buffer.from(JSON.stringify(corpo)), { "Cache-Control": "no-store" });
}

function erro(res, status, mensagem, codigo, extra) {
  const corpo = { erro: mensagem };
  if (codigo) corpo.codigo = codigo;
  if (extra) Object.assign(corpo, extra);
  json(res, status, corpo);
}

function redirect(res, destino, status) {
  res.writeHead(status || 302, { Location: destino, "Cache-Control": "no-store" });
  res.end();
}

// ---------------------------------------------------------------- corpo da requisição
function lerCorpo(req, limite) {
  const teto = limite || 100 * 1024;
  return new Promise((resolve, reject) => {
    const declarado = Number(req.headers["content-length"] || 0);
    if (declarado > teto) {
      req.resume();
      return reject(new ErroHttp(413, "Conteúdo grande demais.", "grande_demais"));
    }
    const pedacos = [];
    let total = 0;
    let estourou = false;
    req.on("data", (c) => {
      if (estourou) return;
      total += c.length;
      if (total > teto) {
        estourou = true;
        pedacos.length = 0;
        reject(new ErroHttp(413, "Conteúdo grande demais.", "grande_demais"));
        return;
      }
      pedacos.push(c);
    });
    req.on("end", () => {
      if (estourou) return;
      const texto = Buffer.concat(pedacos).toString("utf8");
      if (!texto.trim()) return resolve({});
      try {
        const dados = JSON.parse(texto);
        if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw new Error("não é objeto");
        resolve(dados);
      } catch {
        reject(new ErroHttp(400, "JSON inválido.", "json_invalido"));
      }
    });
    req.on("error", () => reject(new ErroHttp(400, "Requisição interrompida.", "interrompida")));
  });
}

// ---------------------------------------------------------------- limite de uso
const limitadores = new Map();

function limitador(nome, janelaMs, max) {
  if (!limitadores.has(nome)) limitadores.set(nome, { janelaMs, max, mapa: new Map() });
  return limitadores.get(nome);
}

function ipDe(req) {
  if (CONFIAR_PROXY) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xff) return xff;
  }
  return (req.socket && req.socket.remoteAddress) || "?";
}

// Devolve { ok, esperaSeg }. Cada chamada conta como um uso.
function consumir(nome, chave) {
  const l = limitadores.get(nome);
  if (!l) return { ok: true, esperaSeg: 0 };
  const agora = Date.now();
  let e = l.mapa.get(chave);
  if (!e || e.reinicia <= agora) {
    e = { n: 0, reinicia: agora + l.janelaMs };
    l.mapa.set(chave, e);
  }
  e.n += 1;
  return { ok: e.n <= l.max, esperaSeg: Math.max(1, Math.ceil((e.reinicia - agora) / 1000)) };
}

function zerar(nome, chave) {
  const l = limitadores.get(nome);
  if (l) l.mapa.delete(chave);
}

setInterval(() => {
  const agora = Date.now();
  for (const l of limitadores.values()) {
    for (const [k, e] of l.mapa) if (e.reinicia <= agora) l.mapa.delete(k);
  }
}, 60 * 1000).unref();

// ---------------------------------------------------------------- roteador
const rotas = [];

function compilar(caminho) {
  const nomes = [];
  const fonte = caminho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, n) => {
    nomes.push(n);
    return "([^/]+)";
  });
  return { re: new RegExp("^" + fonte + "$"), nomes };
}

// opcoes: { auth: bool, admin: bool, limite: [nome, chaveDe("ip"|"usuario")], corpo: bytes }
function rota(metodo, caminho, opcoes, handler) {
  if (typeof opcoes === "function") { handler = opcoes; opcoes = {}; }
  rotas.push({ metodo, ...compilar(caminho), opcoes: opcoes || {}, handler });
}

function acharRota(metodo, caminho) {
  for (const r of rotas) {
    if (r.metodo !== metodo) continue;
    const m = r.re.exec(caminho);
    if (!m) continue;
    const params = {};
    r.nomes.forEach((n, i) => { try { params[n] = decodeURIComponent(m[i + 1]); } catch { params[n] = m[i + 1]; } });
    return { rota: r, params };
  }
  return null;
}

function metodosDoCaminho(caminho) {
  return [...new Set(rotas.filter((r) => r.re.test(caminho)).map((r) => r.metodo))];
}

// ---------------------------------------------------------------- arquivos estáticos
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};
const COMPRIMIVEL = new Set([".html", ".css", ".js", ".json", ".webmanifest", ".svg", ".txt"]);
const cacheArquivos = new Map();

function lerArquivoEstatico(completo, ext) {
  const st = fs.statSync(completo);
  if (!st.isFile()) return null;
  const chave = completo;
  const guardado = cacheArquivos.get(chave);
  if (guardado && guardado.mtime === st.mtimeMs && guardado.tamanho === st.size) return guardado;
  const buf = fs.readFileSync(completo);
  const entrada = {
    mtime: st.mtimeMs,
    tamanho: st.size,
    buf,
    gz: COMPRIMIVEL.has(ext) && buf.length > 1024 ? zlib.gzipSync(buf, { level: 9 }) : null,
    etag: '"' + st.size.toString(16) + "-" + Math.round(st.mtimeMs).toString(16) + '"'
  };
  cacheArquivos.set(chave, entrada);
  return entrada;
}

// Devolve true se respondeu. `pathname` já vem sem querystring.
function servirEstatico(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  if (rel.includes("\0")) return false;
  const completo = path.normalize(path.join(PUBLIC, rel));
  if (completo !== PUBLIC && !completo.startsWith(PUBLIC + path.sep)) return false;
  const ext = path.extname(completo).toLowerCase();
  const tipo = TIPOS[ext];
  if (!tipo || path.basename(completo).startsWith(".")) return false;
  let arq;
  try { arq = lerArquivoEstatico(completo, ext); } catch { return false; }
  if (!arq) return false;

  const imutavel = ext === ".woff2";
  const cab = {
    "Content-Type": tipo,
    ETag: arq.etag,
    "Cache-Control": imutavel ? "public, max-age=31536000, immutable" : (ext === ".html" ? "no-cache" : "public, max-age=0, must-revalidate"),
    Vary: "Accept-Encoding"
  };
  if (req.headers["if-none-match"] === arq.etag) {
    res.writeHead(304, cab);
    res.end();
    return true;
  }
  if (arq.gz && aceitaGzip(req)) {
    res.writeHead(200, { ...cab, "Content-Encoding": "gzip", "Content-Length": arq.gz.length });
    res.end(req.method === "HEAD" ? undefined : arq.gz);
  } else {
    res.writeHead(200, { ...cab, "Content-Length": arq.buf.length });
    res.end(req.method === "HEAD" ? undefined : arq.buf);
  }
  return true;
}

module.exports = {
  ErroHttp, cabecalhosDeSeguranca, enviar, json, erro, redirect, lerCorpo,
  limitador, consumir, zerar, ipDe, rota, acharRota, metodosDoCaminho, servirEstatico, aceitaGzip
};
