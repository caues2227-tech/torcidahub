// Saída para a internet: JSON de APIs conhecidas e download seguro de imagens de terceiros.
const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

// APIs de endereço fixo (ESPN, API-Football, TheSportsDB). Nunca lança: devolve null se falhar.
async function httpJson(url, ms, extraHeaders) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 8000);
  try {
    const r = await fetch(url, {
      headers: { ...UA, Accept: "application/json", ...(extraHeaders || {}) },
      signal: ctrl.signal
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- proteção contra SSRF
function ipv4Privado(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function ipPrivado(ip) {
  const versao = net.isIP(ip);
  if (versao === 4) return ipv4Privado(ip);
  if (versao === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapeado = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipv4Privado(mapeado[1]);
    return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true;
}

// Resolve o nome e só aceita endereços públicos (a checagem acontece na própria conexão,
// então um nome que muda de IP depois da validação também é barrado).
function lookupSeguro(hostname, opcoes, cb) {
  dns.lookup(hostname, { all: true }, (erro, enderecos) => {
    if (erro) return cb(erro);
    const bons = (enderecos || []).filter((e) => !ipPrivado(e.address));
    if (!bons.length) return cb(new Error("endereço não permitido"));
    if (opcoes && opcoes.all) return cb(null, bons);
    cb(null, bons[0].address, bons[0].family);
  });
}

function pedir(urlStr, { ms, maxBytes, headers }) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch { return reject(new Error("url inválida")); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new Error("protocolo não permitido"));
    const porta = url.port ? Number(url.port) : (url.protocol === "https:" ? 443 : 80);
    if (porta !== 80 && porta !== 443) return reject(new Error("porta não permitida"));
    if (url.username || url.password) return reject(new Error("url com credenciais"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && ipPrivado(host)) return reject(new Error("endereço não permitido"));
    if (/^localhost$/i.test(host) || /\.(local|internal|localhost)$/i.test(host)) return reject(new Error("endereço não permitido"));

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: "GET",
      headers: { ...UA, "Accept-Encoding": "identity", ...(headers || {}) },
      lookup: lookupSeguro
    }, (res) => {
      const pedacos = [];
      let total = 0;
      res.on("data", (c) => {
        total += c.length;
        if (total > maxBytes) { req.destroy(new Error("arquivo grande demais")); return; }
        pedacos.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(pedacos) }));
      res.on("error", reject);
    });
    const limite = setTimeout(() => req.destroy(new Error("tempo esgotado")), ms);
    req.on("error", (e) => { clearTimeout(limite); reject(e); });
    req.on("close", () => clearTimeout(limite));
    req.end();
  });
}

// Baixa um arquivo de URL escolhida por terceiros (feeds, respostas de APIs) com todas as travas.
async function buscarSeguro(urlStr, { ms = 8000, maxBytes = 5 * 1024 * 1024, headers, redirecionamentos = 3 } = {}) {
  let atual = urlStr;
  for (let i = 0; i <= redirecionamentos; i++) {
    const r = await pedir(atual, { ms, maxBytes, headers });
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
      atual = new URL(r.headers.location, atual).toString();
      continue;
    }
    return r;
  }
  throw new Error("redirecionamentos demais");
}

// Reconhece o tipo real da imagem pelos primeiros bytes (não confia no que o servidor diz).
function tipoDaImagem(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (buf.toString("latin1", 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

module.exports = { UA, httpJson, buscarSeguro, tipoDaImagem, ipPrivado };
