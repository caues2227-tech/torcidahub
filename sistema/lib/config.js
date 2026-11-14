// Configuração central: lê o .env (sem sobrescrever variáveis já definidas) e expõe constantes.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function carregarEnv() {
  const arquivo = path.join(ROOT, ".env");
  if (!fs.existsSync(arquivo)) return;
  const texto = fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, "");
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim().replace(/^export\s+/, "");
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
carregarEnv();

// TORCIDA_DATA permite apontar para outra pasta de dados (útil para testar sem mexer nos dados reais).
const DATA_DIR = process.env.TORCIDA_DATA ? path.resolve(process.env.TORCIDA_DATA) : path.join(ROOT, "data");

module.exports = {
  ROOT,
  PUBLIC: path.join(ROOT, "public"),
  DATA_DIR,
  DIR_FOTOS: path.join(DATA_DIR, "fotos"),
  DIR_ESCUDOS: path.join(DATA_DIR, "escudos"),
  DIR_MIDIA: path.join(DATA_DIR, "midia"),
  PORT: Number(process.env.PORT) || 3000,
  // Vazio = escuta em todas as interfaces (IPv4 e IPv6). Use HOST=127.0.0.1 para aceitar só este computador.
  HOST: process.env.HOST || "",
  // Só confie em X-Forwarded-For se o servidor estiver atrás de um proxy seu.
  CONFIAR_PROXY: process.env.TRUST_PROXY === "1",
  // Exige conta para qualquer página (exceto login/cadastro). Padrão: navegação aberta.
  LOGIN_OBRIGATORIO: process.env.LOGIN_OBRIGATORIO === "1",
  VERSAO: require("../package.json").version
};
