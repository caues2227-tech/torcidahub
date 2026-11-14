// Senhas, tokens JWT (HS256) e identificação de quem está chamando a API.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { DATA_DIR } = require("./config");
const { load } = require("./db");
const { clubePorNome } = require("../clubes");

const pbkdf2 = promisify(crypto.pbkdf2);

// ---------------------------------------------------------------- segredo
// Antes o segredo era um texto fixo dentro do código: qualquer pessoa conseguia forjar um token de admin.
function obterSegredo() {
  const doEnv = String(process.env.TORCIDA_SECRET || "").trim();
  if (doEnv.length >= 16) return doEnv;
  if (doEnv) console.warn("[auth] TORCIDA_SECRET tem menos de 16 caracteres; ignorando e usando o segredo gerado.");
  const arquivo = path.join(DATA_DIR, ".segredo");
  try {
    const guardado = fs.readFileSync(arquivo, "utf8").trim();
    if (guardado.length >= 32) return guardado;
  } catch { /* primeira execução */ }
  const novo = crypto.randomBytes(48).toString("base64url");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(arquivo, novo, { mode: 0o600 });
  } catch (e) {
    console.warn("[auth] não consegui guardar o segredo em disco (" + e.message + "). As sessões cairão a cada reinício.");
  }
  return novo;
}
const SEGREDO = obterSegredo();

function comparar(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- senhas
const ITERACOES = 310000;
const ITERACOES_ANTIGAS = 100000; // formato antigo "salt:hash"

async function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await pbkdf2(String(senha), salt, ITERACOES, 32, "sha256")).toString("hex");
  return `v2$${ITERACOES}$${salt}$${hash}`;
}

async function senhaOk(senha, gravado) {
  try {
    const texto = String(gravado || "");
    let iter = ITERACOES_ANTIGAS;
    let salt;
    let hash;
    if (texto.startsWith("v2$")) {
      const [, it, s, h] = texto.split("$");
      iter = Number(it);
      salt = s;
      hash = h;
    } else {
      [salt, hash] = texto.split(":");
    }
    if (!salt || !hash || !Number.isInteger(iter) || iter < 1000 || iter > 5e6) return false;
    const teste = (await pbkdf2(String(senha), salt, iter, hash.length / 2, "sha256")).toString("hex");
    return comparar(teste, hash);
  } catch {
    return false;
  }
}

function precisaRehash(gravado) {
  return !String(gravado || "").startsWith("v2$" + ITERACOES + "$");
}

let hashFalso = null;
// Usado quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails têm conta.
async function gastarTempoDeSenha(senha) {
  if (!hashFalso) hashFalso = await hashSenha(crypto.randomBytes(8).toString("hex"));
  await senhaOk(senha, hashFalso);
}

// ---------------------------------------------------------------- token
const TOKEN_DIAS = Math.max(1, Number(process.env.TOKEN_DIAS) || 30);
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const CABECALHO = b64({ alg: "HS256", typ: "JWT" });

function assinar(dados) {
  return crypto.createHmac("sha256", SEGREDO).update(dados).digest("base64url");
}

function emitirToken(usuario) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64({ sub: usuario.id, iat: agora, exp: agora + TOKEN_DIAS * 86400 });
  const base = CABECALHO + "." + corpo;
  return base + "." + assinar(base);
}

function lerToken(token) {
  if (typeof token !== "string") return null;
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== CABECALHO) return null;
  if (!comparar(assinar(partes[0] + "." + partes[1]), partes[2])) return null;
  try {
    const corpo = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
    if (!corpo || !corpo.sub || !(corpo.exp > Date.now() / 1000)) return null;
    return corpo;
  } catch {
    return null;
  }
}

// Assinatura curta para URLs que o próprio servidor emite (proxy de imagens): sem ela, ninguém
// consegue mandar o servidor buscar um endereço escolhido por terceiros.
function assinarTexto(texto) {
  return assinar("texto:" + texto).slice(0, 22);
}

