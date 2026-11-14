// Banco de dados em arquivo JSON, mantido em memória.
//
// Antes, cada requisição relia e interpretava o db.json inteiro (e salvava uma cópia velha por cima
// de alterações feitas durante chamadas de rede, perdendo posts e curtidas). Agora existe UM objeto
// compartilhado: todo mundo lê e altera a mesma instância, e a gravação em disco é adiada e atômica.
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./config");

const ARQUIVO = path.join(DATA_DIR, "db.json");
const BACKUP = ARQUIVO + ".bak";
const ESPERA_GRAVAR_MS = 400;
const INTERVALO_BACKUP_MS = 30 * 60 * 1000;

let db = null;
let sujo = false;
let timer = null;
let ultimoBackup = 0;
let ultimoId = 0;

function vazio() {
  return {};
}

// Garante as coleções que o resto do código assume existirem.
function normalizar(d) {
  const listas = ["usuarios", "posts", "curtidas", "comentarios", "jogos", "tabela", "noticias", "seguindo", "clubesExtra"];
  const mapas = ["agendaExterna", "agendaLiga", "tabelaLiga", "fichas", "predicoes", "catalogoPais", "avatares", "afIds", "meta"];
  for (const k of listas) if (!Array.isArray(d[k])) d[k] = [];
  for (const k of mapas) if (!d[k] || typeof d[k] !== "object" || Array.isArray(d[k])) d[k] = {};
  // chaves de funcionalidades que não existem mais
  for (const k of ["bolao", "bolaoSeed", "calendario"]) delete d[k];
  return d;
}

function lerArquivo(arquivo) {
  const bruto = fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, "");
  const dados = JSON.parse(bruto);
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw new Error("formato inesperado");
  return dados;
}

function lerDoDisco() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const arquivo of [ARQUIVO, BACKUP]) {
    if (!fs.existsSync(arquivo)) continue;
    try {
      const dados = lerArquivo(arquivo);
      if (arquivo === BACKUP) console.warn("[db] db.json ilegível; recuperado do backup db.json.bak");
      return dados;
    } catch (e) {
      console.error(`[db] não consegui ler ${path.basename(arquivo)}: ${e.message}`);
      if (arquivo === ARQUIVO) {
        try {
          const guardado = path.join(DATA_DIR, "db.corrompido-" + Date.now() + ".json");
          fs.copyFileSync(ARQUIVO, guardado);
          console.error("[db] cópia do arquivo com problema guardada em " + path.basename(guardado));
        } catch { /* sem espaço ou sem permissão: segue */ }
      }
    }
  }
  return vazio();
}

function load() {
  if (!db) {
    db = normalizar(lerDoDisco());
    for (const lista of [db.usuarios, db.posts, db.comentarios]) {
      for (const x of lista) if (Number(x.id) > ultimoId) ultimoId = Number(x.id);
    }
  }
  return db;
}

// Gera ids crescentes. Date.now() sozinho repete quando duas coisas são criadas no mesmo milissegundo.
function novoId() {
  const agora = Date.now();
  ultimoId = agora > ultimoId ? agora : ultimoId + 1;
  return ultimoId;
}

function gravarAgora() {
  if (!db) return;
  sujo = false;
  const texto = JSON.stringify(db, null, 2);
  const tmp = ARQUIVO + ".tmp";
  try {
    if (fs.existsSync(ARQUIVO) && Date.now() - ultimoBackup > INTERVALO_BACKUP_MS) {
      fs.copyFileSync(ARQUIVO, BACKUP);
      ultimoBackup = Date.now();
    }
    fs.writeFileSync(tmp, texto);
    fs.renameSync(tmp, ARQUIVO);
  } catch (e) {
    // OneDrive/antivírus às vezes seguram o arquivo por instantes: grava direto como último recurso.
    try {
      fs.writeFileSync(ARQUIVO, texto);
      try { fs.unlinkSync(tmp); } catch { /* tmp pode nem existir */ }
    } catch (e2) {
      sujo = true;
      console.error("[db] falha ao gravar: " + e2.message);
    }
  }
}

// `db` é opcional: existe só porque o código antigo chamava save(db).
function save() {
  sujo = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (sujo) gravarAgora();
  }, ESPERA_GRAVAR_MS);
}

function gravarSincrono() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (sujo) gravarAgora();
}

module.exports = { load, save, novoId, gravarSincrono, ARQUIVO };