// ---------------------------------------------------------------- quem está chamando
function limpaTexto(v, max) {
  return String(v || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function cabecalho(req, nome) {
  const v = req.headers[nome];
  return Array.isArray(v) ? v[0] : (v || "");
}

// Cabeçalhos só carregam Latin-1; o navegador manda nomes como "Beşiktaş" codificados (%C5%9F) e aqui voltam ao normal.
function cabecalhoTexto(req, nome, max) {
  const bruto = cabecalho(req, nome);
  let texto = bruto;
  try { texto = decodeURIComponent(bruto); } catch { /* não estava codificado */ }
  return limpaTexto(texto, max);
}

function clubeValido(nome) {
  return !!(nome && clubePorNome(nome));
}

function tokenDoReq(req) {
  const h = cabecalho(req, "authorization");
  return /^Bearer /i.test(h) ? h.slice(7).trim() : "";
}

function euDoUsuario(u) {
  const clube = clubePorNome(u.time);
  return {
    id: u.id,
    nome: u.nome,
    usuario: u.usuario || "",
    email: u.email || "",
    time: u.time,
    feedTime: u.feedTime || u.time,
    pais: u.pais || (clube && clube.pais) || "Brasil",
    papel: u.papel || "torcedor",
    foto: u.foto || "",
    autenticado: true,
    convidado: !!u.convidado,
    tokenInvalido: false
  };
}

// Quem faz a chamada. Com token válido, os dados vêm SEMPRE do banco (nada do que o cliente enviar
// por cabeçalho vale). Sem token, vira "visitante": só lê, e os cabeçalhos X-Torcida-* servem apenas
// para personalizar a leitura (clube em destaque, tema).
function resolverEu(req) {
  const token = tokenDoReq(req);
  let tokenInvalido = false;
  if (token) {
    const corpo = lerToken(token);
    const u = corpo && load().usuarios.find((x) => x.id === corpo.sub);
    if (u) return euDoUsuario(u);
    tokenInvalido = true;
  }
  const timeH = cabecalhoTexto(req, "x-torcida-time", 60);
  const feedH = cabecalhoTexto(req, "x-torcida-feed", 60);
  const time = clubeValido(timeH) ? timeH : "Santos";
  const feedTime = clubeValido(feedH) ? feedH : time;
  const clube = clubePorNome(time);
  const cliente = limpaTexto(cabecalho(req, "x-torcida-cliente"), 64);
  return {
    id: 0,
    nome: cabecalhoTexto(req, "x-torcida-nome", 40) || "Visitante",
    usuario: "",
    email: "",
    time,
    feedTime,
    pais: (clube && clube.pais) || "Brasil",
    papel: "visitante",
    foto: "",
    autenticado: false,
    convidado: true,
    cliente: /^[a-zA-Z0-9-]{8,64}$/.test(cliente) ? cliente : "",
    tokenInvalido
  };
}

// ---------------------------------------------------------------- admin
function chaveAdmin() {
  return String(process.env.ADMIN_CHAVE || "").trim();
}

// A chave vale pelo cabeçalho X-Admin-Key (preferido) ou por ?k= (usado só para abrir o painel).
function chaveAdminValida(req, url) {
  const esperada = chaveAdmin();
  if (!esperada) return false;
  const enviada = String(cabecalho(req, "x-admin-key") || (url && url.searchParams.get("k")) || "").trim();
  return !!enviada && comparar(enviada, esperada);
}

function ehAdmin(req, eu, url) {
  return !!(eu && eu.autenticado && eu.papel === "admin") || chaveAdminValida(req, url);
}

module.exports = {
  hashSenha, senhaOk, precisaRehash, gastarTempoDeSenha,
  emitirToken, lerToken, resolverEu, euDoUsuario, ehAdmin, chaveAdminValida, clubeValido, limpaTexto, comparar, assinarTexto,
  TOKEN_DIAS
};
