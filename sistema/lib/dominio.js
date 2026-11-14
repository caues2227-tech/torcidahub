// Regras de negócio do Torcida: dados de futebol (ESPN, API-Football, football-data.org, TheSportsDB), agenda, tabela,
// notícias, feed social e o chatbot. Funções puras de montagem de respostas + coleta com cache.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { DATA_DIR, DIR_FOTOS, DIR_ESCUDOS, DIR_MIDIA } = require("./config");
const { load, save } = require("./db");
const { httpJson, buscarSeguro, tipoDaImagem, UA } = require("./net");
const { emitirToken, assinarTexto } = require("./auth");
const { clubePorNome } = require("../clubes");
const { marcaDoClube, escudoSvg, coresDoClube } = require("../marcas");
const BotVoz = require("./bot-voz");


function temToken(texto, token) {
  const t = normaliza(token);
  if (!t || t.length < 3) return false;
  const limpo = normaliza(texto).replace(/[?!.,;:]/g, " ");
  const re = new RegExp("(?:^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])");
  return re.test(limpo);
}

function iaLigada() {
  return !!(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

const TIMES = [
  "Palmeiras", "Flamengo", "Athletico-PR", "Fluminense", "Cruzeiro",
  "Bahia", "Bragantino", "Coritiba", "Atlético-MG", "Corinthians",
  "Botafogo", "Vitória", "São Paulo", "Santos", "Grêmio",
  "Internacional", "Mirassol", "Remo", "Vasco", "Chapecoense"
];

const FONTES = [
  { id: "ge", nome: "ge", papel: "cobertura do dia", url: "https://ge.globo.com/" },
  { id: "gazeta", nome: "Gazeta Esportiva", papel: "análise e mercado", url: "https://www.gazetaesportiva.com/" },
  { id: "terra", nome: "Terra", papel: "bastidores", url: "https://www.terra.com.br/esportes/futebol/" },
  { id: "espn", nome: "ESPN", papel: "análise e opinião", url: "https://www.espn.com.br/futebol/" },
  { id: "uol", nome: "UOL", papel: "bastidores", url: "https://www.uol.com.br/esporte/futebol/" },
  { id: "lance", nome: "Lance!", papel: "mercado da bola", url: "https://www.lance.com.br/" },
  { id: "tnt", nome: "TNT Sports", papel: "transmissão", url: "https://tntsports.com.br/" },
  { id: "clube", nome: "Site do clube", papel: "nota oficial", url: "" }
];

const SITE_CLUBE = {
  Flamengo: "https://www.flamengo.com.br/",
  Palmeiras: "https://www.palmeiras.com.br/",
  Corinthians: "https://www.corinthians.com.br/",
  "São Paulo": "https://www.saopaulofc.net/",
  Santos: "https://www.santosfc.com.br/",
  Vasco: "https://vasco.com.br/",
  Grêmio: "https://gremio.net/",
  Internacional: "https://www.internacional.com.br/",
  "Atlético-MG": "https://atletico.com.br/",
  Cruzeiro: "https://www.cruzeiro.com.br/",
  Bahia: "https://www.esporteclubebahia.com.br/",
  Bragantino: "https://www.redbullbragantino.com.br/",
  Coritiba: "https://www.coritiba.com.br/",
  Botafogo: "https://www.botafogo.com.br/",
  Vitória: "https://www.ecvitoria.com.br/",
  Fluminense: "https://www.fluminense.com.br/",
  "Athletico-PR": "https://www.athletico.com.br/",
  Mirassol: "https://www.mirassolfc.com.br/",
  Remo: "https://www.clubedoremo.com.br/",
  Chapecoense: "https://chapecoense.com/"
};

function hoje() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

// Aceita a tabela só se parecer uma classificação de verdade (evita gravar lixo vindo de uma fonte quebrada).
function tabelaSaudavel(lista) {
  if (!Array.isArray(lista) || lista.length < 18 || lista.length > 24) return false;
  const posicoes = new Set();
  for (const x of lista) {
    if (!x || !x.time || !Number.isInteger(x.posicao) || x.posicao < 1 || x.posicao > 24) return false;
    if (!(x.pontos >= 0 && x.pontos <= 120) || !(x.jogos >= 0 && x.jogos <= 46)) return false;
    posicoes.add(x.posicao);
  }
  return posicoes.size === lista.length;
}

function temaDoTime(nome, pais) {
  const c = clubePorNome(nome) || {};
  const m = marcaDoClube(nome, pais || c.pais || "");
  return { time: nome, logo: urlEscudo(nome, m.logo), logoFall: m.logoFall, cores: m.cores };
}

function sessaoPublica(user) {
  const clube = clubePorNome(user.time);
  const pais = user.pais || (clube && clube.pais) || "Brasil";
  return {
    ok: true,
    token: emitirToken(user),
    id: user.id,
    nome: user.nome,
    usuario: user.usuario || sanitizarUsuario(user.nome),
    foto: fotoPublica(user),
    time: user.time,
    feedTime: user.feedTime || user.time,
    pais,
    papel: user.papel || "torcedor",
    convidado: !!user.convidado,
    tema: temaDoTime(user.time, pais)
  };
}

function clubeOk(nome) {
  return !!(nome && clubePorNome(nome));
}

// Foto enviada pelo usuário: confere os primeiros bytes (não basta o cabeçalho dizer que é imagem).
function salvarFoto(dataUrl) {
  const m = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > 6 * 1024 * 1024) return null;
  const tipo = tipoDaImagem(buf);
  if (!tipo) return null;
  const nome = crypto.randomBytes(9).toString("hex") + "." + tipo.ext;
  fs.mkdirSync(DIR_FOTOS, { recursive: true });
  fs.writeFileSync(path.join(DIR_FOTOS, nome), buf);
  return "/fotos/" + nome;
}

const clientesStream = new Set();

function avisarStream(evento) {
  const pacote = "data: " + JSON.stringify({ ...evento, em: new Date().toISOString() }) + "\n\n";
  for (const res of clientesStream) {
    try { res.write(pacote); } catch { clientesStream.delete(res); }
  }
}


function normaliza(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function linhaJogo(j) {
  const data = String(j.data || "").split("-");
  const dataBr = data.length === 3 ? `${data[2]}/${data[1]}` : j.data;
  const placar = j.placarMandante == null ? "" : ` ${j.placarMandante}x${j.placarVisitante}`;
  let copa = j.competicao ? String(j.competicao) : "";
  copa = copa.replace(/^Brazil(ian)?\s+/i, "").replace(/\s*—\s*quartas de final \(ida\)/i, " · quartas");
  copa = copa ? ` · ${copa}` : "";
  return `${j.mandante} x ${j.visitante} · ${dataBr} ${j.horario}${placar}${copa}`;
}

// Ranking de torcida (RF19/RN03): ordena pelo número de torcedores cadastrados em cada clube.
// Empate: mais posts na frente; depois ordem alfabética. `pontos` mostra o engajamento (torcedor vale 2, post vale 1).
function rankingTimes(db) {
  const mapa = new Map();
  const pega = (time) => {
    if (!mapa.has(time)) mapa.set(time, { time, torcedores: 0, posts: 0 });
    return mapa.get(time);
  };
  for (const u of db.usuarios || []) if (u.time) pega(u.time).torcedores += 1;
  for (const p of db.posts || []) if (p.time) pega(p.time).posts += 1;
  return [...mapa.values()]
    .filter((x) => x.torcedores > 0 || x.posts > 0)
    .sort((a, b) => b.torcedores - a.torcedores || b.posts - a.posts || a.time.localeCompare(b.time, "pt-BR"))
    .map((x, i) => ({
      posicao: i + 1,
      time: x.time,
      torcedores: x.torcedores,
      posts: x.posts,
      pontos: x.torcedores * 2 + x.posts,
      qtd: x.torcedores,
      escudo: urlEscudo(x.time)
    }));
}

const ENTIDADES_HTML = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ldquo: "\u201c", rdquo: "\u201d",
  lsquo: "\u2018", rsquo: "\u2019", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", laquo: "\u00ab", raquo: "\u00bb"
};

function decodificarEntidades(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, nome) => {
    if (nome[0] === "#") {
      const n = nome[1].toLowerCase() === "x" ? parseInt(nome.slice(2), 16) : Number(nome.slice(1));
      if (!Number.isInteger(n) || n < 32 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "";
      return String.fromCodePoint(n);
    }
    const v = ENTIDADES_HTML[nome.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function falaTabela(db, time, eu) {
  const lista = (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao);
  const tab = lista.find((x) => x.time === time);
  if (!tab) return `O ${time} não tá na tabela que eu tenho aqui.`;
  const fatos = `📊 ${tab.time} — ${tab.posicao}ª posição, ${tab.pontos} pts em ${tab.jogos} jogos.`;
  const ctx = BotVoz.montarContexto(eu || { nome: "parceiro", time }, db, time, "tabela");
  return BotVoz.temperarFatos(fatos, ctx, "tabela");
}

function limpaTextoChat(t) {
  return String(t || "")
    .replace(/\bFonte:\s*[^.]*\.?/gi, "")
    .replace(/\s*[—–-]\s*fonte[:\s][^.]*\.?/gi, "")
    .replace(/\bCobertura e tabela no ge\.?/gi, "")
    .replace(/\bManchete puxada do ge[^.]*\.?/gi, "")
    .replace(/\bAbre o link da fonte\.?/gi, "")
    .replace(/\bge:\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function metaFonte(id, time) {
  const f = FONTES.find((x) => x.id === id) || FONTES[0];
  const url = id === "clube" && time && SITE_CLUBE[time] ? SITE_CLUBE[time] : (f.url || (time && SITE_CLUBE[time]) || "");
  return { id: f.id, nome: f.nome, papel: f.papel, url };
}

let syncLock = false;

function timeNoTexto(texto) {
  const t = normaliza(texto);
  const extras = [
    ["athletico paranaense", "Athletico-PR"],
    ["red bull bragantino", "Bragantino"],
    ["rb bragantino", "Bragantino"],
    ["vasco da gama", "Vasco"],
    ["atletico mineiro", "Atlético-MG"]
  ];
  for (const [k, v] of extras) if (t.includes(k)) return v;
  return TIMES.find((x) => t.includes(normaliza(x))) || null;
}

const STOPWORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "e", "com", "pra", "para", "por", "sem",
  "jogo", "jogos", "joga", "jogam", "jogar", "jogando", "vai", "vao",
  "hoje", "hj", "agora", "amanha", "quando", "que", "qual", "quais",
  "tem", "ter", "vem", "sera", "vs", "vc", "voce", "vcs",
  "meu", "minha", "teu", "sua", "partida", "partidas", "placar",
  "resultado", "resultados", "tabela", "posicao", "lugar", "pontos",
  "clube", "time", "times", "fc", "cf", "futebol", "bola", "me", "fala",
  "diz", "sobre", "venceu", "ganhou", "perdeu", "agenda", "escalacao",
  "serie", "seriea", "brasileirao", "tabela", "ta", "to", "tu", "bom", "boa",
  "clima", "tempo", "hora", "mais", "menos", "ranking", "quem", "frente", "neymar",
  "proximo", "proximos", "calendario", "semana", "rodada", "todos", "lista", "mostra",
  "lider", "lidera", "liderando", "primeiro", "ultimo", "campeao", "classificacao",
  "noticia", "noticias", "imprensa", "ao", "vivo", "aovivo", "rolando", "acontecendo",
  "final", "semifinal", "quartas", "oitavas", "grupo", "fase", "onde", "assistir",
  "copa", "liga", "campeonato", "torneio", "libertadores", "champions", "brasil"
]);

const ALIASES = {
  "athletico paranaense": "Athletico-PR",
  "red bull bragantino": "Bragantino",
  "rb bragantino": "Bragantino",
  "vasco da gama": "Vasco",
  "atletico mineiro": "Atlético-MG",
  "atletico de madrid": "Atletico Madrid",
  "atletico madrid": "Atletico Madrid",
  "manchester city": "Manchester City",
  "manchester united": "Manchester United",
  "bayern de munique": "Bayern Munich",
  "borussia dortmund": "Borussia Dortmund",
  "inter de milao": "Inter Milan",
  "inter milao": "Inter Milan",
  "paris saint germain": "Paris Saint-Germain",
  "tricolor paulista": "São Paulo",
  "real madrid": "Real Madrid",
  "al hilal": "Al Hilal",
  "al-hilal": "Al Hilal",
  "al nassr": "Al Nassr",
  "al-nassr": "Al Nassr",
  "al ittihad": "Al Ittihad",
  "al ahli": "Al Ahli",
  "man city": "Manchester City",
  "man united": "Manchester United",
  "sao paulo": "São Paulo",
  "atletico-mg": "Atlético-MG",
  "atletico mg": "Atlético-MG",
  "boca juniors": "Boca Juniors",
  "river plate": "River Plate",
  "merengues": "Real Madrid",
  "merengue": "Real Madrid",
  "barcelona": "Barcelona",
  "corinthians": "Corinthians",
  "palmeiras": "Palmeiras",
  "flamengo": "Flamengo",
  "juventus": "Juventus",
  "liverpool": "Liverpool",
  "chelsea": "Chelsea",
  "dortmund": "Borussia Dortmund",
  "tottenham": "Tottenham",
  "mengao": "Flamengo",
  "mengo": "Flamengo",
  "timao": "Corinthians",
  "coringao": "Corinthians",
  "corintians": "Corinthians",
  "parque sao jorge": "Corinthians",
  "verdao": "Palmeiras",
  "porco": "Palmeiras",
  "peixe": "Santos",
  "santos": "Santos",
  "barsa": "Barcelona",
  "barca": "Barcelona",
  "bayern": "Bayern Munich",
  "galao": "Atlético-MG",
  "galo": "Atlético-MG",
  "colorado": "Internacional",
  "imortal": "Grêmio",
  "fogao": "Botafogo",
  "nense": "Fluminense",
  "arsenal": "Arsenal",
  "napoli": "Napoli",
  "benfica": "Benfica",
  "sporting": "Sporting",
  "juve": "Juventus",
  "psg": "Paris Saint-Germain",
  "ajax": "Ajax",
  "porto": "Porto",
  "milan": "AC Milan",
  "boca": "Boca Juniors",
  "real": "Real Madrid"
};

const LIGAS = [
  { id: "4332", afId: 135, espn: "ita.1", nome: "Serie A italiana", re: /serie a italiana|campeonato italiano|\bcalcio\b/ },
  { id: "4351", afId: 71, nome: "Brasileirão", local: true, re: /brasileirao|serie a\b|seriea\b|campeonato brasileiro/ },
  { id: "", afId: 72, nome: "Brasileirão Série B", re: /serie b\b|brasileirao b/ },
  { id: "", afId: 73, nome: "Copa do Brasil", re: /copa do brasil|copadobrasil/ },
  { id: "", afId: 475, nome: "Paulistão", re: /paulista|paulistao/ },
  { id: "", afId: 13, espn: "conmebol.libertadores", nome: "Libertadores", re: /libertadores/ },
  { id: "", afId: 11, espn: "conmebol.sudamericana", nome: "Sul-Americana", re: /sul.?americana|sudamericana/ },
  { id: "", afId: 128, nome: "Liga Argentina", re: /liga argentina|primera division argentina|\bafa\b/ },
  { id: "4335", afId: 140, espn: "esp.1", nome: "La Liga", re: /la liga|\blaliga\b|espanhol/ },
  { id: "4328", afId: 39, espn: "eng.1", nome: "Premier League", re: /premier league|\bpremier\b|inglesao/ },
  { id: "4331", afId: 78, espn: "ger.1", nome: "Bundesliga", re: /bundesliga/ },
  { id: "4334", afId: 61, espn: "fra.1", nome: "Ligue 1", re: /ligue 1|campeonato frances/ },
  { id: "", afId: 94, nome: "Primeira Liga", re: /primeira liga|liga portugal|campeonato portugues/ },
  { id: "", afId: 88, nome: "Eredivisie", re: /eredivisie|holandes|neerlandes/ },
  { id: "4480", afId: 2, espn: "uefa.champions", nome: "Champions League", re: /champions|liga dos campeoes/ },
  { id: "", afId: 3, espn: "uefa.europa", nome: "Liga Europa", re: /liga europa|europa league/ },
  { id: "4422", afId: 307, espn: "ksa.1", nome: "Liga da Arábia Saudita", re: /arabia saudita|\bsaudi\b/ },
  { id: "4346", afId: 253, espn: "usa.1", nome: "MLS", re: /\bmls\b/ },
  { id: "", afId: 262, nome: "Liga MX", re: /liga mx|mexico|mexicana/ }
];

function detectarLiga(pergunta) {
  const p = normaliza(pergunta);
  return LIGAS.find((l) => l.re.test(p)) || null;
}

function fraseSoLiga(pergunta, liga) {
  if (!liga) return false;
  const p = normaliza(pergunta);
  const rest = p
    .replace(liga.re, " ")
    .replace(/\b(e|da|do|de|a|o|os|as|hoje|hj|agora|jogos|jogo|joga|tabela|classificacao|posicao|mostra|me|fala|quero|quais|qual|tem|proximos|proximo|agenda|calendario|rodada|semana)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length < 3;
}

function perguntaPolitica(p) {
  return /p[oi]{1,3}l[ei]?t[ei]?c|eleic|governo|esquerda|direita|presidente da republica/.test(p);
}

function perguntaForaDeBola(pergunta) {
  const p = normaliza(pergunta);
  if (timesCitados(pergunta).length) return false;
  if (/\b(jogo|joga|partida|placar|gol|tabela|rodada|campeonato|time|clube|torcida|escudo|libertadores|brasileirao|copa)\b/.test(p)) return false;
  return /\b(temperatura|clima|frio|calor|chuva|sol|graus|tempo hoje|previsao do tempo|hora|horas|relogio|despertador|piada|engracad|meme|amor|namor|crush|comida|fome|pizza|cerveja)\b/.test(p)
    || /\d+\s*(mais|menos|vezes|\+|x)\s*\d+|quanto e \d/.test(p)
    || perguntaPolitica(p);
}

const cacheBuscaTime = Object.create(null);
const cacheTemporadaAf = Object.create(null);
const AF_TZ = "America/Sao_Paulo";
let afHostOk = "";

function sportsDbKey() {
  // Free pública: 123 (docs). Premium: chave do perfil em thesportsdb.com (supporter).
  const k = String(process.env.SPORTSDB_KEY || "123").trim();
  return k || "123";
}

function sportsDbLigada() {
  return !!sportsDbKey();
}

function sportsdbBase() {
  return "https://www.thesportsdb.com/api/v1/json/" + sportsDbKey();
}

function apiFootballKey() {
  const k = String(process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY || "").trim();
  if (!k || k === "COLE_SUA_CHAVE_AQUI") return "";
  return k;
}

function apiFootballLigada() {
  return !!apiFootballKey();
}

function apiFootballViaRapid() {
  const via = String(process.env.API_FOOTBALL_VIA || "").toLowerCase();
  if (via === "rapid") return true;
  if (via === "direct" || via === "oficial") return false;
  const soRapid = !!(process.env.RAPIDAPI_KEY && !process.env.API_FOOTBALL_KEY);
  return soRapid;
}

function afHosts() {
  const k = apiFootballKey();
  const direct = {
    id: "direct",
    base: "https://v3.football.api-sports.io",
    headers: { "x-apisports-key": k, "x-rapidapi-key": k }
  };
  const rapid = {
    id: "rapid",
    base: "https://api-football-v1.p.rapidapi.com/v3",
    headers: {
      "x-rapidapi-key": k,
      "x-rapidapi-host": process.env.RAPIDAPI_HOST || "api-football-v1.p.rapidapi.com"
    }
  };
  const ordem = apiFootballViaRapid() ? [rapid, direct] : [direct, rapid];
  if (afHostOk === "rapid") return [rapid, direct];
  if (afHostOk === "direct") return [direct, rapid];
  return ordem;
}

function afUrl(base, caminho, params) {
  const u = new URL(base.replace(/\/$/, "") + caminho);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  });
  return u.toString();
}

function afOk(d) {
  if (!d || !Array.isArray(d.response)) return false;
  const err = d.errors;
  if (Array.isArray(err) && err.length) return false;
  if (err && typeof err === "object" && !Array.isArray(err) && Object.keys(err).length) return false;
  return true;
}

// O plano grátis da API-Football tem cota diária. O contador fica no banco, senão zerava a cada reinício
// do servidor e a cota real acabava sem o app perceber.
const AF_TETO_DIA = Number(process.env.API_FOOTBALL_TETO || 80);
const afCache = new Map();

function usoApiFootball() {
  const meta = load().meta;
  const d = hoje();
  if (!meta.afUso || meta.afUso.dia !== d) meta.afUso = { dia: d, chamadas: 0 };
  return { dia: d, chamadas: meta.afUso.chamadas, teto: AF_TETO_DIA, bloqueado: meta.afUso.chamadas >= AF_TETO_DIA };
}

function afPodeChamar() {
  return !usoApiFootball().bloqueado;
}

function registrarChamadaAf() {
  usoApiFootball();
  load().meta.afUso.chamadas += 1;
  save();
}

// O plano grátis da API-Football só libera as temporadas 2022 a 2024 e responde com um erro de "plan" quando se pede a
// atual. Quando isso acontece, as consultas que dependem de temporada ficam de lado pelo resto do dia (cada tentativa
// gasta cota e 1 a 2 s), e a ESPN, que traz a temporada atual, cobre a agenda.
let afSemTemporadaAte = 0;
// (elenco, técnico e busca de times não dependem de temporada e continuam funcionando no plano grátis)
const PEDE_TEMPORADA = /^\/(fixtures|standings|injuries)/;

function erroDePlanoAf(d) {
  const e = d && d.errors;
  const plano = e && !Array.isArray(e) && typeof e === "object" ? e.plan : "";
  return /do not have access to this season|season/i.test(String(plano || ""));
}

async function afJson(caminho, params) {
  if (!apiFootballLigada()) return null;
  if (Date.now() < afSemTemporadaAte && PEDE_TEMPORADA.test(caminho)) return null;
  const chave = caminho + "?" + JSON.stringify(params || {});
  const guardado = afCache.get(chave);
  if (guardado && Date.now() - guardado.em < 30 * 60 * 1000) return guardado.d;
  if (!afPodeChamar()) return guardado ? guardado.d : null;
  registrarChamadaAf();
  const hosts = afHosts();
  const primeiro = hosts[0];
  const d = await httpJson(afUrl(primeiro.base, caminho, params), 7000, primeiro.headers);
  if (erroDePlanoAf(d)) {
    afSemTemporadaAte = Date.now() + 12 * 60 * 60 * 1000;
    return null;
  }
  if (afOk(d)) {
    afHostOk = primeiro.id;
    afCache.set(chave, { em: Date.now(), d });
    return d;
  }
  const segundo = hosts[1];
  if (!segundo || segundo.id === primeiro.id) return null;
  const temOutro = (segundo.id === "rapid" && process.env.RAPIDAPI_KEY)
    || (segundo.id === "direct" && process.env.API_FOOTBALL_KEY);
  if (!temOutro) return null;
  registrarChamadaAf();
  const d2 = await httpJson(afUrl(segundo.base, caminho, params), 7000, segundo.headers);
  if (afOk(d2)) {
    afHostOk = segundo.id;
    afCache.set(chave, { em: Date.now(), d: d2 });
    return d2;
  }
  return null;
}

function gerarCandidatos(mensagem) {
  const palavras = normaliza(mensagem)
    .replace(/[?!.,;:]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !STOPWORDS.has(p));
  const candidatos = [];
  const n = palavras.length;
  for (let tamanho = Math.min(4, n); tamanho >= 1; tamanho--) {
    for (let i = 0; i <= n - tamanho; i++) candidatos.push(palavras.slice(i, i + tamanho).join(" "));
  }
  const vistos = new Set();
  const unicos = [];
  for (const c of candidatos) {
    if (!vistos.has(c)) {
      vistos.add(c);
      unicos.push(c);
    }
  }
  return unicos;
}

function timeSportsdbBom(t) {
  if (!t) return false;
  if (t.strSport && !/soccer/i.test(t.strSport)) return false;
  if (/_No League/i.test(t.strLeague || "")) return false;
  return true;
}

function escolherTimeSportsdb(times, nomeBusca) {
  if (!times || !times.length) return null;
  const soccer = times.filter((t) => /soccer/i.test(t.strSport || "Soccer"));
  const lista = soccer.length ? soccer : times;
  const n = normaliza(nomeBusca).replace(/-/g, " ");
  const exact = lista.find((t) => normaliza(t.strTeam).replace(/-/g, " ") === n);
  if (exact && timeSportsdbBom(exact)) return exact;
  const boaLiga = lista.filter(timeSportsdbBom);
  const br = boaLiga.filter((t) => /brazilian serie a/i.test(t.strLeague || ""));
  if (br.length) return br[0];
  return boaLiga[0] || (exact || null);
}

function escolherTimeApiFootball(lista, nomeBusca) {
  const times = (lista || []).map((x) => x && x.team).filter((t) => t && t.id && !t.national);
  if (!times.length) return null;
  const n = normaliza(nomeBusca).replace(/-/g, " ");
  const iguais = times.filter((t) => normaliza(t.name).replace(/-/g, " ") === n);
  const br = iguais.find((t) => /brazil/i.test(t.country || ""));
  if (iguais.length) return br || iguais[0];
  return times.find((t) => /brazil/i.test(t.country || "")) || times[0];
}

// Resolve o time na API-Football. Clubes do catálogo já têm o id (marcas.js), então não gastam cota;
// os demais são pesquisados uma vez e o resultado fica guardado no banco.
async function buscarTimeApiFootball(nome) {
  if (!apiFootballLigada()) return null;
  const chave = normaliza(nome);
  const guardados = load().afIds;
  if (guardados[chave]) return guardados[chave];
  const conhecido = marcaDoClube(nome).idApiFootball;
  if (conhecido) {
    return {
      idApiFootball: conhecido,
      nome,
      liga: "",
      pais: (clubePorNome(nome) || {}).pais || "",
      logo: "https://media.api-sports.io/football/teams/" + conhecido + ".png"
    };
  }
  const d = await afJson("/teams", { search: nome });
  const escolhido = escolherTimeApiFootball(d && d.response, nome);
  if (!escolhido) return null;
  const achado = {
    idApiFootball: escolhido.id,
    nome: escolhido.name,
    liga: "",
    pais: escolhido.country || "",
    logo: escolhido.logo || ("https://media.api-sports.io/football/teams/" + escolhido.id + ".png")
  };
  guardados[chave] = achado;
  save();
  return achado;
}

async function buscarTimePorNome(nome) {
  const chave = normaliza(nome);
  if (!chave) return null;
  if (Object.prototype.hasOwnProperty.call(cacheBuscaTime, chave)) return cacheBuscaTime[chave];
  const af = await buscarTimeApiFootball(nome);
  if (af) {
    cacheBuscaTime[chave] = af;
    return af;
  }
  const d = await httpJson(sportsdbBase() + "/searchteams.php?t=" + encodeURIComponent(nome), 5000);
  const escolhido = escolherTimeSportsdb(d && d.teams, nome);
  const resultado = timeSportsdbBom(escolhido)
    ? { idTeam: escolhido.idTeam, nome: escolhido.strTeam, liga: escolhido.strLeague || "" }
    : null;
  cacheBuscaTime[chave] = resultado;
  return resultado;
}

function eventoSportsdbParaJogo(ev, concluido) {
  if (!ev) return null;
  let iso = ev.strTimestamp ? String(ev.strTimestamp).replace(" ", "T") : "";
  if (iso && !/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += "Z";
  if (!iso) {
    const hora = ev.strTime || "12:00:00";
    iso = (ev.dateEvent || "") + "T" + hora + (hora.endsWith("Z") ? "" : "Z");
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const data = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
  const horario = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(dt);
  const temPlacar = concluido && ev.intHomeScore != null && ev.intHomeScore !== "";
  const mandante = nomeClubePtBr(ev.strHomeTeam || "");
  const visitante = nomeClubePtBr(ev.strAwayTeam || "");
  if (!mandante || !visitante) return null;
  const competicao = ev.strLeague || null;
  const id = ev.idEvent ? "tsdb-" + ev.idEvent : "";
  const status = concluido || temPlacar ? "encerrado" : "agendado";
  return {
    idJogo: id,
    fixtureId: id,
    espnId: "",
    mandante,
    visitante,
    data,
    horario,
    status,
    minuto: "",
    placarMandante: temPlacar ? Number(ev.intHomeScore) : null,
    placarVisitante: temPlacar ? Number(ev.intAwayScore) : null,
    competicao,
    local: ev.strVenue || "",
    fonte: "sportsdb",
    concluido: !!concluido || status === "encerrado",
    escudoCasa: urlEscudo(mandante, ev.strHomeTeamBadge || ""),
    escudoFora: urlEscudo(visitante, ev.strAwayTeamBadge || ""),
    grupo: grupoDoJogo({ competicao: competicao || "" }),
    quente: false
  };
}

function listaEventos(bloco) {
  if (!bloco) return [];
  const x = bloco.results || bloco.events || bloco;
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function origemDoNome(nome) {
  const hit = TIMES.find((t) => normaliza(t) === normaliza(nome));
  return hit ? { nome: hit, origem: "local" } : { nome, origem: "fora" };
}

async function detectarClube(pergunta, timeCoracao) {
  const p = normaliza(pergunta).replace(/[?!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (perguntaForaDeBola(pergunta)) {
    return { nome: timeCoracao, origem: "local", explicito: false };
  }
  if (/\bmeu time\b/.test(p) || /\bminha torcida\b/.test(p)) {
    return { nome: timeCoracao, origem: "local", explicito: true };
  }
  if (/\branking\b/.test(p) || /quem (esta|ta) na frente/.test(p)) {
    return { nome: timeCoracao, origem: "local", explicito: false };
  }

  const aliases = Object.entries(ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [apelido, oficial] of aliases) {
    if (!temToken(p, apelido)) continue;
    const api = await buscarTimePorNome(oficial);
    const nome = (api && api.nome) || oficial;
    const loc = origemDoNome(TIMES.includes(oficial) ? oficial : nome);
    if (TIMES.includes(oficial)) loc.nome = oficial;
    return { nome: loc.nome, origem: loc.origem, explicito: true, idTeam: api && api.idTeam, idApiFootball: api && api.idApiFootball };
  }

  const serieA = TIMES.slice().sort((a, b) => normaliza(b).length - normaliza(a).length);
  for (const t of serieA) {
    if (temToken(p, t)) {
      const api = await buscarTimePorNome(t);
      return { nome: t, origem: "local", explicito: true, idTeam: api && api.idTeam, idApiFootball: api && api.idApiFootball };
    }
  }

  if (querProximos(pergunta)) {
    return { nome: timeCoracao, origem: "local", explicito: false };
  }

  const candidatos = gerarCandidatos(pergunta).filter((c) => c.length >= 3).slice(0, 6);
  for (const candidato of candidatos) {
    const api = await buscarTimePorNome(candidato);
    if (!api) continue;
    const loc = origemDoNome(api.nome);
    return { nome: loc.nome, origem: loc.origem, explicito: true, idTeam: api.idTeam, idApiFootball: api.idApiFootball };
  }

  if (candidatos.length && /joga|jogo|time|clube|tabela|posicao|placar|partida|agenda/.test(p)) {
    return { nome: candidatos[0], origem: "busca", explicito: true, busca: candidatos[0] };
  }
  return { nome: timeCoracao, origem: "local", explicito: false };
}

const VALIDADE_ESCUDO = 30 * 24 * 60 * 60 * 1000;

function chaveEscudo(nome) {
  return normaliza(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "time";
}

function urlEscudo(nome, alternativa) {
  if (!nome && !alternativa) return "";
  // CDN direto = logo aparece na hora (ESPN / API-Football)
  if (alternativa && /^https?:\/\//i.test(alternativa)) return alternativa;
  if (!nome) return "";
  const marca = marcaDoClube(nome);
  if (marca && marca.logo && /^https?:\/\//i.test(marca.logo)) return marca.logo;
  return "/img/escudo?time=" + encodeURIComponent(nome);
}

const VALIDADE_MIDIA = 3 * 24 * 60 * 60 * 1000;
const MAX_ARQUIVOS_MIDIA = 500;

function assinarMidia(u) {
  return "/img/midia?u=" + encodeURIComponent(u) + "&s=" + assinarTexto(u);
}

// Endereço da imagem no proxy do servidor. Vai assinado: o servidor só baixa o que ele mesmo indicou,
// então ninguém consegue usá-lo para acessar endereços escolhidos por terceiros.
function urlMidia(url) {
  if (!url) return "";
  const s = String(url);
  if (s.startsWith("/fotos/") || s.startsWith("data:")) return s;
  if (s.startsWith("/img/midia?")) {
    const p = new URLSearchParams(s.slice("/img/midia?".length));
    const u = p.get("u");
    if (u && midiaRecusadaAgora(u)) return "";
    if (p.get("s") || !u || !/^https?:\/\//i.test(u)) return s;
    return assinarMidia(u); // valor antigo guardado no banco, sem assinatura
  }
  if (s.startsWith("/img/")) return s;
  if (!/^https?:\/\//i.test(s)) return s;
  if (midiaRecusadaAgora(s)) return "";
  return assinarMidia(s);
}

// Origens que recusam o nosso servidor (403, página de proteção em vez da imagem, 404): lembramos por
// algumas horas para não oferecer essa imagem na tela nem insistir. O servidor não tenta contornar a proteção.
const midiaRecusada = new Map();
const RECUSA_MIDIA_MS = 6 * 60 * 60 * 1000;

function midiaRecusadaAgora(url) {
  const ate = midiaRecusada.get(url);
  if (!ate) return false;
  if (ate < Date.now()) { midiaRecusada.delete(url); return false; }
  return true;
}

function lembrarRecusaDeMidia(url) {
  if (midiaRecusada.size > 1000) midiaRecusada.clear();
  midiaRecusada.set(url, Date.now() + RECUSA_MIDIA_MS);
}

function midiaAssinadaValida(u, s) {
  return !!(u && s && /^https?:\/\//i.test(u) && s === assinarTexto(u));
}

function chaveMidia(url) {
  return crypto.createHash("sha1").update(String(url)).digest("hex");
}

const TIPOS_POR_EXT = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

function acharArquivoDe(dir, chave) {
  for (const ext of Object.keys(TIPOS_POR_EXT)) {
    const arq = path.join(dir, chave + "." + ext);
    if (fs.existsSync(arq)) return { arq, tipo: TIPOS_POR_EXT[ext] };
  }
  return null;
}

// Mantém a pasta de cache de imagens com tamanho razoável (apaga as mais antigas).
function limparPastaDeCache(dir, maxArquivos, maxIdadeMs) {
  try {
    const itens = fs.readdirSync(dir).map((nome) => {
      const arq = path.join(dir, nome);
      return { arq, mtime: fs.statSync(arq).mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    itens.forEach((it, i) => {
      if (i >= maxArquivos || Date.now() - it.mtime > maxIdadeMs) {
        try { fs.unlinkSync(it.arq); } catch { /* em uso */ }
      }
    });
  } catch { /* pasta ainda não existe */ }
}

async function midiaEmDisco(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const chave = chaveMidia(url);
  fs.mkdirSync(DIR_MIDIA, { recursive: true });
  const existente = acharArquivoDe(DIR_MIDIA, chave);
  if (existente) {
    try {
      if (Date.now() - fs.statSync(existente.arq).mtimeMs < VALIDADE_MIDIA) {
        return { buf: fs.readFileSync(existente.arq), tipo: existente.tipo };
      }
    } catch { /* baixa de novo */ }
  }
  try {
    const origem = new URL(url).origin + "/";
    const r = await buscarSeguro(url, {
      ms: 8000,
      maxBytes: 5 * 1024 * 1024,
      // sem image/avif de propósito: os CDNs obedecem e mandariam um formato que o servidor não confere
      headers: { Accept: "image/webp,image/apng,image/*,*/*;q=0.8", Referer: origem }
    });
    if (r.status !== 200) {
      const e = new Error("midia " + r.status);
      e.recusa = r.status >= 400 && r.status < 500; // 5xx e quedas de rede são passageiras
      throw e;
    }
    // o tipo vem dos primeiros bytes: SVG e outros formatos ativos nunca passam por aqui
    const tipo = tipoDaImagem(r.buffer);
    if (!tipo || r.buffer.length < 200) {
      const e = new Error("não é imagem aceita");
      e.recusa = true;
      throw e;
    }
    fs.writeFileSync(path.join(DIR_MIDIA, chave + "." + tipo.ext), r.buffer);
    return { buf: r.buffer, tipo: tipo.mime };
  } catch (e) {
    // se a origem falhou, serve a cópia velha em vez de quebrar a imagem
    if (existente) {
      try { return { buf: fs.readFileSync(existente.arq), tipo: existente.tipo }; } catch { /* some */ }
    }
    if (e && e.recusa) lembrarRecusaDeMidia(url);
    return null;
  }
}

// Baixa em segundo plano as imagens das manchetes mais novas: a tela abre sem esperar a origem e as que
// a origem recusa são descobertas antes de aparecerem na tela como imagem quebrada.
let aquecendoMidia = false;
async function aquecerMidias(db) {
  if (aquecendoMidia) return;
  aquecendoMidia = true;
  try {
    const urls = (db.noticias || []).slice().sort((a, b) => Number(b.id) - Number(a.id))
      .map((n) => n.imagem)
      .filter((u) => /^https?:\/\//i.test(u || "") && !midiaRecusadaAgora(u))
      .slice(0, 24);
    for (let i = 0; i < urls.length; i += 3) {
      await Promise.all(urls.slice(i, i + 3).map((u) => midiaEmDisco(u).catch(() => null)));
    }
  } finally {
    aquecendoMidia = false;
  }
}

function fotoDoClube(db, time) {
  if (!time) return "";
  const post = (db.posts || []).slice().reverse().find((p) => p.time === time && p.foto && fotoLocalOk(p.foto));
  if (post && post.foto) return urlMidia(post.foto);
  const news = (db.noticias || []).find((n) => n.time === time && n.imagem);
  if (news && news.imagem) return urlMidia(news.imagem);
  const ficha = (db.fichas || {})[normaliza(time)];
  if (ficha && ficha.foto) return urlMidia(ficha.foto);
  return "";
}

function sanitizarUsuario(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

function usuarioLivre(db, base, ignorarId) {
  let u = sanitizarUsuario(base) || "nacao";
  const ocupado = (x) => (db.usuarios || []).some((a) => a.usuario === x && a.id !== ignorarId);
  if (!ocupado(u)) return u;
  for (let i = 2; i < 99; i++) {
    const t = u.slice(0, 16) + i;
    if (!ocupado(t)) return t;
  }
  return u.slice(0, 14) + Date.now().toString(36).slice(-4);
}

function fotoPublica(user) {
  if (!user || !user.foto) return "";
  return urlMidia(user.foto);
}

// Foto de perfil escolhida pelo usuário. Só aceita imagem enviada (data URL) ou endereços internos
// que o próprio servidor entregou (avatares, escudos, fotos do elenco já assinadas).
function fotoPerfilOk(foto) {
  if (!foto) return "";
  const s = String(foto).trim();
  if (s.length > 2000 && !s.startsWith("data:image/")) return "";
  if (s.startsWith("data:image/")) return salvarFoto(s) || "";
  if (/^\/fotos\/[\w.-]+$/.test(s)) return fotoLocalOk(s) ? s : "";
  if (s.startsWith("/img/avatar?") || s.startsWith("/img/escudo?")) return s;
  if (s.startsWith("/img/midia?")) {
    const p = new URLSearchParams(s.slice("/img/midia?".length));
    return midiaAssinadaValida(p.get("u"), p.get("s")) ? s : "";
  }
  return "";
}

function urlAvatarSimples(tipo, nome, time) {
  return "/img/avatar?tipo=" + encodeURIComponent(tipo || "iniciais")
    + "&nome=" + encodeURIComponent(nome || "T")
    + "&time=" + encodeURIComponent(time || "");
}

function avataresSimples(nome, time) {
  return [
    { id: "iniciais", tipo: "simples", nome: "Iniciais", foto: urlAvatarSimples("iniciais", nome, time) },
    { id: "escudo", tipo: "simples", nome: "Escudo", foto: urlEscudo(time) },
    { id: "bola", tipo: "simples", nome: "Bola", foto: urlAvatarSimples("bola", nome, time) },
    { id: "faixa", tipo: "simples", nome: "Faixa", foto: urlAvatarSimples("faixa", nome, time) }
  ];
}

function xmlCor(c) {
  return String(c || "#c4f542").replace(/[^\w#(),.% -]/g, "");
}

function svgAvatar(tipo, nome, time) {
  const cores = coresDoClube(time || "Time") || {};
  const a = xmlCor(cores.accent || "#c4f542");
  const ink = xmlCor(cores.ink || "#0e1116");
  const ini = String(nome || "T").charAt(0).toUpperCase().replace(/[^A-Z0-9]/g, "T");
  if (tipo === "bola") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${a}"/><circle cx="32" cy="32" r="22" fill="${ink}"/><polygon points="32,18 40,24 37,34 27,34 24,24" fill="${a}"/><path d="M18 20 L24 24 M46 20 L40 24 M27 34 L22 46 M37 34 L42 46" fill="none" stroke="${a}" stroke-width="2.2"/></svg>`;
  }
  if (tipo === "faixa") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${ink}"/><path d="M-8 20 L72 8 L72 28 L-8 40 Z" fill="${a}"/><text x="32" y="42" text-anchor="middle" font-size="26" font-family="Arial,sans-serif" font-weight="700" fill="#fff">${ini}</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${a}"/><text x="32" y="42" text-anchor="middle" font-size="28" font-family="Arial,sans-serif" font-weight="700" fill="${ink}">${ini}</text></svg>`;
}

async function elencoAvatares(db, time) {
  db.avatares = db.avatares || {};
  const chave = normaliza(time);
  const cache = db.avatares[chave];
  if (cache && cache.jogadores && cache.jogadores.length && Date.now() - new Date(cache.puxadoEm || 0).getTime() < 7 * 24 * 60 * 60 * 1000) {
    return cache.jogadores;
  }
  const lista = [];
  const ja = new Set();
  function add(id, nome, posicao, numero, foto) {
    const n = normaliza(nome);
    if (!nome || !foto || ja.has(n)) return;
    ja.add(n);
    lista.push({
      id: String(id),
      nome,
      posicao: posicao || "",
      numero: numero || "",
      foto: urlMidia(foto)
    });
  }
  try {
    const d = await httpJson(sportsdbBase() + "/searchteams.php?t=" + encodeURIComponent(time), 5000);
    const t = escolherTimeSportsdb(d && d.teams, time);
    if (t && t.idTeam) {
      const p = await httpJson(sportsdbBase() + "/lookup_all_players.php?id=" + t.idTeam, 8000);
      for (const j of (p && p.player) || []) {
        add("p-" + j.idPlayer, j.strPlayer, j.strPosition, j.strNumber, j.strCutout || j.strThumb || "");
      }
    }
  } catch {}
  if (lista.length < 8 && apiFootballLigada()) {
    try {
      const af = await buscarTimeApiFootball(time);
      if (af && af.idApiFootball) {
        const sq = await afJson("/players/squads", { team: af.idApiFootball });
        const players = ((((sq && sq.response) || [])[0] || {}).players) || [];
        for (const j of players) add("af-" + j.id, j.name, j.position, j.number, j.photo || "");
      }
    } catch {}
  }
  const jogadores = lista.slice(0, 40);
  if (jogadores.length) {
    db.avatares[chave] = { puxadoEm: new Date().toISOString(), jogadores };
    save(db);
  }
  return jogadores;
}

function svgDoClube(nome) {
  const bruto = escudoSvg(nome || "Time", coresDoClube(nome || "Time"));
  return decodeURIComponent(bruto.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
}

// Escudos que não existem no CDN: lembra por uma hora para não repetir a busca a cada requisição.
const escudosSemImagem = new Map();

// Escudo guardado em disco (baixado do CDN uma vez por mês). Só busca endereços que o próprio servidor conhece.
async function escudoEmDisco(nome) {
  const chave = chaveEscudo(nome);
  fs.mkdirSync(DIR_ESCUDOS, { recursive: true });
  const existente = acharArquivoDe(DIR_ESCUDOS, chave);
  try {
    if (existente && Date.now() - fs.statSync(existente.arq).mtimeMs < VALIDADE_ESCUDO) {
      return { buf: fs.readFileSync(existente.arq), tipo: existente.tipo };
    }
  } catch { /* baixa de novo */ }
  if (!existente && (escudosSemImagem.get(chave) || 0) > Date.now()) return null;
  const ficha = (load().fichas || {})[normaliza(nome)];
  const tentativas = [ficha && ficha.escudo, marcaDoClube(nome).logo].filter((x) => x && /^https?:/.test(x));
  for (const url of tentativas) {
    try {
      const r = await buscarSeguro(url, { ms: 7000, maxBytes: 2 * 1024 * 1024 });
      if (r.status !== 200) continue;
      const tipo = tipoDaImagem(r.buffer);
      if (!tipo || r.buffer.length < 200) continue;
      if (existente && existente.arq.endsWith("." + tipo.ext) === false) {
        try { fs.unlinkSync(existente.arq); } catch { /* ok */ }
      }
      fs.writeFileSync(path.join(DIR_ESCUDOS, chave + "." + tipo.ext), r.buffer);
      return { buf: r.buffer, tipo: tipo.mime };
    } catch { /* tenta a próxima */ }
  }
  try {
    if (existente) return { buf: fs.readFileSync(existente.arq), tipo: existente.tipo };
  } catch { /* some */ }
  if (escudosSemImagem.size > 2000) escudosSemImagem.clear();
  escudosSemImagem.set(chave, Date.now() + 60 * 60 * 1000);
  return null;
}

function fichaCache(db, nome) {
  const f = (db.fichas || {})[normaliza(nome)] || { escudo: "", foto: "", estadio: "", nome };
  // técnico só aparece se veio da API-Football; o que a TheSportsDB gravou antes estava desatualizado
  return { ...f, escudo: urlEscudo(nome, f.escudo), tecnico: f.tecnicoFonte === "api-football" ? (f.tecnico || "") : "" };
}

const FICHA_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;
const FICHA_INCOMPLETA_MS = 12 * 60 * 60 * 1000;
const fichasEmCurso = new Map();

// A API-Football devolve vários técnicos "do clube", entre eles os da base e os que já saíram (cada um com a
// sua passagem). O atual é o que entrou por último e ainda não tem data de saída. Antes valia o primeiro da lista.
function tecnicoAtualAf(lista, idClube) {
  let melhor = null;
  let inicioMelhor = "";
  for (const c of lista || []) {
    const passagens = (c.career || []).filter((x) => x && x.team && Number(x.team.id) === Number(idClube) && !x.end);
    for (const p of passagens) {
      const inicio = String(p.start || "");
      if (!melhor || inicio > inicioMelhor) { melhor = c; inicioMelhor = inicio; }
    }
  }
  return melhor;
}

// Ficha do clube (escudo, estádio, foto, técnico). O técnico vem da API-Football e só é buscado quando
// alguém pergunta por ele (opcoes.tecnico), porque cada consulta gasta a cota diária.
// O resultado fica no banco mesmo incompleto, para não repetir a consulta a cada visita.
async function montarFicha(nome, _db, opcoes) {
  const chave = normaliza(nome);
  if (!chave) return fichaCache(load(), nome);
  const querTecnico = !!(opcoes && opcoes.tecnico);
  const marca = marcaDoClube(nome);
  const cache = load().fichas[chave];
  const idade = cache ? Date.now() - Date.parse(cache.puxadoEm || 0) : Infinity;
  const completa = !!(cache && cache.estadio);
  // fichas gravadas antes guardavam o técnico da TheSportsDB (base comunitária, desatualizada): só vale o da API-Football
  const faltaTecnico = querTecnico && cache && cache.tecnicoFonte !== "api-football" && apiFootballLigada() && afPodeChamar()
    && !(cache.tecnicoTentadoEm && Date.now() - Date.parse(cache.tecnicoTentadoEm) < FICHA_VALIDADE_MS);
  if (cache && idade < (completa ? FICHA_VALIDADE_MS : FICHA_INCOMPLETA_MS) && !faltaTecnico) {
    return { ...cache, escudo: cache.escudo || marca.logo };
  }
  const chaveTarefa = chave + (querTecnico ? "|t" : "");
  if (fichasEmCurso.has(chaveTarefa)) return fichasEmCurso.get(chaveTarefa);
  const tarefa = (async () => {
    let escudo = (cache && cache.escudo) || marca.logo;
    let foto = (cache && cache.foto) || "";
    let estadio = (cache && cache.estadio) || "";
    let tecnico = (cache && cache.tecnicoFonte === "api-football" && cache.tecnico) || "";
    let tecnicoFonte = tecnico ? "api-football" : "";
    let capacidade = (cache && cache.capacidade) || "";
    let tecnicoTentadoEm = (cache && cache.tecnicoTentadoEm) || "";
    const d = await httpJson(sportsdbBase() + "/searchteams.php?t=" + encodeURIComponent(nome), 5000);
    const t = escolherTimeSportsdb(d && d.teams, nome);
    if (t) {
      foto = t.strStadiumThumb || t.strTeamFanart1 || t.strFanart1 || t.strTeamBanner || t.strBanner || foto;
      estadio = t.strStadium || estadio;
      capacidade = t.intStadiumCapacity || capacidade;
      // strManager da TheSportsDB não é usado: o dado comunitário vem desatualizado (apareceu um técnico errado)
    }
    if (querTecnico && apiFootballLigada()) {
      const af = await buscarTimeApiFootball(nome);
      tecnicoTentadoEm = new Date().toISOString();
      if (af && af.idApiFootball) {
        escudo = af.logo || escudo;
        const dCoach = await afJson("/coachs", { team: af.idApiFootball });
        const c = tecnicoAtualAf((dCoach && dCoach.response) || [], af.idApiFootball);
        if (c && c.name) { tecnico = c.name; tecnicoFonte = "api-football"; }
      }
    }
    const ficha = {
      nome,
      escudo: escudo || marca.logo,
      foto: foto || "",
      estadio: estadio || "",
      tecnico: tecnico || "",
      tecnicoFonte,
      capacidade: capacidade || "",
      tecnicoTentadoEm,
      puxadoEm: new Date().toISOString()
    };
    load().fichas[chave] = ficha;
    save();
    return ficha;
  })().finally(() => fichasEmCurso.delete(chaveTarefa));
  fichasEmCurso.set(chaveTarefa, tarefa);
  return tarefa;
}

// Consulta as fichas em paralelo (poucas por vez) em vez de uma depois da outra.
async function fichasDosNomes(db, nomes, opcoes) {
  const unicos = [...new Set((nomes || []).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 4) {
    await Promise.all(unicos.slice(i, i + 4).map((n) => montarFicha(n, db, opcoes).catch(() => null)));
  }
  const mapa = {};
  for (const n of unicos) mapa[n] = fichaCache(db, n);
  return mapa;
}

// Para páginas de leitura: devolve o que já existe e completa as fichas em segundo plano.
function fichasEmSegundoPlano(db, nomes) {
  fichasDosNomes(db, nomes).catch(() => {});
  const mapa = {};
  for (const n of new Set((nomes || []).filter(Boolean))) mapa[n] = fichaCache(db, n);
  return mapa;
}

function jogoComMarca(j, mapa) {
  const casa = (mapa && mapa[j.mandante]) || fichaCache({ fichas: {} }, j.mandante);
  const fora = (mapa && mapa[j.visitante]) || fichaCache({ fichas: {} }, j.visitante);
  const status = j.status || (j.placarMandante != null ? "encerrado" : "agendado");
  const escudoCasa = j.escudoCasa || casa.escudo || urlEscudo(j.mandante);
  const escudoFora = j.escudoFora || fora.escudo || urlEscudo(j.visitante);
  return {
    ...j,
    status,
    escudoCasa,
    escudoFora,
    escudoCasaFall: j.escudoCasaFall || marcaDoClube(j.mandante).logoFall,
    escudoForaFall: j.escudoForaFall || marcaDoClube(j.visitante).logoFall,
    fotoCasa: casa.foto || "",
    estadioNome: casa.estadio || ""
  };
}

function clubeNoJogo(j, nome) {
  return !!(j && nome && (nomeBate(j.mandante, nome) || nomeBate(j.visitante, nome)));
}

// Compara nomes de clubes por palavras inteiras: "Vasco da Gama" bate com "Vasco", mas "Internacional"
// não bate com "Inter" (antes bastava um nome conter o outro como pedaço de texto).
function nomeBate(a, b) {
  const limpa = (s) => normaliza(s).replace(/[-.]/g, " ").replace(/\s+/g, " ").trim();
  const x = limpa(a);
  const y = limpa(b);
  if (!x || !y) return false;
  return x === y || (" " + x + " ").includes(" " + y + " ") || (" " + y + " ").includes(" " + x + " ");
}

function mesmoPar(a, b) {
  return (nomeBate(a.mandante, b.mandante) && nomeBate(a.visitante, b.visitante))
    || (nomeBate(a.mandante, b.visitante) && nomeBate(a.visitante, b.mandante));
}

function nomesParecemJogo(ev, j) {
  const comps = ev.competitions && ev.competitions[0];
  const times = ((comps && comps.competitors) || []).map((c) => (c.team && (c.team.displayName || c.team.shortDisplayName)) || "");
  return times.some((t) => nomeBate(t, j.mandante)) && times.some((t) => nomeBate(t, j.visitante));
}

function jogosHojeMarcados(db) {
  return (db.jogos || []).filter((j) => j.data === hoje()).map((j) => jogoComMarca({ ...j, idJogo: idDoJogo(j) }, {
    [j.mandante]: fichaCache(db, j.mandante),
    [j.visitante]: fichaCache(db, j.visitante)
  }));
}

let placarMemo = { em: 0, eventos: [] };

const LIGAS_COBERTURA = [
  { espn: "bra.1", nome: "Brasileirão Série A", peso: 0 },
  { espn: "bra.copa_do_brasil", nome: "Copa do Brasil", peso: 0 },
  { espn: "conmebol.libertadores", nome: "Libertadores", peso: 1 },
  { espn: "conmebol.sudamericana", nome: "Sul-Americana", peso: 2 },
  { espn: "uefa.champions", nome: "Champions League", peso: 1 },
  { espn: "bra.2", nome: "Brasileirão Série B", peso: 3 },
  { espn: "uefa.europa", nome: "Liga Europa", peso: 4 },
  { espn: "eng.1", nome: "Premier League", peso: 3 },
  { espn: "esp.1", nome: "La Liga", peso: 3 },
  { espn: "ita.1", nome: "Serie A (Itália)", peso: 4 },
  { espn: "ger.1", nome: "Bundesliga", peso: 4 },
  { espn: "fra.1", nome: "Ligue 1", peso: 5 }
];

const NOMES_ESPN = {
  "sao paulo": "São Paulo",
  "atletico mineiro": "Atlético-MG",
  "athletico paranaense": "Athletico-PR",
  "atletico paranaense": "Athletico-PR",
  "red bull bragantino": "Bragantino",
  "vasco da gama": "Vasco",
  "gremio": "Grêmio",
  "vitoria": "Vitória",
  "ceara sc": "Ceará",
  "ceara": "Ceará",
  "sport recife": "Sport",
  "atletico goianiense": "Atlético-GO",
  "cuiaba": "Cuiabá",
  "criciuma": "Criciúma",
  "goias": "Goiás",
  "america mineiro": "América-MG",
  "sc internacional": "Internacional",
  "bayern munich": "Bayern de Munique",
  "paris saint-germain": "PSG",
  "inter milan": "Inter",
  "internazionale": "Inter",
  "ac milan": "Milan",
  "atletico madrid": "Atlético de Madrid",
  "tottenham hotspur": "Tottenham",
  "wolverhampton wanderers": "Wolves",
  "newcastle united": "Newcastle",
  "west ham united": "West Ham",
  "brighton & hove albion": "Brighton",
  "athletic club": "Athletic Bilbao",
  "olympique lyonnais": "Lyon",
  "olympique de marseille": "Marseille",
  "borussia monchengladbach": "Borussia Mönchengladbach",
  "sporting cp": "Sporting",
  "sl benfica": "Benfica",
  "fc porto": "Porto",
  "penarol": "Peñarol",
  "colo colo": "Colo-Colo",
  "cerro porteno": "Cerro Porteño"
};

function nomeClubePtBr(bruto) {
  const n = String(bruto || "").trim();
  if (!n) return "";
  const k = normaliza(n);
  if (NOMES_ESPN[k]) return NOMES_ESPN[k];
  return TIMES.find((t) => normaliza(t) === k) || n;
}

function statusEspn(ev) {
  const st = (ev && ev.status && ev.status.type) || {};
  if (st.completed || st.state === "post") return "encerrado";
  if (st.state === "in") return "ao vivo";
  return "agendado";
}

function minutoEspn(ev) {
  if (statusEspn(ev) !== "ao vivo") return "";
  const s = (ev && ev.status) || {};
  const clock = String(s.displayClock || "").trim();
  if (clock) return clock.endsWith("'") ? clock : clock + "'";
  return String((s.type && s.type.shortDetail) || "").trim();
}

function dataBrt(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function horarioBrt(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
}

function jogoDoEventoEspn(ev, liga) {
  const comps = ev && ev.competitions && ev.competitions[0];
  const casa = ((comps && comps.competitors) || []).find((c) => c.homeAway === "home");
  const fora = ((comps && comps.competitors) || []).find((c) => c.homeAway === "away");
  if (!casa || !fora || !casa.team || !fora.team) return null;
  const status = statusEspn(ev);
  const hm = numPlacar(casa);
  const aw = numPlacar(fora);
  const mandante = nomeClubePtBr(casa.team.displayName || casa.team.shortDisplayName);
  const visitante = nomeClubePtBr(fora.team.displayName || fora.team.shortDisplayName);
  const logoCasa = casa.team.logo || "";
  const logoFora = fora.team.logo || "";
  return {
    id: Number(ev.id) || 0,
    espnId: String(ev.id || ""),
    mandante,
    visitante,
    data: dataBrt(ev.date) || hoje(),
    horario: horarioBrt(ev.date),
    placarMandante: status === "agendado" ? null : hm,
    placarVisitante: status === "agendado" ? null : aw,
    status,
    minuto: minutoEspn(ev),
    competicao: (liga && liga.nome) || (ev.league && ev.league.name) || "",
    peso: liga ? liga.peso : 9,
    fonte: "espn",
    url: (ev.links && ev.links[0] && ev.links[0].href) || "",
    escudoCasa: urlEscudo(mandante, logoCasa),
    escudoFora: urlEscudo(visitante, logoFora),
    escudoCasaFall: marcaDoClube(mandante).logoFall,
    escudoForaFall: marcaDoClube(visitante).logoFall
  };
}

function ordemJogo(a, b) {
  const rank = (j) => j.status === "ao vivo" ? 0 : j.status === "agendado" ? 1 : 2;
  return rank(a) - rank(b)
    || (a.peso || 9) - (b.peso || 9)
    || String(a.horario || "").localeCompare(String(b.horario || ""));
}

function semearJogosDoDia(db, eventos) {
  const hojeStr = hoje();
  const novos = [];
  for (const { ev, liga } of eventos || []) {
    const j = jogoDoEventoEspn(ev, liga);
    if (!j || !j.id || j.data !== hojeStr) continue;
    if (novos.some((x) => x.espnId === j.espnId)) continue;
    novos.push(j);
  }
  if (!novos.length) return false;
  novos.sort(ordemJogo);
  const anteriores = (db.jogos || []).filter((j) => j.data === hojeStr && j.fonte !== "admin");
  const historico = (db.jogos || []).filter((j) => j.data && j.data < hojeStr).slice(-150);
  // jogos cadastrados pelo administrador (hoje ou futuros) nunca são apagados pela coleta automática
  const manuais = (db.jogos || []).filter((j) => j.fonte === "admin" && j.data >= hojeStr);
  db.jogos = historico.concat(manuais, novos);
  return JSON.stringify(anteriores) !== JSON.stringify(novos);
}

function extrasDoPlacar(eventos, oficiais) {
  const rank = (s) => s === "ao vivo" ? 0 : s === "agendado" ? 1 : 2;
  return (eventos || [])
    .map((e) => eventoEspnPublico(e.ev || e))
    .filter(Boolean)
    .filter(jogoAberto)
    .filter((e) => !(oficiais || []).some((j) => mesmoPar(e, j)))
    .sort((a, b) => rank(a.status) - rank(b.status) || String(a.horario || "").localeCompare(String(b.horario || "")))
    .slice(0, 16);
}

let placarEmCurso = null;

// Atualiza placares de hoje na ESPN. Chamadas simultâneas dividem a mesma consulta.
function atualizarPlacaresHoje(db, opcoes) {
  const maxIdade = opcoes && opcoes.maxIdadeMs != null ? opcoes.maxIdadeMs : 15000;
  if (Date.now() - placarMemo.em < maxIdade) return Promise.resolve({ db, extraEspn: placarMemo.eventos });
  if (!placarEmCurso) {
    placarEmCurso = coletarPlacaresHoje(db).finally(() => { placarEmCurso = null; });
  }
  return placarEmCurso;
}

// Para páginas de leitura: não faz o usuário esperar a ESPN, só pede uma atualização se os dados estiverem velhos.
function placaresEmSegundoPlano(maxIdadeMs) {
  if (Date.now() - placarMemo.em > (maxIdadeMs || 60000)) atualizarPlacaresHoje(load()).catch(() => {});
  return placarMemo.eventos;
}

// Há bola rolando (ou prestes a rolar)? Define o ritmo da coleta automática.
function haJogoAgora() {
  const agora = Date.now();
  return (load().jogos || []).some((j) => {
    if (j.data !== hoje() || j.concluido || j.status === "encerrado") return false;
    if (j.status === "ao vivo") return true;
    const [h, m] = String(j.horario || "").split(":").map(Number);
    if (!Number.isFinite(h)) return false;
    const [a, mes, d] = j.data.split("-").map(Number);
    const inicio = Date.UTC(a, mes - 1, d, h + 3, m || 0); // horário de Brasília (UTC-3) -> UTC
    return agora > inicio - 20 * 60 * 1000 && agora < inicio + 3.5 * 3600 * 1000;
  });
}

async function coletarPlacaresHoje(db) {
  const data = hoje().replace(/-/g, "");
  const listas = await Promise.all(LIGAS_COBERTURA.map((liga) =>
    httpJson("https://site.api.espn.com/apis/site/v2/sports/soccer/" + liga.espn + "/scoreboard?dates=" + data, 7000)
      .then((d) => ({ liga, eventos: (d && d.events) || [] }))
      .catch(() => ({ liga, eventos: [] }))
  ));
  const eventos = [];
  for (const { liga, eventos: evs } of listas) {
    for (const ev of evs) eventos.push({ ev, liga });
  }
  if (!eventos.length) {
    placarMemo = { em: Date.now(), eventos: placarMemo.eventos };
    return { db, extraEspn: placarMemo.eventos };
  }
  let mudou = semearJogosDoDia(db, eventos);
  for (const j of (db.jogos || []).filter((x) => x.data === hoje())) {
    const achado = eventos.find(({ ev }) => (j.espnId && String(ev.id) === j.espnId) || nomesParecemJogo(ev, j));
    if (!achado) continue;
    const novo = jogoDoEventoEspn(achado.ev, achado.liga);
    if (!novo) continue;
    const statusAntes = j.status;
    const golAntes = j.placarMandante + "x" + j.placarVisitante;
    for (const campo of ["status", "minuto", "placarMandante", "placarVisitante", "horario"]) {
      if (j[campo] !== novo[campo]) { j[campo] = novo[campo]; mudou = true; }
    }
    const golDepois = j.placarMandante + "x" + j.placarVisitante;
    if (golAntes !== golDepois && j.status !== "agendado") {
      avisarStream({ tipo: "gol", jogo: { id: j.id, mandante: j.mandante, visitante: j.visitante, placarMandante: j.placarMandante, placarVisitante: j.placarVisitante, minuto: j.minuto, competicao: j.competicao } });
    } else if (statusAntes !== j.status) {
      avisarStream({ tipo: "status", jogo: { id: j.id, mandante: j.mandante, visitante: j.visitante, status: j.status, minuto: j.minuto, competicao: j.competicao } });
    }
  }
  if (mudou) save(db);
  placarMemo = { em: Date.now(), eventos };
  return { db, extraEspn: eventos };
}

const CALENDARIO = path.join(DATA_DIR, "calendario.json");
const DIAS_DO_CALENDARIO = 12;
const CALENDARIO_VALIDADE_MS = 45 * 60 * 1000;
let calendarioMem = null;
let calendarioEmCurso = null;

function lerCalendario() {
  if (calendarioMem) return calendarioMem;
  try {
    calendarioMem = JSON.parse(fs.readFileSync(CALENDARIO, "utf8"));
  } catch {
    calendarioMem = { jogos: [], atualizadoEm: null };
  }
  return calendarioMem;
}

function jogosCalendario() {
  return lerCalendario().jogos || [];
}

function diaEspn(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d).replace(/-/g, "");
}

async function sincronizarCalendario(db, forcar) {
  const idade = Date.now() - new Date(lerCalendario().atualizadoEm || 0).getTime();
  if (!forcar && jogosCalendario().length && idade < CALENDARIO_VALIDADE_MS) return false;
  if (calendarioEmCurso) return calendarioEmCurso;
  calendarioEmCurso = puxarCalendario().finally(() => { calendarioEmCurso = null; });
  return calendarioEmCurso;
}

// A ESPN recusa intervalos de datas (erro 400), então o calendário é montado dia a dia.
async function puxarCalendario() {
  const dias = [];
  for (let i = 0; i < DIAS_DO_CALENDARIO; i++) {
    dias.push(diaEspn(new Date(Date.now() + i * 864e5)));
  }
  const listas = await Promise.all(LIGAS_COBERTURA.map(async (liga) => {
    const eventos = [];
    // ESPN às vezes zera no range; busca dia a dia
    for (const data of dias) {
      try {
        const d = await httpJson(
          "https://site.api.espn.com/apis/site/v2/sports/soccer/" + liga.espn + "/scoreboard?dates=" + data + "&limit=100",
          9000
        );
        for (const ev of ((d && d.events) || [])) eventos.push(ev);
      } catch {}
    }
    return { liga, eventos };
  }));
  const jogos = [];
  for (const { liga, eventos } of listas) {
    for (const ev of eventos) {
      const j = jogoDoEventoEspn(ev, liga);
      if (!j || !j.id || jogos.some((x) => x.espnId === j.espnId)) continue;
      jogos.push(j);
    }
  }
  console.log("[calendário] atualizado:", jogos.length, "jogos nos próximos " + DIAS_DO_CALENDARIO + " dias");
  if (!jogos.length) return false;
  jogos.sort((a, b) =>
    String(a.data).localeCompare(String(b.data))
    || String(a.horario || "").localeCompare(String(b.horario || ""))
    || (a.peso || 9) - (b.peso || 9));
  calendarioMem = { jogos, atualizadoEm: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(CALENDARIO), { recursive: true });
    fs.writeFileSync(CALENDARIO, JSON.stringify(calendarioMem));
  } catch {}
  return true;
}

function eventoEspnPublico(ev) {
  const comps = ev.competitions && ev.competitions[0];
  if (!comps) return null;
  const casa = comps.competitors.find((c) => c.homeAway === "home");
  const fora = comps.competitors.find((c) => c.homeAway === "away");
  if (!casa || !fora) return null;
  const status = statusEspn(ev);
  const mandante = nomeClubePtBr(casa.team.displayName || casa.team.shortDisplayName);
  const visitante = nomeClubePtBr(fora.team.displayName || fora.team.shortDisplayName);
  return {
    mandante,
    visitante,
    data: dataBrt(ev.date) || hoje(),
    horario: horarioBrt(ev.date),
    status,
    minuto: minutoEspn(ev),
    placarMandante: status === "agendado" ? null : numPlacar(casa),
    placarVisitante: status === "agendado" ? null : numPlacar(fora),
    competicao: (ev.league && ev.league.name) || (comps.notes && comps.notes[0] && comps.notes[0].headline) || "hoje",
    fonte: "espn",
    escudoCasa: urlEscudo(mandante, casa.team.logo),
    escudoFora: urlEscudo(visitante, fora.team.logo)
  };
}

function itensBuscaEspn(d) {
  if (!d) return [];
  const raw = d.items || d.results || [];
  const out = [];
  for (const i of raw) {
    if (i && (i.type === "team" || i.sport === "soccer")) out.push(i);
    for (const x of (i.contents || i.items || [])) {
      if (x && (x.type === "team" || x.sport === "soccer")) out.push(x);
    }
  }
  return out;
}

function numPlacar(comp) {
  if (!comp) return null;
  const s = comp.score;
  if (s == null || s === "") return null;
  if (typeof s === "number") return s;
  if (typeof s === "string") {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof s === "object") {
    const v = s.displayValue != null ? s.displayValue : s.value;
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function eventoParaJogo(ev) {
  const c = (ev.competitions || [])[0] || {};
  const comps = c.competitors || [];
  const home = comps.find((x) => x.homeAway === "home") || comps[0];
  const away = comps.find((x) => x.homeAway === "away") || comps[1];
  const dt = new Date(ev.date || c.date);
  if (Number.isNaN(dt.getTime())) return null;
  const data = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
  const horario = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(dt);
  const done = !!(c.status && c.status.type && c.status.type.completed);
  return {
    mandante: nomeClubePtBr(home && home.team && home.team.displayName),
    visitante: nomeClubePtBr(away && away.team && away.team.displayName),
    data,
    horario,
    placarMandante: done ? numPlacar(home) : null,
    placarVisitante: done ? numPlacar(away) : null,
    // o nome da competição vem da liga do evento; seasonType traz só a fase ("Quarterfinals")
    competicao: nomeDaLigaEspn(ev.league) || limpaCompeticao((ev.seasonType && (ev.seasonType.abbreviation || ev.seasonType.name)) || (ev.season && ev.season.displayName) || ""),
    local: (c.venue && c.venue.fullName) || "",
    concluido: done
  };
}

function nomeDaLigaEspn(liga) {
  if (!liga) return "";
  const conhecida = LIGAS_COBERTURA.find((l) => l.espn === liga.slug);
  return conhecida ? conhecida.nome : limpaCompeticao(liga.name || liga.shortName || "") || "";
}

// "2026 Brasileiro Serie A" -> "Brasileirão Série A"; "2026-27 LALIGA" -> "La Liga"
function limpaCompeticao(c) {
  const limpo = String(c || "")
    .replace(/^\d{4}(-\d{2,4})?\s+/, "")
    .replace(/Brasileiro Serie A|Brazilian Serie A|^Serie A$/i, "Brasileirão Série A")
    .replace(/Brasileiro Serie B|Brazilian Serie B|^Serie B$/i, "Brasileirão Série B")
    .replace(/LALIGA|Spanish La Liga/i, "La Liga")
    .replace(/English Premier League/i, "Premier League")
    .replace(/German Bundesliga/i, "Bundesliga")
    .replace(/Italian Serie A/i, "Serie A (Itália)")
    .replace(/French Ligue 1/i, "Ligue 1")
    .trim();
  return limpo || null;
}

function traduzSituacao(s) {
  if (!s) return "";
  return String(s)
    .replace(/(\d+)(?:st|nd|rd|th)/i, "$1º")
    .replace(/Spanish LALIGA/ig, "La Liga")
    .replace(/Spanish La Liga/ig, "La Liga")
    .replace(/Saudi-Arabian Pro League/ig, "Liga da Arábia Saudita")
    .replace(/English Premier League/ig, "Premier League")
    .replace(/German Bundesliga/ig, "Bundesliga")
    .replace(/Italian Serie A/ig, "Serie A italiana")
    .replace(/French Ligue 1/ig, "Ligue 1")
    .replace(/Brazilian Serie A|Brasileirão Série A/ig, "Brasileirão")
    .replace(/\bin\b/i, "na");
}

// Prefixo dos códigos de liga da ESPN (bra.1, esp.1...) por país. Serve para separar clubes homônimos:
// a busca por "Santos" devolve o do México antes do do Brasil.
const PREFIXO_ESPN = {
  "Brasil": "bra.", "Argentina": "arg.", "Uruguai": "uru.", "Chile": "chi.", "Colômbia": "col.", "Equador": "ecu.",
  "Paraguai": "par.", "Peru": "per.", "Bolívia": "bol.", "Venezuela": "ven.", "México": "mex.",
  "Estados Unidos": "usa.", "Canadá": "usa.", "Inglaterra": "eng.", "Espanha": "esp.", "Itália": "ita.",
  "Alemanha": "ger.", "França": "fra.", "Portugal": "por.", "Países Baixos": "ned.", "Bélgica": "bel.",
  "Turquia": "tur.", "Grécia": "gre.", "Escócia": "sco.", "Áustria": "aut.", "Dinamarca": "den.",
  "Suécia": "swe.", "Noruega": "nor.", "Arábia Saudita": "ksa.", "Japão": "jpn.", "China": "chn.",
  "Austrália": "aus.", "Índia": "ind.", "Costa Rica": "crc.", "Honduras": "hon.", "África do Sul": "rsa."
};

// Entre os resultados da busca da ESPN, escolhe o time principal do clube: nome igual, país certo,
// sem equipe de base nem feminina. Na dúvida mantém a ordem de relevância da própria ESPN.
function escolherTimeEspn(itens, nome) {
  const alvo = normaliza(nome);
  const clube = clubePorNome(nome);
  const prefixo = (clube && PREFIXO_ESPN[clube.pais]) || "";
  const validos = (itens || []).filter((x) => x && x.id
    && !/\bu-?\d{2}\b/i.test(x.displayName || "")
    && !/\.w\.|youth|u\d{2}/i.test(x.defaultLeagueSlug || ""));
  const nota = (x) => {
    const igual = normaliza(nomeClubePtBr(x.displayName)) === alvo;
    return (igual ? 4 : (nomeBate(x.displayName, nome) ? 2 : 0))
      + (prefixo && String(x.defaultLeagueSlug || "").startsWith(prefixo) ? 3 : 0);
  };
  const ordem = validos.map((x, i) => ({ x, i, p: nota(x) })).sort((a, b) => b.p - a.p || a.i - b.i);
  return ordem.length ? ordem[0].x : null;
}

async function puxarAgendaEspn(nome, db, cache) {
  const search = await httpJson("https://site.web.api.espn.com/apis/common/v3/search?query=" + encodeURIComponent(nome) + "&limit=10");
  const times = itensBuscaEspn(search).filter((x) => x.sport === "soccer" || x.label === "Soccer Team" || x.type === "team");
  const time = escolherTimeEspn(times, nome);
  if (!time || !time.id) return cache || null;

  // "all" junta todas as competições do clube. Sem parâmetro a ESPN devolve só os jogos já feitos
  // (e fora de ordem); os que faltam vêm com fixture=true.
  const base = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/" + time.id + "/schedule";
  const [feitos, proximos] = await Promise.all([httpJson(base, 9000), httpJson(base + "?fixture=true", 9000)]);
  const vistos = new Set();
  const jogos = [...((feitos && feitos.events) || []), ...((proximos && proximos.events) || [])]
    .filter((ev) => ev && !vistos.has(ev.id) && vistos.add(ev.id))
    .map(eventoParaJogo)
    .filter(Boolean)
    .sort((a, b) => (a.data + " " + a.horario).localeCompare(b.data + " " + b.horario));
  if (!jogos.length) return cache || null;
  const team = (feitos && feitos.team) || (proximos && proximos.team) || {};
  return {
    nome: time.displayName || team.displayName || nome,
    liga: time.defaultLeagueSlug || "",
    situacao: traduzSituacao(team.standingSummary || ""),
    record: team.recordSummary || "",
    jogos,
    via: "espn",
    puxadoEm: new Date().toISOString()
  };
}

function fixtureAfParaJogo(fx) {
  if (!fx || !fx.fixture || !fx.teams) return null;
  const dt = new Date(fx.fixture.date);
  if (Number.isNaN(dt.getTime())) return null;
  const data = new Intl.DateTimeFormat("en-CA", {
    timeZone: AF_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
  const horario = new Intl.DateTimeFormat("pt-BR", {
    timeZone: AF_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(dt);
  const short = String((fx.fixture.status && fx.fixture.status.short) || "");
  const done = /^(FT|AET|PEN)$/.test(short);
  const live = /^(1H|2H|HT|ET|BT|P|LIVE|INT)$/.test(short);
  const g = fx.goals || {};
  const temPlacar = (done || live) && g.home != null && g.away != null;
  const venue = (fx.fixture && fx.fixture.venue) || {};
  const local = [venue.name, venue.city].filter(Boolean).join(", ");
  return {
    mandante: nomeClubePtBr((fx.teams.home && fx.teams.home.name) || ""),
    visitante: nomeClubePtBr((fx.teams.away && fx.teams.away.name) || ""),
    data,
    horario,
    placarMandante: temPlacar ? Number(g.home) : null,
    placarVisitante: temPlacar ? Number(g.away) : null,
    competicao: traduzSituacao((fx.league && fx.league.name) || "") || (fx.league && fx.league.name) || null,
    concluido: done,
    status: done ? "encerrado" : (live ? "ao vivo" : "agendado"),
    fixtureId: fx.fixture.id,
    local,
    escudoCasa: (fx.teams.home && fx.teams.home.logo) || "",
    escudoFora: (fx.teams.away && fx.teams.away.logo) || ""
  };
}

async function buscarTemporadaAtual(idTime) {
  if (!idTime || !apiFootballLigada()) return null;
  if (Object.prototype.hasOwnProperty.call(cacheTemporadaAf, "t" + idTime)) {
    return cacheTemporadaAf["t" + idTime];
  }
  const d = await afJson("/leagues", { team: idTime, current: "true" });
  let year = null;
  for (const liga of (d && d.response) || []) {
    const seasons = (liga && liga.seasons) || [];
    const cur = seasons.find((s) => s.current);
    if (cur && cur.year) {
      year = cur.year;
      break;
    }
  }
  cacheTemporadaAf["t" + idTime] = year;
  return year;
}

async function buscarTemporadaLiga(afId) {
  if (!afId || !apiFootballLigada()) return null;
  const chave = "l" + afId;
  if (Object.prototype.hasOwnProperty.call(cacheTemporadaAf, chave)) return cacheTemporadaAf[chave];
  const d = await afJson("/leagues", { id: afId, current: "true" });
  const seasons = (d && d.response && d.response[0] && d.response[0].seasons) || [];
  const cur = seasons.find((s) => s.current);
  const year = (cur && cur.year) || null;
  cacheTemporadaAf[chave] = year;
  return year;
}

async function buscarFixturesAf(idTime, tipo, n, season) {
  const params = { team: idTime, timezone: AF_TZ };
  params[tipo] = n;
  if (season) params.season = season;
  const d = await afJson("/fixtures", params);
  return (d && d.response) || [];
}

async function puxarAgendaApiFootball(nome, idApiFootball) {
  if (!apiFootballLigada()) return null;
  let id = idApiFootball;
  let meta = null;
  if (!id) {
    meta = await buscarTimeApiFootball(nome);
    id = meta && meta.idApiFootball;
  }
  if (!id) return null;
  const season = await buscarTemporadaAtual(id);
  let prox = await buscarFixturesAf(id, "next", 5, season);
  let ult = await buscarFixturesAf(id, "last", 5, season);
  if (!prox.length && !ult.length && season) {
    prox = await buscarFixturesAf(id, "next", 5, null);
    ult = await buscarFixturesAf(id, "last", 5, null);
  }
  const jogos = [];
  for (const fx of ult) {
    const j = fixtureAfParaJogo(fx);
    if (j) jogos.push(j);
  }
  for (const fx of prox) {
    const j = fixtureAfParaJogo(fx);
    if (j) jogos.push(j);
  }
  if (!jogos.length) return null;
  const amostra = prox[0] || ult[0];
  const ligaNome = (amostra && amostra.league && amostra.league.name) || (meta && meta.liga) || "";
  return {
    nome: (meta && meta.nome) || nome,
    liga: ligaNome,
    situacao: traduzSituacao(ligaNome),
    record: "",
    jogos,
    via: "api-football",
    idApiFootball: id,
    puxadoEm: new Date().toISOString()
  };
}

function pctNum(s) {
  const n = Number(String(s == null ? "" : s).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}

function letrasFormaAf(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^WDLVE]/g, "")
    .split("")
    .map((c) => (c === "W" ? "V" : c))
    .filter((c) => /[VDE]/.test(c))
    .slice(0, 5);
}

function traduzConselho(s) {
  return String(s || "")
    .replace(/Double chance:\s*/ig, "Chance dupla: ")
    .replace(/Combination\s*/ig, "Combinação: ")
    .replace(/Winner:\s*/ig, "Vence: ")
    .replace(/\bor draw\b/ig, " ou empate")
    .replace(/\bdraw\b/ig, "empate")
    .replace(/\bover\b/ig, "acima de")
    .replace(/\bunder\b/ig, "abaixo de");
}

function parsePredicao(raw) {
  if (!raw) return null;
  const p = raw.predictions || {};
  const percent = p.percent || {};
  const casa = pctNum(percent.home);
  const empate = pctNum(percent.draw);
  const fora = pctNum(percent.away);
  const teams = raw.teams || {};
  const lastCasa = (teams.home && (teams.home.last_5 || (teams.home.league && teams.home.league.last_5))) || {};
  const lastFora = (teams.away && (teams.away.last_5 || (teams.away.league && teams.away.league.last_5))) || {};
  const comparacao = raw.comparison || {};
  return {
    vencedor: (p.winner && p.winner.name) || "",
    conselho: traduzConselho(p.advice || ""),
    chances: casa != null && fora != null
      ? { casa, empate: empate != null ? empate : Math.max(0, 100 - casa - fora), fora }
      : null,
    formaCasa: lastCasa.form || (comparacao.form && comparacao.form.home) || "",
    formaFora: lastFora.form || (comparacao.form && comparacao.form.away) || "",
    letrasCasa: letrasFormaAf(lastCasa.form),
    letrasFora: letrasFormaAf(lastFora.form)
  };
}

async function buscarPredicaoAf(fixtureId) {
  if (!fixtureId || !apiFootballLigada()) return null;
  const db = load();
  db.predicoes = db.predicoes || {};
  const cache = db.predicoes[String(fixtureId)];
  if (cache && Date.now() - new Date(cache.puxadoEm || 0).getTime() < 6 * 60 * 60 * 1000) return cache;
  const d = await afJson("/predictions", { fixture: fixtureId });
  const parsed = parsePredicao(d && d.response && d.response[0]);
  if (!parsed) return cache || null;
  parsed.fixtureId = fixtureId;
  parsed.puxadoEm = new Date().toISOString();
  db.predicoes[String(fixtureId)] = parsed;
  save(db);
  return parsed;
}

async function resolverFixtureAf(jogo, db) {
  if (!jogo) return null;
  if (jogo.fixtureId) return jogo;
  const juntar = (base, achado) => Object.assign({}, base, achado, {
    mandante: base.mandante,
    visitante: base.visitante,
    competicao: base.competicao || achado.competicao
  });
  const agenda = await puxarAgendaApiFootball(jogo.mandante, null);
  const lista = (agenda && agenda.jogos) || [];
  const hit = lista.find((j) => mesmoPar(j, jogo));
  if (hit) return juntar(jogo, hit);
  const casa = await buscarTimeApiFootball(jogo.mandante);
  if (!casa || !jogo.data) return jogo;
  const d = await afJson("/fixtures", { team: casa.idApiFootball, date: jogo.data, timezone: AF_TZ });
  const fx = ((d && d.response) || []).find((item) => {
    const j = fixtureAfParaJogo(item);
    return j && mesmoPar(j, jogo);
  }) || ((d && d.response) || [])[0];
  const extra = fixtureAfParaJogo(fx);
  return extra ? juntar(jogo, extra) : jogo;
}

async function proximoJogoAf(nome, idApiFootball) {
  const agenda = await puxarAgendaApiFootball(nome, idApiFootball);
  if (!agenda) return null;
  const jogos = (agenda.jogos || []).filter((j) => clubeNoJogo(j, nome) || clubeNoJogo(j, agenda.nome));
  const hojeStr = hoje();
  const deHoje = jogos.find((j) => j.data === hojeStr);
  if (deHoje) return deHoje;
  const futuros = jogos
    .filter((j) => !j.concluido)
    .slice()
    .sort((a, b) => (a.data + (a.horario || "")).localeCompare(b.data + (b.horario || "")));
  return futuros[0] || null;
}


async function puxarAgendaExterna(nome, db, idTeam, idApiFootball) {
  const chave = normaliza(nome);
  if (!chave) return null;
  db.agendaExterna = db.agendaExterna || {};
  const cache = db.agendaExterna[chave];
  // O cache vale 3 horas, venha de onde vier. Antes só valia se tivesse vindo da API-Football; no plano grátis ela não
  // entrega a temporada atual, então o cache da ESPN nunca "valia" e cada pergunta refazia as três consultas (1 a 2 s cada).
  const fresco = cache && Date.now() - new Date(cache.puxadoEm).getTime() < 3 * 60 * 60 * 1000;
  if (fresco) return cache;

  const af = await puxarAgendaApiFootball(nome, idApiFootball);
  if (af && (af.jogos || []).length) {
    db.agendaExterna[chave] = af;
    if (normaliza(af.nome) !== chave) db.agendaExterna[normaliza(af.nome)] = af;
    save(db);
    return af;
  }

  let meta = idTeam ? { idTeam, nome, liga: cache && cache.liga } : null;
  if (!meta || !meta.idTeam) {
    const d = await httpJson(sportsdbBase() + "/searchteams.php?t=" + encodeURIComponent(nome), 5000);
    const escolhido = escolherTimeSportsdb(d && d.teams, nome);
    if (timeSportsdbBom(escolhido)) {
      meta = { idTeam: escolhido.idTeam, nome: escolhido.strTeam, liga: escolhido.strLeague || "" };
    }
  }
  if (!meta || !meta.idTeam) {
    const espn = await puxarAgendaEspn(nome, db, cache);
    if (espn) {
      db.agendaExterna[chave] = espn;
      if (normaliza(espn.nome) !== chave) db.agendaExterna[normaliza(espn.nome)] = espn;
      save(db);
    }
    return espn || cache || null;
  }

  const [prox, ult] = await Promise.all([
    httpJson(sportsdbBase() + "/eventsnext.php?id=" + meta.idTeam, 5000),
    httpJson(sportsdbBase() + "/eventslast.php?id=" + meta.idTeam, 5000)
  ]);
  const jogos = [];
  for (const ev of listaEventos(ult)) {
    const j = eventoSportsdbParaJogo(ev, true);
    if (j) jogos.push(j);
  }
  for (const ev of listaEventos(prox)) {
    const j = eventoSportsdbParaJogo(ev, false);
    if (j) jogos.push(j);
  }

  let pacote = {
    nome: meta.nome,
    liga: meta.liga || "",
    situacao: traduzSituacao(meta.liga || ""),
    record: "",
    jogos,
    via: "sportsdb",
    puxadoEm: new Date().toISOString()
  };

  if (!jogos.length) {
    const espn = await puxarAgendaEspn(meta.nome, db, cache);
    if (espn) pacote = { ...espn, nome: meta.nome, situacao: espn.situacao || pacote.situacao, via: "espn" };
  }

  db.agendaExterna[chave] = pacote;
  if (normaliza(pacote.nome) !== chave) db.agendaExterna[normaliza(pacote.nome)] = pacote;
  save(db);
  return pacote;
}

function falaExterna(pacote, soHoje) {
  if (!pacote) return null;
  const hojeStr = hoje();
  const jogos = pacote.jogos || [];
  const deHoje = jogos.filter((j) => j.data === hojeStr);
  const futuros = jogos.filter((j) => !j.concluido).slice().sort((a, b) => (a.data + a.horario) > (b.data + b.horario) ? 1 : -1);
  if (deHoje.length) return `${pacote.nome} hoje: ${deHoje.map(linhaJogo).join(" · ")}`;
  const prox = futuros.find((j) => j.data >= hojeStr);
  if (soHoje) {
    return prox
      ? `${pacote.nome} não joga hoje. Próximo: ${linhaJogo(prox)}`
      : `${pacote.nome} não joga hoje.`;
  }
  if (prox) return `${pacote.nome}: ${linhaJogo(prox)}`;
  const ultimo = jogos.filter((j) => j.concluido).slice().sort((a, b) => (a.data + a.horario) < (b.data + b.horario) ? 1 : -1)[0];
  if (ultimo) return `${pacote.nome}, último: ${linhaJogo(ultimo)}`;
  return `Não achei jogo do ${pacote.nome}.`;
}

async function puxarJogosLiga(liga, db) {
  if (!liga) return [];
  db.agendaLiga = db.agendaLiga || {};
  const cacheKey = liga.afId ? "afv3n-" + liga.afId : String(liga.id);
  const cache = db.agendaLiga[cacheKey];
  if (cache && Date.now() - new Date(cache.puxadoEm).getTime() < 3 * 60 * 60 * 1000) {
    return filtrarJogosLiga(liga, cache.jogos || []);
  }

  let jogos = [];
  if (apiFootballLigada() && liga.afId) {
    const season = await buscarTemporadaLiga(liga.afId);
    const hojeStr = hoje();
    const fim = new Intl.DateTimeFormat("en-CA", {
      timeZone: AF_TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date(Date.now() + 21 * 864e5));
    const params = { league: liga.afId, from: hojeStr, to: fim, timezone: AF_TZ };
    if (season) params.season = season;
    const d = await afJson("/fixtures", params);
    jogos = ((d && d.response) || []).map(fixtureAfParaJogo).filter(Boolean).filter(jogoAberto);
  }
  if (!jogos.length && liga.id) {
    const d = await httpJson(sportsdbBase() + "/eventsnextleague.php?id=" + liga.id, 6000);
    jogos = listaEventos(d).map((ev) => eventoSportsdbParaJogo(ev, false)).filter(Boolean);
  }
  db.agendaLiga[cacheKey] = { jogos, puxadoEm: new Date().toISOString() };
  save(db);
  return filtrarJogosLiga(liga, jogos);
}

function filtrarJogosLiga(liga, jogos) {
  return (jogos || []).filter((j) => {
    const c = normaliza(j.competicao || "");
    if (/swedish|superettan|allsvenskan|sweden/.test(c)) return false;
    if (liga && liga.afId === 73) {
      return TIMES.some((t) => clubeNoJogo(j, t)) || /copa do brasil|copa brasil/.test(c);
    }
    if (liga && liga.local) {
      return TIMES.some((t) => clubeNoJogo(j, t)) || /serie a|brasileir/.test(c);
    }
    if (liga && liga.afId === 13) return !c || /liberta/.test(c);
    return true;
  });
}

function chaveParData(j) {
  return normaliza(j.mandante) + "|" + normaliza(j.visitante) + "|" + String(j.data || "");
}

function idDoJogo(j) {
  if (!j) return "";
  return String(j.espnId || chaveParData(j));
}

function universoJogos(db) {
  const mapa = new Map();
  for (const j of [...(db && db.jogos || []), ...jogosCalendario()]) {
    if (!j || !j.mandante) continue;
    const id = idDoJogo(j);
    const velho = mapa.get(id) || {};
    mapa.set(id, { ...velho, ...j, idJogo: id });
  }
  return [...mapa.values()];
}

// Resultados recentes de cada clube vindos da agenda dele (ver resultadosEmSegundoPlano). Servem para abrir
// a página de um jogo que já saiu da janela do calendário, como os links de "Últimos do clube".
function resultadosGuardados(db) {
  const saida = [];
  for (const r of Object.values((db.meta && db.meta.resultados) || {})) {
    if (r && r.v === RESULTADOS_VERSAO) saida.push(...(r.jogos || []));
  }
  return saida;
}

function acharJogoPorId(db, bruto) {
  let id = "";
  try { id = decodeURIComponent(String(bruto || "")).trim(); } catch { return null; }
  if (!id) return null;
  const todos = universoJogos(db);
  const direto = todos.find((j) => idDoJogo(j) === id);
  if (direto) return direto;
  const guardado = resultadosGuardados(db).find((j) => chaveParData(j) === id);
  if (guardado) return { ...guardado, status: "encerrado", idJogo: id };
  const partes = id.split("|");
  if (partes.length >= 3) {
    return todos.find((j) => chaveParData(j) === id)
      || todos.find((j) => normaliza(j.mandante) === partes[0] && normaliza(j.visitante) === partes[1] && String(j.data) === partes[2]);
  }
  return todos.find((j) => String(j.id) === id) || null;
}

function letraDoJogo(j, time) {
  if (!j || j.placarMandante == null) return "";
  const casa = nomeBate(j.mandante, time);
  const gf = casa ? j.placarMandante : j.placarVisitante;
  const gs = casa ? j.placarVisitante : j.placarMandante;
  return gf > gs ? "V" : gf < gs ? "D" : "E";
}

// Resultados recentes de um clube vindos da agenda dele na ESPN (sem gastar cota da API-Football).
// O banco só guarda jogos que o servidor viu acontecer; sem isso, quem abre o site depois de uns dias
// ficava com "Últimos jogos" vazio.
const RESULTADOS_VALIDADE_MS = 3 * 60 * 60 * 1000;
// muda quando a forma de buscar muda: resultados gravados por versões antigas (clube errado, fora de ordem) são ignorados
const RESULTADOS_VERSAO = 2;
const resultadosEmCurso = new Map();

function resultadosEmSegundoPlano(time) {
  const chave = normaliza(time);
  if (!chave) return;
  const meta = load().meta;
  if (!meta.resultados) meta.resultados = {};
  const c = meta.resultados[chave];
  if (c && c.v === RESULTADOS_VERSAO && Date.now() - Date.parse(c.puxadoEm || 0) < RESULTADOS_VALIDADE_MS) return;
  if (resultadosEmCurso.has(chave)) return;
  const tarefa = (async () => {
    const pacote = await puxarAgendaEspn(time, load(), null);
    // sem pacote (ESPN fora do ar) não grava nada: o que já existe continua valendo
    if (!pacote) return;
    // a agenda já vem em ordem de data; ficam os 8 resultados mais recentes
    const jogos = (pacote.jogos || [])
      .filter((j) => j.concluido && j.placarMandante != null && clubeNoJogo(j, time))
      .slice(-8);
    meta.resultados[chave] = { v: RESULTADOS_VERSAO, puxadoEm: new Date().toISOString(), jogos };
    save();
  })().catch(() => {}).finally(() => resultadosEmCurso.delete(chave));
  resultadosEmCurso.set(chave, tarefa);
}

function ultimosDoTime(db, time, n) {
  if (!time) return [];
  const hojeStr = hoje();
  const guardado = ((db.meta || {}).resultados || {})[normaliza(time)];
  const guardados = (guardado && guardado.v === RESULTADOS_VERSAO && guardado.jogos) || [];
  const base = universoJogos(db);
  const pool = base.concat(guardados.filter((g) => !base.some((j) => j.data === g.data && mesmoPar(j, g))));
  return pool
    .filter((j) => clubeNoJogo(j, time) && j.placarMandante != null && String(j.data || "") <= hojeStr)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.horario || "").localeCompare(String(a.horario || "")))
    .slice(0, n || 5)
    .map((j) => {
      const m = jogoComMarca(j, {
        [j.mandante]: fichaCache(db, j.mandante),
        [j.visitante]: fichaCache(db, j.visitante)
      });
      return { ...m, idJogo: idDoJogo(j), letra: letraDoJogo(j, time) };
    });
}

function noticiasDoConfronto(db, jogo) {
  if (!jogo) return [];
  const a = normaliza(jogo.mandante);
  const b = normaliza(jogo.visitante);
  return (db.noticias || []).filter((n) => {
    const t = normaliza((n.titulo || "") + " " + (n.resumo || "") + " " + (n.time || ""));
    return (a && t.includes(a)) || (b && t.includes(b)) || n.time === jogo.mandante || n.time === jogo.visitante;
  }).slice(0, 8).map((n) => {
    const f = metaFonte(n.fonte, n.time);
    return { ...n, fonteNome: f.nome, url: n.url || f.url, escudo: n.time ? urlEscudo(n.time) : "" };
  });
}

// Memória curta da conversa (para entender "e o próximo?"). Contas guardam em disco; visitantes só na
// memória, cada navegador com o seu código, e a conversa expira em um dia. Antes todos os visitantes
// dividiam o mesmo histórico.
const CHATS_ARQ = path.join(DATA_DIR, "chats.json");
const HIST_MAX = 8;
const HIST_VALIDADE_MS = 24 * 60 * 60 * 1000;
const MAX_VISITANTES_NO_CHAT = 500;
let chatsMem = null;
let chatsTimer = null;
const chatsVisitantes = new Map();

function loadChats() {
  if (chatsMem) return chatsMem;
  let bruto = {};
  try { bruto = JSON.parse(fs.readFileSync(CHATS_ARQ, "utf8")) || {}; } catch { bruto = {}; }
  chatsMem = {};
  for (const [chave, lista] of Object.entries(bruto)) {
    // formato antigo: "<id>|<nome>|<time>"
    const id = chave.includes("|") ? chave.split("|")[0] : chave.replace(/^u/, "");
    if (/^\d+$/.test(id) && Array.isArray(lista)) chatsMem["u" + id] = lista.slice(-HIST_MAX);
  }
  return chatsMem;
}

function saveChats() {
  if (chatsTimer) return;
  chatsTimer = setTimeout(() => {
    chatsTimer = null;
    try {
      fs.mkdirSync(path.dirname(CHATS_ARQ), { recursive: true });
      fs.writeFileSync(CHATS_ARQ, JSON.stringify(chatsMem));
    } catch { /* disco cheio ou pasta travada */ }
  }, 1000);
}

function histDo(eu) {
  if (eu.autenticado) return loadChats()["u" + eu.id] || [];
  const e = eu.cliente && chatsVisitantes.get(eu.cliente);
  return e && Date.now() - e.em < HIST_VALIDADE_MS ? e.lista : [];
}

function gravarHist(eu, pergunta, resposta, extra) {
  const item = {
    pergunta: String(pergunta || "").slice(0, 300),
    resposta: String(resposta || "").slice(0, 800),
    jogo: extra && extra.jogo ? extra.jogo : null,
    em: Date.now()
  };
  if (eu.autenticado) {
    const todos = loadChats();
    const chave = "u" + eu.id;
    todos[chave] = (todos[chave] || []).concat([item]).slice(-HIST_MAX);
    saveChats();
    return todos[chave];
  }
  if (!eu.cliente) return [item];
  const lista = histDo(eu).concat([item]).slice(-HIST_MAX);
  chatsVisitantes.delete(eu.cliente);
  chatsVisitantes.set(eu.cliente, { lista, em: Date.now() });
  while (chatsVisitantes.size > MAX_VISITANTES_NO_CHAT) chatsVisitantes.delete(chatsVisitantes.keys().next().value);
  return lista;
}

function pareceContinuacao(pergunta) {
  const n = normaliza(pergunta);
  if (!n) return false;
  if (timesCitados(pergunta).length) return false;
  const palavras = n.split(/\s+/).filter(Boolean);
  return /^(e |e o |e a |e os |e as )/.test(n)
    || /^(o proximo|e o proximo|proximo|e quando|quando|e quem|quem ganha|e ele|e ela|desse|dessa|esse|essa|e agora|e o jogo|e a tabela|e ontem|e o ultimo)\b/.test(n)
    || (palavras.length <= 4 && /^(quando|quem|onde|como|e|eae)\b/.test(n));
}

function perguntaComMemoria(pergunta, hist) {
  if (!hist.length || !pareceContinuacao(pergunta)) return pergunta;
  const ultima = hist[hist.length - 1];
  const daPergunta = timesCitados(ultima.pergunta || "");
  const daResposta = timesCitados(ultima.resposta || "");
  const times = daPergunta.length ? daPergunta : daResposta.slice(0, 2);
  if (!times.length) return pergunta + " (continua a conversa anterior)";
  const sobre = times.length >= 2 && !daPergunta.length ? times[0] + " x " + times[1] : times[0];
  const n = normaliza(pergunta);
  if (/\bproximo\b/.test(n)) {
    const ja = ultima.jogo || String(ultima.resposta || "").split("\n")[0].slice(0, 140);
    return pergunta + " (sobre " + sobre + "; quero o JOGO SEGUINTE, não este: " + ja + ")";
  }
  return pergunta + " (sobre " + sobre + ")";
}

function buscaGeral(db, eu, q) {
  const n = normaliza(q);
  if (!n || n.length < 2) return { jogos: [], noticias: [], clubes: [] };
  const clubes = TIMES.filter((t) => normaliza(t).includes(n) || n.includes(normaliza(t))).slice(0, 8)
    .map((t) => ({ nome: t, escudo: urlEscudo(t) }));
  const jogos = universoJogos(db)
    .filter((j) => {
      const t = normaliza(j.mandante + " " + j.visitante + " " + (j.competicao || ""));
      return t.includes(n) || n.includes(normaliza(j.mandante)) || n.includes(normaliza(j.visitante));
    })
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(0, 8)
    .map((j) => jogoComMarca({ ...j, idJogo: idDoJogo(j) }, {
      [j.mandante]: fichaCache(db, j.mandante),
      [j.visitante]: fichaCache(db, j.visitante)
    }));
  const noticias = (db.noticias || []).filter((x) =>
    normaliza((x.titulo || "") + " " + (x.resumo || "") + " " + (x.time || "")).includes(n)
  ).slice(0, 6).map((x) => {
    const f = metaFonte(x.fonte, x.time);
    return { id: x.id, titulo: x.titulo, url: x.url || f.url, fonteNome: f.nome, imagem: x.imagem || "", time: x.time };
  });
  return { jogos, noticias, clubes, q };
}

function marcarAgenda(db, j, eu, grupo) {
  const m = jogoComMarca(j, {
    [j.mandante]: fichaCache(db, j.mandante),
    [j.visitante]: fichaCache(db, j.visitante)
  });
  m.grupo = grupo;
  m.quente = !!(eu && (clubeNoJogo(j, eu.time) || clubeNoJogo(j, eu.feedTime)));
  m.idJogo = idDoJogo(j);
  return m;
}

const GRUPOS_AGENDA = [
  { id: "bra", nome: "Brasileirão", competicoes: ["Brasileirão Série A", "Brasileirão Série B", "Paulistão"] },
  { id: "copa", nome: "Copa do Brasil", competicoes: ["Copa do Brasil"] },
  { id: "liberta", nome: "Libertadores", competicoes: ["Libertadores"] },
  { id: "sula", nome: "Sul-Americana", competicoes: ["Sul-Americana"] },
  { id: "sulam", nome: "América do Sul", competicoes: ["Liga Argentina", "Primera División (Chile)", "Primera División (Peru)"] },
  { id: "champions", nome: "Champions League", competicoes: ["Champions League"] },
  { id: "europa_liga", nome: "Liga Europa", competicoes: ["Liga Europa", "Conference League"] },
  { id: "europa", nome: "Ligas da Europa", competicoes: ["Premier League", "Championship", "La Liga", "La Liga 2", "Serie A (Itália)", "Bundesliga", "Ligue 1", "Primeira Liga", "Eredivisie", "Süper Lig"] },
  { id: "mundo", nome: "Mundo", competicoes: ["MLS", "Liga MX", "Liga da Arábia Saudita", "J1 League"] }
];

function grupoDoJogo(j) {
  const c = String(j.competicao || "");
  const g = GRUPOS_AGENDA.find((x) => x.competicoes.includes(c));
  if (g) return g.id;
  const n = normaliza(c);
  if (/brasileir|serie a|serie b|paulista/.test(n)) return "bra";
  if (/copa do brasil/.test(n)) return "copa";
  if (/libertadores/.test(n)) return "liberta";
  if (/sul.?americana|sudamericana/.test(n)) return "sula";
  if (/argentin|chile|peru|colombia|uruguay|mexi|liga mx|\bmls\b/.test(n)) return n.includes("mls") || n.includes("liga mx") || n.includes("mexi") ? "mundo" : "sulam";
  if (/champions|uefa champions/.test(n)) return "champions";
  if (/liga europa|europa league|uefa europa|conference/.test(n)) return "europa_liga";
  if (/premier|championship|la liga|bundesliga|ligue 1|serie a \(italia\)|serie a italiana|primeira liga|eredivisie|super lig|s[uü]per lig/.test(n)) return "europa";
  if (/arabia|saudi|j1|japon|mls|liga mx/.test(n)) return "mundo";
  return "outros";
}

function jogoAberto(j) {
  if (!j) return false;
  const st = String(j.status || "").toLowerCase();
  if (j.concluido || st === "encerrado" || st === "final" || st === "ft" || st === "post") return false;
  if (st === "ao vivo" || st === "ao-vivo" || st === "live") return true;
  if (j.placarMandante != null && j.placarVisitante != null && st !== "agendado") return false;
  return true;
}

// Catálogo da API-Football tem 1000+ ligas; no plano grátis (≈100 req/dia) a gente
// puxa as principais do Brasil, CONMEBOL, UEFA e outras que a torcida mais busca.
const LIGAS_AF_AGENDA = [
  { afId: 71, competicao: "Brasileirão Série A" },
  { afId: 72, competicao: "Brasileirão Série B" },
  { afId: 73, competicao: "Copa do Brasil" },
  { afId: 475, competicao: "Paulistão" },
  { afId: 13, competicao: "Libertadores" },
  { afId: 11, competicao: "Sul-Americana" },
  { afId: 128, competicao: "Liga Argentina" },
  { afId: 265, competicao: "Primera División (Chile)" },
  { afId: 281, competicao: "Primera División (Peru)" },
  { afId: 2, competicao: "Champions League" },
  { afId: 3, competicao: "Liga Europa" },
  { afId: 848, competicao: "Conference League" },
  { afId: 39, competicao: "Premier League" },
  { afId: 40, competicao: "Championship" },
  { afId: 140, competicao: "La Liga" },
  { afId: 141, competicao: "La Liga 2" },
  { afId: 135, competicao: "Serie A (Itália)" },
  { afId: 78, competicao: "Bundesliga" },
  { afId: 61, competicao: "Ligue 1" },
  { afId: 94, competicao: "Primeira Liga" },
  { afId: 88, competicao: "Eredivisie" },
  { afId: 203, competicao: "Süper Lig" },
  { afId: 253, competicao: "MLS" },
  { afId: 262, competicao: "Liga MX" },
  { afId: 307, competicao: "Liga da Arábia Saudita" },
  { afId: 98, competicao: "J1 League" }
];

async function jogosProximosAf() {
  if (!apiFootballLigada() || !afPodeChamar()) return [];
  const hojeStr = hoje();
  const fim = new Date(Date.now() + 14 * 864e5);
  const ate = new Intl.DateTimeFormat("en-CA", {
    timeZone: AF_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(fim);
  const out = [];
  const visto = new Set();
  await Promise.all(LIGAS_AF_AGENDA.map(async (liga) => {
    try {
      const season = await buscarTemporadaLiga(liga.afId);
      const params = { league: liga.afId, from: hojeStr, to: ate, timezone: AF_TZ };
      if (season) params.season = season;
      const d = await afJson("/fixtures", params);
      for (const fx of ((d && d.response) || [])) {
        const j = fixtureAfParaJogo(fx);
        if (!j || !jogoAberto(j)) continue;
        if (!j.competicao) j.competicao = liga.competicao;
        else if (/serie a|brasileir/i.test(j.competicao) && liga.competicao.includes("Brasileirão")) j.competicao = liga.competicao;
        const k = String(j.fixtureId || chaveParData(j));
        if (visto.has(k)) continue;
        visto.add(k);
        out.push(j);
      }
    } catch {}
  }));
  return out;
}

/* ---------------------------------------------------------------- football-data.org (v4) */
function footballDataKey() {
  return String(process.env.FOOTBALL_DATA_KEY || "").trim();
}

function footballDataLigada() {
  return !!footballDataKey();
}

// Plano Free (TIER_ONE): ~10 req/min. Códigos liberados no cadastro.
const FD_COMPETICOES = {
  BSA: "Brasileirão Série A",
  PL: "Premier League",
  ELC: "Championship",
  PD: "La Liga",
  SA: "Serie A (Itália)",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
  DED: "Eredivisie",
  PPL: "Primeira Liga",
  CL: "Champions League"
};
const FD_CODES = ["BSA", "PL", "PD", "SA", "BL1", "FL1"];
const fdCache = new Map();
let fdListaMemo = { em: 0, jogos: [] };
let fdEmCurso = null;

async function fdJson(caminho, params) {
  if (!footballDataLigada()) return null;
  const chave = caminho + "?" + JSON.stringify(params || {});
  const guardado = fdCache.get(chave);
  if (guardado && Date.now() - guardado.em < 30 * 60 * 1000) return guardado.d;
  const u = new URL("https://api.football-data.org/v4" + caminho);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  });
  const d = await httpJson(u.toString(), 10000, { "X-Auth-Token": footballDataKey() });
  if (d) fdCache.set(chave, { em: Date.now(), d });
  return d;
}

function statusFootballData(st) {
  const s = String(st || "").toUpperCase();
  if (s === "IN_PLAY" || s === "PAUSED" || s === "LIVE") return "ao vivo";
  if (s === "FINISHED" || s === "AWARDED") return "encerrado";
  if (s === "POSTPONED" || s === "CANCELLED" || s === "SUSPENDED") return "encerrado";
  return "agendado";
}

function matchFdParaJogo(m, codeHint) {
  if (!m || !m.homeTeam || !m.awayTeam) return null;
  const mandante = nomeClubePtBr(m.homeTeam.shortName || m.homeTeam.name || "");
  const visitante = nomeClubePtBr(m.awayTeam.shortName || m.awayTeam.name || "");
  if (!mandante || !visitante) return null;
  const status = statusFootballData(m.status);
  const code = (m.competition && m.competition.code) || codeHint || "";
  const competicao = FD_COMPETICOES[code] || (m.competition && m.competition.name) || "Futebol";
  const full = m.score && m.score.fullTime;
  const placarOk = status !== "agendado" && full && full.home != null && full.away != null;
  const id = "fd-" + m.id;
  return {
    idJogo: id,
    fixtureId: id,
    espnId: "",
    mandante,
    visitante,
    data: dataBrt(m.utcDate) || hoje(),
    horario: horarioBrt(m.utcDate),
    status,
    minuto: "",
    placarMandante: placarOk ? Number(full.home) : null,
    placarVisitante: placarOk ? Number(full.away) : null,
    competicao,
    local: "",
    fonte: "football-data",
    escudoCasa: urlEscudo(mandante, m.homeTeam.crest || ""),
    escudoFora: urlEscudo(visitante, m.awayTeam.crest || ""),
    grupo: grupoDoJogo({ competicao }),
    quente: false
  };
}

function dataIsoMaisDias(dias) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AF_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(Date.now() + dias * 864e5));
}

async function puxarJogosFd() {
  const hojeStr = hoje();
  const ate = dataIsoMaisDias(16);
  const out = [];
  const visto = new Set();
  // sequencial pra não estourar o limite de 10 req/min do plano Free
  for (const code of FD_CODES) {
    try {
      const d = await fdJson("/competitions/" + code + "/matches", { dateFrom: hojeStr, dateTo: ate });
      for (const m of ((d && d.matches) || [])) {
        const j = matchFdParaJogo(m, code);
        if (!j || !jogoAberto(j)) continue;
        if (visto.has(j.fixtureId) || visto.has(chaveParData(j))) continue;
        visto.add(j.fixtureId);
        out.push(j);
      }
    } catch { /* liga sem acesso ou rate limit */ }
  }
  return out;
}

async function jogosProximosFd() {
  if (!footballDataLigada()) return [];
  if (Date.now() - fdListaMemo.em < 25 * 60 * 1000 && fdListaMemo.jogos.length) return fdListaMemo.jogos;
  if (fdEmCurso) return fdEmCurso;
  fdEmCurso = puxarJogosFd().then((jogos) => {
    fdListaMemo = { em: Date.now(), jogos };
    return jogos;
  }).catch(() => fdListaMemo.jogos || []).finally(() => { fdEmCurso = null; });
  return fdEmCurso;
}

/* ---------------------------------------------------------------- TheSportsDB (v1) — complemento de agenda por liga */
const TSDB_LIGAS_AGENDA = LIGAS.filter((l) => l.id).map((l) => ({ id: l.id, competicao: l.nome }));
let tsdbListaMemo = { em: 0, jogos: [] };
let tsdbEmCurso = null;

async function puxarJogosSportsDb() {
  if (!sportsDbLigada()) return [];
  const out = [];
  const visto = new Set();
  const hojeStr = hoje();
  for (const liga of TSDB_LIGAS_AGENDA) {
    try {
      const d = await httpJson(sportsdbBase() + "/eventsnextleague.php?id=" + liga.id, 6000);
      for (const ev of listaEventos(d)) {
        const j = eventoSportsdbParaJogo(ev, false);
        if (!j || !jogoAberto(j)) continue;
        if (String(j.data || "") < hojeStr) continue;
        if (!j.competicao) j.competicao = liga.competicao;
        const k = j.fixtureId || chaveParData(j);
        if (visto.has(k)) continue;
        visto.add(k);
        out.push(j);
      }
    } catch { /* liga sem dado */ }
  }
  return out;
}

async function jogosProximosSportsDb() {
  if (!sportsDbLigada()) return [];
  if (Date.now() - tsdbListaMemo.em < 30 * 60 * 1000 && tsdbListaMemo.jogos.length) return tsdbListaMemo.jogos;
  if (tsdbEmCurso) return tsdbEmCurso;
  tsdbEmCurso = puxarJogosSportsDb().then((jogos) => {
    tsdbListaMemo = { em: Date.now(), jogos };
    return jogos;
  }).catch(() => tsdbListaMemo.jogos || []).finally(() => { tsdbEmCurso = null; });
  return tsdbEmCurso;
}

// Versão enxuta do jogo para listas (a página de jogos mostra dezenas de cards de uma vez).
// Os escudos reserva (SVG em data URL) ficaram de fora: o navegador troca por /img/escudo?time=... se precisar.
function jogoResumido(m) {
  return {
    idJogo: m.idJogo,
    mandante: m.mandante,
    visitante: m.visitante,
    data: m.data,
    horario: m.horario,
    status: m.status,
    minuto: m.minuto || "",
    placarMandante: m.placarMandante == null ? null : m.placarMandante,
    placarVisitante: m.placarVisitante == null ? null : m.placarVisitante,
    competicao: m.competicao || "",
    local: m.local || "",
    escudoCasa: m.escudoCasa,
    escudoFora: m.escudoFora,
    grupo: m.grupo,
    quente: !!m.quente
  };
}

const ORDEM_STATUS = { "ao vivo": 0, agendado: 1 };

async function montarAgendaCompleta(eu) {
  placaresEmSegundoPlano(60000);
  if (!jogosCalendario().length) {
    // primeira vez após instalar: espera um pouco, depois responde com o que tiver
    await Promise.race([sincronizarCalendario(load(), true).catch(() => {}), new Promise((r) => setTimeout(r, 12000))]);
  } else {
    sincronizarCalendario(load(), false).catch(() => {});
  }
  const db = load();
  const hojeStr = hoje();
  // hoje (inclusive o que já acabou, para o filtro "Hoje" mostrar o placar final) e jogos cadastrados à mão
  // para os próximos dias; dias futuros só entram se ainda não foram jogados
  const proprios = (db.jogos || []).filter((j) => {
    const d = String(j.data || "");
    return d === hojeStr || (d > hojeStr && jogoAberto(j));
  });
  const jaTem = new Set(proprios.flatMap((j) => [j.espnId, j.fixtureId, chaveParData(j)].filter(Boolean)));
  const futuros = jogosCalendario()
    .filter((j) => String(j.data || "") >= hojeStr && jogoAberto(j) && !jaTem.has(j.espnId) && !jaTem.has(chaveParData(j)));
  // API-Football só quando a ESPN ainda está magra (cada liga gasta cota)
  if (futuros.length < 20) {
    for (const j of await jogosProximosAf()) {
      if (jaTem.has(String(j.fixtureId)) || jaTem.has(chaveParData(j))) continue;
      if (futuros.some((x) => mesmoPar(x, j) && x.data === j.data)) continue;
      futuros.push(j);
      jaTem.add(String(j.fixtureId));
    }
  }
  // football-data.org: completa o que a ESPN não trouxe (cache ~25 min)
  for (const j of await jogosProximosFd()) {
    if (jaTem.has(String(j.fixtureId)) || jaTem.has(chaveParData(j))) continue;
    if (futuros.some((x) => mesmoPar(x, j) && x.data === j.data)) continue;
    futuros.push(j);
    jaTem.add(String(j.fixtureId));
  }
  // TheSportsDB: reforço por liga (chave free 123 ou premium no .env)
  if (futuros.length < 120) {
    for (const j of await jogosProximosSportsDb()) {
      if (jaTem.has(String(j.fixtureId)) || jaTem.has(chaveParData(j))) continue;
      if (futuros.some((x) => mesmoPar(x, j) && x.data === j.data)) continue;
      futuros.push(j);
      jaTem.add(String(j.fixtureId || chaveParData(j)));
    }
  }
  const universo = proprios.concat(futuros);
  const visto = new Set();
  const lista = [];
  for (const j of universo) {
    const k = j.espnId || j.fixtureId || chaveParData(j);
    if (visto.has(k)) continue;
    visto.add(k);
    lista.push(jogoResumido(marcarAgenda(db, j, eu, grupoDoJogo(j))));
  }
  lista.sort((a, b) =>
    String(a.data).localeCompare(String(b.data))
    || (ORDEM_STATUS[a.status] ?? 2) - (ORDEM_STATUS[b.status] ?? 2)
    || String(a.horario || "").localeCompare(String(b.horario || "")));
  const porDia = [];
  for (const j of lista) {
    const d = j.data || hojeStr;
    let bloco = porDia[porDia.length - 1];
    if (!bloco || bloco.data !== d) {
      bloco = { data: d, jogos: [] };
      porDia.push(bloco);
    }
    bloco.jogos.push(j);
  }
  const contagem = {};
  for (const j of lista) contagem[j.grupo] = (contagem[j.grupo] || 0) + 1;
  return {
    dataHoje: hojeStr,
    atualizadoEm: new Date(placarMemo.em || Date.now()).toISOString(),
    time: (eu && eu.time) || "Santos",
    total: lista.length,
    grupos: GRUPOS_AGENDA.map((g) => ({ id: g.id, nome: g.nome, qtd: contagem[g.id] || 0 })).filter((g) => g.qtd),
    dias: porDia
  };
}

function querProximos(pergunta) {
  const p = normaliza(pergunta);
  if (/ganha|ganhar|palpite|favorit|chance|probab|quem leva|quem passa/.test(p)) return false;
  return /proximos jogos|proximos jogo|quais os proximo|quais proxim|todos os jogos|agenda|calendario|jogos da semana|jogos da rodada|o que vem|proximos da|proximos do brasile|proximos da copa|proximos da champ/.test(p)
    || /\b(e )?o proximo\b/.test(p)
    || /\bquando (joga|vai jogar)\b/.test(p)
    || (/\bproxim/.test(p) && /\bjogo/.test(p) && /quais|todos|mostra|lista|tem/.test(p));
}

function competicoesDaLiga(liga) {
  if (!liga) return null;
  if (liga.afId === 71) return ["Brasileirão Série A"];
  if (liga.afId === 73) return ["Copa do Brasil"];
  if (liga.afId === 13) return ["Libertadores", "Sul-Americana"];
  if (liga.afId === 2) return ["Champions League"];
  if (liga.afId === 39) return ["Premier League"];
  if (liga.afId === 140) return ["La Liga"];
  if (liga.afId === 135) return ["Serie A (Itália)"];
  if (liga.afId === 78) return ["Bundesliga"];
  if (liga.afId === 61) return ["Ligue 1"];
  return null;
}

function agendaFutura(db) {
  const hojeStr = hoje();
  // hoje + jogos cadastrados à mão para os próximos dias
  const deHoje = (db.jogos || []).filter((j) => String(j.data || "") >= hojeStr);
  const jaTem = new Set(deHoje.map((j) => j.espnId || chaveParData(j)));
  const resto = jogosCalendario().filter((j) =>
    String(j.data || "") >= hojeStr && !jaTem.has(j.espnId || chaveParData(j)));
  return deHoje.concat(resto).sort((a, b) =>
    String(a.data || "").localeCompare(String(b.data || ""))
    || String(a.horario || "").localeCompare(String(b.horario || "")));
}

function falaProximos(eu, db, det, extra, liga, jogosLiga, agendaPack, pergunta) {
  const hojeStr = hoje();
  const agenda = agendaFutura(db);
  if (!agenda.length) return "A agenda ainda não carregou. Tenta de novo em alguns segundos.";

  const alvo = (det && det.explicito) ? det.nome : null;
  if (alvo) {
    let doClube = agenda.filter((j) => clubeNoJogo(j, alvo));
    const pular = String(pergunta || "").match(/não este:\s*(.+)\)\s*$/i);
    if (/\bJOGO SEGUINTE\b/.test(String(pergunta || "")) && doClube.length > 1) {
      if (pular) {
        const pul = normaliza(pular[1]);
        const idx = doClube.findIndex((j) => pul.includes(normaliza(j.mandante)) && pul.includes(normaliza(j.visitante)));
        doClube = idx >= 0 ? doClube.slice(idx + 1) : doClube.slice(1);
      } else {
        doClube = doClube.slice(1);
      }
    }
    doClube = doClube.slice(0, 6);
    if (!doClube.length) return `Não achei jogo do ${alvo} nos próximos dias.`;
    return `Próximos do ${alvo}:\n` + doClube.map(linhaJogo).join("\n");
  }

  const comps = competicoesDaLiga(liga);
  if (comps) {
    const daLiga = agenda.filter((j) => comps.includes(String(j.competicao || ""))).slice(0, 10);
    if (!daLiga.length) return `Sem jogo de ${liga.nome} na janela dos próximos dias.`;
    return `${liga.nome}:\n` + daLiga.map(linhaJogo).join("\n");
  }

  const linhas = [];
  const hojeJogos = agenda.filter((j) => j.data === hojeStr);
  if (hojeJogos.length) linhas.push("Hoje:\n" + hojeJogos.slice(0, 8).map(linhaJogo).join("\n"));
  const meu = agenda.filter((j) => j.data !== hojeStr && (clubeNoJogo(j, eu.time) || clubeNoJogo(j, eu.feedTime))).slice(0, 4);
  if (meu.length) linhas.push(`Próximos do ${eu.time}:\n` + meu.map(linhaJogo).join("\n"));
  const brasil = agenda.filter((j) =>
    j.data !== hojeStr
    && !meu.includes(j)
    && ["Brasileirão Série A", "Copa do Brasil", "Libertadores", "Sul-Americana"].includes(String(j.competicao || ""))).slice(0, 6);
  if (brasil.length) linhas.push("No Brasil:\n" + brasil.map(linhaJogo).join("\n"));
  return linhas.join("\n\n") || "Sem jogos na agenda agora.";
}

function temporadaEuropeia() {
  const y = Number(new Intl.DateTimeFormat("en-CA", { timeZone: AF_TZ, year: "numeric" }).format(new Date()));
  const m = Number(new Intl.DateTimeFormat("en-CA", { timeZone: AF_TZ, month: "numeric" }).format(new Date()));
  const inicio = m >= 7 ? y : y - 1;
  return [inicio + "-" + (inicio + 1), (inicio - 1) + "-" + inicio, String(y)];
}

function tabelaDeSportsdb(d) {
  return ((d && d.table) || []).map((x) => ({
    posicao: Number(x.intRank),
    time: x.strTeam,
    pontos: Number(x.intPoints)
  })).filter((x) => x.time);
}

function tabelaDeEspn(d) {
  const ch = (d && d.children && d.children[0]) || d;
  const entries = (ch && ch.standings && ch.standings.entries) || [];
  return entries.map((e) => {
    const stats = e.stats || [];
    const rank = stats.find((s) => s.name === "rank" || s.abbreviation === "R");
    const pts = stats.find((s) => s.name === "points" || s.abbreviation === "P");
    return {
      posicao: rank ? Number(rank.value) : 0,
      time: e.team && (e.team.displayName || e.team.shortDisplayName),
      pontos: pts != null ? Number(pts.value) : 0
    };
  }).filter((x) => x.time).sort((a, b) => a.posicao - b.posicao);
}

async function puxarTabelaLiga(liga, db) {
  if (!liga || liga.local || liga.afId === 2) return [];
  db.tabelaLiga = db.tabelaLiga || {};
  const chave = "atual-v3-" + liga.id;
  const cache = db.tabelaLiga[chave];
  if (cache && Date.now() - new Date(cache.puxadoEm).getTime() < 3 * 60 * 60 * 1000) return cache.tabela || [];

  let tabela = [];
  if (apiFootballLigada() && liga.afId) {
    const season = await buscarTemporadaLiga(liga.afId);
    if (season) {
      const d = await afJson("/standings", { league: liga.afId, season });
      const grupos = (d && d.response && d.response[0] && d.response[0].league && d.response[0].league.standings) || [];
      const rows = grupos[0] || [];
      tabela = rows.map((x) => ({
        posicao: Number(x.rank),
        time: x.team && x.team.name,
        pontos: Number(x.points)
      })).filter((x) => x.time);
    }
  }
  if (!tabela.length) {
    for (const s of temporadaEuropeia()) {
      const d = await httpJson(sportsdbBase() + "/lookuptable.php?l=" + liga.id + "&s=" + encodeURIComponent(s), 6000);
      tabela = tabelaDeSportsdb(d);
      if (tabela.length) break;
    }
    if (!tabela.length && liga.espn) {
      const d = await httpJson("https://site.api.espn.com/apis/v2/sports/soccer/" + liga.espn + "/standings", 6000);
      tabela = tabelaDeEspn(d);
    }
  }
  db.tabelaLiga[chave] = { tabela, puxadoEm: new Date().toISOString() };
  save(db);
  return tabela;
}

function falaLiga(db, liga, jogosLiga, eu, tabelaLiga) {
  const comps = competicoesDaLiga(liga);
  const doCalendario = comps
    ? agendaFutura(db).filter((j) => comps.includes(String(j.competicao || "")))
    : [];
  const prox = (doCalendario.length
    ? doCalendario
    : (jogosLiga || []).filter((j) => j.data >= hoje() && !j.concluido)).slice(0, 8);
  if (liga.local) {
    const lista = (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao);
    const top = lista.slice(0, 3).map((x) => `${x.posicao}º ${x.time} ${x.pontos}`).join(" · ");
    const z4 = lista.filter((x) => x.posicao >= 17).map((x) => x.time).join(", ");
    const meu = lista.find((x) => x.time === eu.time);
    const linhas = [`Série A: ${top}`];
    if (z4) linhas.push(`Z-4: ${z4}`);
    if (meu) linhas.push(`${eu.time}: ${meu.posicao}º, ${meu.pontos} pts`);
    if (prox.length) linhas.push("Próximos:\n" + prox.map(linhaJogo).join("\n"));
    return linhas.join("\n");
  }
  const linhas = [];
  const tab = tabelaLiga || [];
  if (tab.length) {
    linhas.push(`${liga.nome}: ` + tab.slice(0, 3).map((x) => `${x.posicao}º ${x.time} ${x.pontos}`).join(" · "));
  }
  if (prox.length) linhas.push((tab.length ? "Próximos:\n" : liga.nome + ":\n") + prox.map(linhaJogo).join("\n"));
  if (linhas.length) return linhas.join("\n");
  return `Sem agenda da ${liga.nome} agora.`;
}

// Classificação do Brasileirão direto da ESPN (estruturada, atual). Antes o código raspava a Wikipedia.
async function puxarTabelaEspn() {
  const d = await httpJson("https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings", 9000);
  const entradas = ((((d && d.children) || [])[0] || {}).standings || {}).entries || [];
  const lista = [];
  for (const e of entradas) {
    const stat = (nome) => {
      const s = (e.stats || []).find((x) => x.name === nome);
      return s && Number.isFinite(Number(s.value)) ? Number(s.value) : 0;
    };
    const time = nomeClubePtBr(e.team && (e.team.displayName || e.team.shortDisplayName));
    const posicao = stat("rank");
    if (!time || !posicao) continue;
    lista.push({
      time,
      posicao,
      pontos: stat("points"),
      jogos: stat("gamesPlayed"),
      vitorias: stat("wins"),
      empates: stat("ties"),
      derrotas: stat("losses"),
      golsPro: stat("pointsFor"),
      golsContra: stat("pointsAgainst"),
      saldo: stat("pointDifferential")
    });
  }
  lista.sort((a, b) => a.posicao - b.posicao);
  return lista;
}

function secaoDaManchete(titulo, resumo) {
  const t = normaliza(titulo + " " + (resumo || ""));
  if (/mercado|contrat|transfer|venda|compra|proposta|olheiro|janela|salario/.test(t)) return "mercado";
  if (/analise|favorit|leitura|tatica|desfalque|prognost/.test(t)) return "analise";
  return "jogo";
}

// Corta num fim de palavra e marca o corte com reticências (texto que já cabe volta igual).
function encurtar(texto, max) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const base = t.slice(0, max - 1); // sobra uma posição para as reticências
  const espaco = base.lastIndexOf(" ");
  const corte = espaco > max * 0.6 ? base.slice(0, espaco) : base;
  return corte.replace(/[\s,;:.\-–—(]+$/, "") + "…";
}

function limpaHtmlRss(s) {
  const semMarcas = (x) => String(x || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ");
  // decodifica, remove tags que estavam escapadas e decodifica de novo (texto escapado duas vezes)
  return decodificarEntidades(semMarcas(decodificarEntidades(semMarcas(s)))).replace(/\s+/g, " ").trim();
}

// Chamadas de página do portal que não são notícia ("Participe do canal do ge no WhatsApp").
function manchetePropaganda(titulo) {
  return /participe do canal|canal do ge|whatsapp|newsletter|assine |baixe o app|siga o ge|clique e|saiba como (assistir|acompanhar)|publicidade/i.test(titulo);
}

function imagemDoItemRss(bloco) {
  const b = decodificarEntidades(String(bloco || ""));
  const tentativas = [
    /<media:(?:content|thumbnail)[^>]*\burl=["']([^"']+)["']/i,
    /<enclosure[^>]*\burl=["']([^"']+)["'][^>]*type=["']image/i,
    /<enclosure[^>]*type=["']image[^"']*["'][^>]*\burl=["']([^"']+)["']/i,
    /<itunes:image[^>]*\bhref=["']([^"']+)["']/i,
    /<img[^>]*\bsrc=["']([^"']+)["']/i,
    /(https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?)/i
  ];
  for (const re of tentativas) {
    const m = b.match(re);
    const url = m && m[1] && m[1].trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (/\.(svg|gif)(\?|$)/i.test(url)) continue;
    if (/sprite|logo|icon|placeholder|avatar|1x1|blank|pixel/i.test(url)) continue;
    return url;
  }
  return "";
}

function parseRss(xml, fonte) {
  const out = [];
  const partes = String(xml || "").split(/<item[\s>]/i);
  for (const b of partes.slice(1)) {
    const titulo = limpaHtmlRss((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const link = limpaHtmlRss((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    const desc = limpaHtmlRss((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]);
    if (!titulo || titulo.length < 22 || titulo.length > 160 || manchetePropaganda(titulo)) continue;
    if (link && !/^https?:\/\//i.test(link)) continue;
    const pub = Date.parse(limpaHtmlRss((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]));
    const quando = Number.isFinite(pub) && pub <= Date.now() + 36e5 ? pub : Date.now();
    out.push({
      // o id acompanha a data de publicação: ordenar por id é ordenar do mais novo para o mais velho
      id: quando * 10 + (out.length % 10),
      fonte,
      secao: secaoDaManchete(titulo, desc),
      time: timeNoTexto(titulo + " " + desc),
      titulo,
      resumo: encurtar(desc || titulo, 200),
      imagem: imagemDoItemRss(b),
      url: link || "",
      publicadoEm: new Date(quando).toISOString(),
      criadoEm: hoje()
    });
    if (out.length >= 14) break;
  }
  return out;
}

async function puxarRss(url, fonte) {
  try {
    const r = await fetch(url, { headers: { ...UA, Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    return parseRss(await r.text(), fonte);
  } catch {
    return [];
  }
}

async function puxarTodasManchetes() {
  const listas = await Promise.all([
    puxarRss("https://pox.globo.com/rss/ge/futebol/", "ge"),
    puxarRss("https://pox.globo.com/rss/ge/futebol/brasileirao-serie-a/", "ge"),
    puxarRss("https://www.gazetaesportiva.com/feed/", "gazeta"),
    puxarRss("https://www.terra.com.br/esportes/futebol/rss.xml", "terra")
  ]);
  const juntas = [];
  const visto = new Set();
  for (const lista of listas) {
    for (const n of lista) {
      const k = normaliza(n.titulo).slice(0, 80);
      if (!k || visto.has(k)) continue;
      visto.add(k);
      juntas.push(n);
    }
  }
  return juntas;
}

const URL_TABELA = "https://www.espn.com.br/futebol/classificacao/_/liga/bra.1";

async function sincronizarPortal(forcar) {
  if (syncLock) return load();
  const db = load();
  const newsT = Date.parse((db.noticiasMeta && db.noticiasMeta.puxadoEm) || 0);
  const tabT = Date.parse((db.tabelaMeta && db.tabelaMeta.puxadoEm) || 0);
  const newsVelha = !newsT || Date.now() - newsT > 12 * 60 * 1000;
  const tabVelha = !tabT || Date.now() - tabT > 30 * 60 * 1000;
  if (!forcar && !newsVelha && !tabVelha) return db;
  syncLock = true;
  try {
    const [tabela, manchetes] = await Promise.all([
      (forcar || tabVelha) ? puxarTabelaEspn() : Promise.resolve(null),
      (forcar || newsVelha) ? puxarTodasManchetes() : Promise.resolve([])
    ]);
    const atual = load();
    if (tabela && tabelaSaudavel(tabela)) {
      atual.tabela = tabela;
      atual.tabelaMeta = { fonte: "ESPN", via: "espn", atualizadoAte: hoje(), puxadoEm: new Date().toISOString(), url: URL_TABELA };
    } else if (atual.tabelaMeta) {
      atual.tabelaMeta.ultimaTentativa = new Date().toISOString();
    }
    if (manchetes.length) {
      const porTitulo = new Map((atual.noticias || []).map((n) => [n.titulo, n]));
      for (const n of manchetes) {
        const antiga = porTitulo.get(n.titulo);
        if (!antiga) atual.noticias.push(n);
        else if (n.imagem && !antiga.imagem) antiga.imagem = n.imagem;
      }
      atual.noticias = atual.noticias.sort((a, b) => b.id - a.id).slice(0, 80);
      atual.noticiasMeta = { puxadoEm: new Date().toISOString(), qtd: manchetes.length };
    }
    save(atual);
    if (manchetes.length) aquecerMidias(atual).catch(() => {});
    return atual;
  } catch (e) {
    console.error("[portal] sincronização falhou:", e && e.message);
    return load();
  } finally {
    syncLock = false;
  }
}

function linhaNoticia(n) {
  return n.time ? `${n.titulo} · ${n.time}` : n.titulo;
}

function jogoDeHoje(db, time) {
  return (db.jogos || []).find((x) => x.data === hoje() && (x.mandante === time || x.visitante === time)) || null;
}

function ganchoLegal(db, time) {
  const j = jogoDeHoje(db, time);
  if (!j) return null;
  const hora = String(j.horario || "").replace(/^(\d{2}:\d{2}).*/, "$1");
  return `${j.mandante} x ${j.visitante}, ${hora}`;
}

function respostaAleatoria(pergunta, eu, db) {
  const p = normaliza(pergunta);
  const nome = BotVoz.primeiroNome(eu.nome);
  const time = eu.time;
  const gancho = ganchoLegal(db, time);
  const ctx = BotVoz.montarContexto(eu, db, time, pergunta);

  if (/temp|clima|frio|calor|chuva|sol|graus|tempo esta|previsao/.test(p)) {
    if (/chuva|frio/.test(p) && gancho) return `Chuva combina com sofá e nervoso, ${nome}. Clima tá bom pra assistir o ${time}: ${gancho}. ⚽`;
    if (gancho) return `${nome}, clima tá bom pra sofrer (ou comemorar) com o ${time}. ${gancho}.`;
    return `${nome}, clima de sofá. O ${time} não joga hoje — aproveita pra respirar.`;
  }
  if (/hora|que horas|relogio|despert/.test(p)) {
    return gancho ? `Relógio de pulso não, ${nome}. O que vale é o de jogo: ${gancho}.` : `Relógio eu não sou, ${nome}. O celular aí do lado sabe.`;
  }
  if (/comida|fome|almoco|jantar|pizza|cerveja/.test(p)) {
    return gancho ? `Pastel, cerveja e nervoso. Combina com ${gancho}. 🏟️` : `Eu não como, ${nome}. Só ocupo espaço e solto farpa.`;
  }
  if (/amor|namor|crush|casar|vida pessoal/.test(p)) {
    return gancho ? `Amor é camisa, ${nome}. A do ${time} não troca. ${gancho}.` : `Conselho de crush eu cobro, ${nome}. E mesmo assim saio mal.`;
  }
  if (/piada|engra|meme|conto uma/.test(p)) {
    return `Por que o Wi-Fi foi no psicólogo? Conexão instável — igual sequência do ${time}. 😅`;
  }
  if (perguntaPolitica(p)) {
    return `Opinião política? Sumo igual senha de Wi-Fi, ${nome}. Fala do ${time} que a gente conversa. ⚽`;
  }
  if (/quem e voce|seu nome|e um robo|inteligencia/.test(p)) {
    return gancho
      ? `Sou o Bot da nação, ${nome}: torcedor de bancada com farpa. Hoje o recado é ${gancho}.`
      : `Sou o Bot TORCIDA., ${nome}. Torcedor de bancada. Não sou Google. Fala do ${time}. 🔥`;
  }

  return BotVoz.fallbackBot(ctx);
}

function timesCitados(pergunta) {
  const p = normaliza(pergunta).replace(/[?!.,;:]/g, " ");
  const achados = [];
  const aliases = Object.entries(ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [apelido, oficial] of aliases) {
    if (!temToken(p, apelido)) continue;
    if (!achados.includes(oficial)) achados.push(oficial);
  }
  for (const t of TIMES.slice().sort((a, b) => normaliza(b).length - normaliza(a).length)) {
    if (temToken(p, t) && !achados.includes(t)) achados.push(t);
  }
  return achados;
}

function querResultado(pergunta) {
  const p = normaliza(pergunta);
  return /ganhou|gahou|ganou|venceu|perdeu|empatou|quanto (foi|ficou)|resultado|placar (do|da|de)|jogou contra|ja jogou|ultimo jogo|ultima partida|ultima rodada|jogo passado|o que rolou|como foi o (jogo|classico|partida)|ultimos (jogos|resultados)/.test(p);
}

function querPalpite(pergunta) {
  const p = normaliza(pergunta);
  if (perguntaForaDeBola(pergunta)) return false;
  if (querProximos(pergunta)) return false;
  if (querResultado(pergunta)) return false;
  const pedeVencedor = /quem ganha|\bganhar\b|\bganha\b|palpite|favorit|chance|probab|quem leva|quem passa|vc acha|voce acha|acha que|ahca|\bvence\b|previsao|prognostico/.test(p);
  // "desfalques do Vasco" é pergunta de elenco, não de palpite
  if (querElenco(pergunta) && !pedeVencedor) return false;
  const dois = timesCitados(pergunta).length >= 2 && /\bou\b/.test(p);
  return dois || pedeVencedor || /estatistic|analise|proximo jogo|proxima partida|onde vai ser|onde sera|onde e o jogo/.test(p);
}

function jogoDoTime(db, time) {
  const hojeStr = hoje();
  return (db.jogos || []).find((j) => j.data === hojeStr && clubeNoJogo(j, time))
    || agendaFutura(db).find((j) => clubeNoJogo(j, time))
    || null;
}

function confrontoEntre(db, a, b) {
  if (!a || !b) return { passado: null, futuro: null };
  const hojeStr = hoje();
  const todos = universoJogos(db)
    .filter((j) => clubeNoJogo(j, a) && clubeNoJogo(j, b))
    .sort((x, y) => String(y.data).localeCompare(String(x.data)) || String(y.horario || "").localeCompare(String(x.horario || "")));
  const passado = todos.find((j) => j.placarMandante != null && String(j.data || "") <= hojeStr) || null;
  const futuro = [...todos].reverse().find((j) =>
    String(j.data || "") >= hojeStr && (j.placarMandante == null || j.status === "agendado" || j.status === "ao-vivo")) || null;
  return { passado, futuro };
}

function jogoCitadoNaPergunta(db, pergunta, preferirPassado) {
  const times = timesCitados(pergunta);
  if (times.length >= 2) {
    const pack = confrontoEntre(db, times[0], times[1]);
    if (preferirPassado) return pack.passado || pack.futuro || null;
    return pack.futuro || pack.passado || null;
  }
  const p = normaliza(pergunta);
  const lista = preferirPassado ? universoJogos(db) : agendaFutura(db);
  return lista.find((j) => {
    const a = normaliza(j.mandante);
    const b = normaliza(j.visitante);
    return a.length >= 4 && b.length >= 4 && p.includes(a) && p.includes(b);
  }) || null;
}

function acharJogoAnalise(pergunta, eu, db) {
  const direto = jogoCitadoNaPergunta(db, pergunta, querResultado(pergunta));
  if (direto) return direto;
  const citados = timesCitados(pergunta);
  if (citados.length >= 2) {
    const pack = confrontoEntre(db, citados[0], citados[1]);
    return pack.futuro || pack.passado || null;
  }
  if (citados.length === 1) return jogoDoTime(db, citados[0]) || null;
  return jogoDoTime(db, eu.time);
}

function formaDoPacote(pacote, nome) {
  const ult = ((pacote && pacote.jogos) || [])
    .filter((j) => j.concluido && j.placarMandante != null)
    .slice()
    .sort((a, b) => (b.data + b.horario).localeCompare(a.data + a.horario))
    .slice(0, 5);
  const n = normaliza(nome);
  const letras = ult.map((j) => {
    const casa = normaliza(j.mandante) === n;
    const gf = casa ? j.placarMandante : j.placarVisitante;
    const gs = casa ? j.placarVisitante : j.placarMandante;
    if (gf > gs) return "V";
    if (gf < gs) return "D";
    return "E";
  });
  return { texto: letras.join("-") || "", letras, jogos: ult };
}

// Forma = últimos resultados do clube. A agenda externa às vezes traz só o último jogo; nesse caso
// vale a lista mais completa que o servidor já tem (resultados guardados da ESPN e jogos acompanhados).
function formaRecente(db, pacote, nome) {
  const doPacote = formaDoPacote(pacote, nome);
  if (doPacote.letras.length >= 5) return doPacote;
  const ult = ultimosDoTime(db, nome, 5);
  if (ult.length <= doPacote.letras.length) return doPacote;
  const letras = ult.map((j) => j.letra);
  return { texto: letras.join("-"), letras, jogos: ult };
}

const ESTADIOS_CONHECIDOS = { Palmeiras: "Nubank Parque", Santos: "Vila Belmiro", Vasco: "São Januário", Flamengo: "Maracanã" };

// Estádio do jogo: o que a fonte informou; depois a ficha do mandante; depois o estádio habitual de
// alguns clubes. Vazio quando ninguém sabe (antes saía "mando de X", que não é um estádio).
function estadioDoJogo(jogo, db) {
  if (!jogo) return "";
  if (jogo.local) return jogo.local;
  const ficha = db ? (db.fichas || {})[normaliza(jogo.mandante)] : null;
  if (ficha && ficha.estadio) return ficha.estadio;
  return ESTADIOS_CONHECIDOS[jogo.mandante] || "";
}

function desfalquesDoPortal(db, time) {
  const alvo = normaliza(time);
  return (db.noticias || []).filter((n) => {
    const blob = normaliza((n.titulo || "") + " " + (n.resumo || ""));
    const doTime = !alvo || n.time === time || blob.includes(alvo);
    return doTime && /desfalque|nao joga|nao viaja|lesao|suspenso|cortado|pendurado|amarelo|fora da partida/.test(blob);
  }).slice(0, 4).map((n) => limpaTextoChat(n.titulo));
}

function desfalquesDoJogo(jogo, db) {
  if (!jogo) return [];
  const lista = [];
  if (db) {
    for (const t of [jogo.mandante, jogo.visitante]) {
      for (const linha of desfalquesDoPortal(db, t)) {
        if (!lista.includes(linha)) lista.push(linha);
      }
    }
  }
  return lista;
}

function nomesInjuryAf(item) {
  const nome = item && item.player && item.player.name;
  if (!nome) return "";
  const razao = (item.player && (item.player.reason || item.player.type)) || (item.fixture && item.fixture.reason) || "";
  const time = item.team && item.team.name;
  return (time ? time + ": " : "") + nome + (razao ? " (" + razao + ")" : "");
}

async function puxarDesfalquesAf(jogo, idTeam) {
  const out = [];
  const fid = jogo && jogo.fixtureId;
  if (fid) {
    const d = await afJson("/injuries", { fixture: fid });
    for (const item of (d && d.response) || []) {
      const linha = nomesInjuryAf(item);
      if (linha && !out.includes(linha)) out.push(linha);
    }
  }
  if (!out.length && idTeam) {
    const ano = Number(String(hoje()).slice(0, 4));
    const d = await afJson("/injuries", { team: idTeam, season: ano });
    for (const item of ((d && d.response) || []).slice(0, 10)) {
      const linha = nomesInjuryAf(item);
      if (linha && !out.includes(linha)) out.push(linha);
    }
  }
  return out.slice(0, 8);
}

async function puxarEscalacaoAf(jogo) {
  const fid = jogo && jogo.fixtureId;
  if (!fid) return null;
  const d = await afJson("/fixtures/lineups", { fixture: fid });
  const resp = (d && d.response) || [];
  if (!resp.length) return null;
  const lado = (x) => ({
    time: x.team && x.team.name,
    formacao: x.formation || "",
    titulares: ((x.startXI) || []).map((p) => p.player && p.player.name).filter(Boolean).slice(0, 11)
  });
  return { casa: resp[0] ? lado(resp[0]) : null, fora: resp[1] ? lado(resp[1]) : null };
}

async function packElenco(db, jogo, timeAlvo, idApiFootball) {
  let jogoA = jogo || null;
  if (jogoA) jogoA = await resolverFixtureAf(jogoA, db);
  const [inj, esc] = await Promise.all([
    puxarDesfalquesAf(jogoA, idApiFootball),
    puxarEscalacaoAf(jogoA)
  ]);
  const base = desfalquesDoJogo(jogoA, db).concat(inj || []);
  return {
    jogo: jogoA,
    desfalques: base.filter((x, i) => x && base.indexOf(x) === i),
    escalacao: esc,
    alvo: timeAlvo
  };
}

function querElenco(pergunta) {
  const p = normaliza(pergunta);
  return /elenco|escalac|quem joga (hoje|amanha)|titular|reserva|banco de reserva|desfalque|nao joga|lesao|contund|quem falta/.test(p);
}

function querEstadio(pergunta) {
  const p = normaliza(pergunta);
  return /estadio|arena do|capacidade|onde (joga|e o jogo|vai ser)|mando de campo/.test(p);
}

function querTecnico(pergunta) {
  const p = normaliza(pergunta);
  return /tecnico|treinador|quem treina|quem e o mister/.test(p);
}

function chancesDoJogo(tabCasa, tabFora, extraCasa) {
  const pc = tabCasa ? Number(tabCasa.pontos) : 30;
  const pf = tabFora ? Number(tabFora.pontos) : 30;
  let casa = pc + 8 + (extraCasa || 0);
  const fora = pf;
  const emp = Math.round((casa + fora) * 0.2);
  const tot = casa + fora + emp || 1;
  const c = Math.round((casa / tot) * 100);
  const f = Math.round((fora / tot) * 100);
  const e = Math.max(0, 100 - c - f);
  return { casa: c, empate: e, fora: f };
}

function montaAnalise(db, jogo, extraCasa, extraFora, meuTime, predicao, extraDesfalques) {
  if (!jogo) {
    const tab = (db.tabela || []).find((x) => x.time === meuTime);
    const coberturaHoje = jogosHojeMarcados(db);
    return {
      meuTime,
      jogo: null,
      favorito: null,
      chances: null,
      titulo: meuTime,
      resumo: tab
        ? `${meuTime} está em ${tab.posicao}º com ${tab.pontos} pts. Não joga na cobertura de hoje.`
        : `${meuTime} não joga na cobertura de hoje.`,
      leitura: "",
      caminho: "",
      fatos: [],
      motivos: [],
      contra: [],
      desfalques: [],
      coberturaHoje,
      casa: { nome: meuTime, tab: tab || null, forma: "", letras: [], escudo: fichaCache(db, meuTime).escudo },
      fora: null
    };
  }
  const casa = jogo.mandante;
  const fora = jogo.visitante;
  const tabCasa = (db.tabela || []).find((x) => x.time === casa);
  const tabFora = (db.tabela || []).find((x) => x.time === fora);
  const desfalques = (extraDesfalques && extraDesfalques.length)
    ? extraDesfalques
    : desfalquesDoJogo(jogo, db);
  let chances = chancesDoJogo(tabCasa, tabFora, 0);
  let favorito = chances.casa >= chances.fora ? casa : fora;
  let formaCasa = formaRecente(db, extraCasa, casa);
  let formaFora = formaRecente(db, extraFora, fora);
  if (predicao && predicao.chances) chances = predicao.chances;
  if (predicao && predicao.vencedor) {
    if (nomeBate(predicao.vencedor, casa)) favorito = casa;
    else if (nomeBate(predicao.vencedor, fora)) favorito = fora;
    else favorito = predicao.vencedor;
  } else {
    favorito = chances.casa >= chances.fora ? casa : fora;
  }
  if (predicao && predicao.letrasCasa && predicao.letrasCasa.length) {
    formaCasa = { texto: predicao.letrasCasa.join("-"), letras: predicao.letrasCasa, jogos: formaCasa.jogos };
  }
  if (predicao && predicao.letrasFora && predicao.letrasFora.length) {
    formaFora = { texto: predicao.letrasFora.join("-"), letras: predicao.letrasFora, jogos: formaFora.jogos };
  }
  const zebra = favorito === casa ? fora : casa;
  const copa = /copa/i.test(jogo.competicao || "");
  const placarFinal = jogo.placarMandante != null && jogo.placarVisitante != null;
  const encerrado = placarFinal && (jogo.status === "encerrado" || jogo.concluido === true);
  const gap = tabCasa && tabFora ? Math.abs(tabCasa.pontos - tabFora.pontos) : null;
  const local = estadioDoJogo(jogo, db);
  const hora = String(jogo.horario || "").replace(/^(\d{2}:\d{2}).*/, "$1");
  const competicao = String(jogo.competicao || "").replace(/^Brazil(ian)?\s+/i, "");
  const fatos = [];
  if (local) fatos.push({ k: "Estádio", v: local + " · mando de " + casa });
  if (tabCasa && tabFora) {
    fatos.push({ k: "Série A", v: `${casa} ${tabCasa.posicao}º/${tabCasa.pontos} pts · ${fora} ${tabFora.posicao}º/${tabFora.pontos} pts · ${gap} pts de diferença` });
  }
  if (copa) fatos.push({ k: "Formato", v: "Copa em mata-mata: o confronto pode não se decidir em 90 minutos." });
  if (formaCasa.texto) fatos.push({ k: "Forma " + casa, v: formaCasa.texto });
  if (formaFora.texto) fatos.push({ k: "Forma " + fora, v: formaFora.texto });
  for (const d of desfalques) fatos.push({ k: "Desfalque", v: d });

  const pctFav = favorito === casa ? chances.casa : chances.fora;
  const motivoFavorito = favorito === casa ? "com mando e campanha a favor" : "com campanha melhor, mesmo fora de casa";
  let leitura = copa
    ? `${favorito} chega na frente (${pctFav}%), ${motivoFavorito}. Mata-mata não é só noventa minutos: tudo pode virar.`
    : `${favorito} é a leitura (${pctFav}%), ${motivoFavorito}.`;
  if (predicao && predicao.conselho) leitura = predicao.conselho;
  let caminho = copa
    ? (favorito === casa
      ? `${fora} precisa segurar o resultado fora de casa e decidir a vaga no próximo capítulo do confronto.`
      : `${casa} precisa aproveitar o mando: fora, a tabela pesa contra.`)
    : (favorito === casa
      ? `${fora} precisa pontuar fora pra furar a leitura.`
      : `${casa} precisa aproveitar o mando.`);
  if (encerrado) {
    // jogo que já acabou: vale o resultado, não a previsão
    const gm = jogo.placarMandante;
    const gv = jogo.placarVisitante;
    leitura = gm === gv
      ? `Fim de jogo: empate em ${gm}–${gv}.`
      : `Fim de jogo: ${gm > gv ? casa : fora} venceu por ${gm}–${gv}.`;
    caminho = "";
  }

  return {
    meuTime,
    jogo: {
      mandante: casa,
      visitante: fora,
      data: jogo.data,
      horario: hora,
      competicao,
      local,
      hoje: jogo.data === hoje(),
      espnId: jogo.espnId || "",
      idJogo: idDoJogo(jogo),
      escudoCasa: (jogo.escudoCasa || ""),
      escudoFora: (jogo.escudoFora || ""),
      fotoCasa: (jogo.fotoCasa || ""),
      status: jogo.status || (jogo.placarMandante != null ? "encerrado" : "agendado"),
      placarMandante: jogo.placarMandante,
      placarVisitante: jogo.placarVisitante
    },
    favorito,
    zebra,
    chances,
    titulo: `${casa} x ${fora}`,
    resumo: leitura,
    leitura,
    caminho,
    fatos,
    motivos: fatos.map((f) => f.v),
    contra: [caminho],
    coberturaHoje: jogosHojeMarcados(db),
    ultimosCasa: ultimosDoTime(db, casa, 5),
    ultimosFora: ultimosDoTime(db, fora, 5),
    casa: { nome: casa, tab: tabCasa || null, forma: formaCasa.texto, letras: formaCasa.letras || [], escudo: jogo.escudoCasa || fichaCache(db, casa).escudo, foto: jogo.fotoCasa || "" },
    fora: { nome: fora, tab: tabFora || null, forma: formaFora.texto, letras: formaFora.letras || [], escudo: jogo.escudoFora || fichaCache(db, fora).escudo },
    desfalques,
    conselho: (predicao && predicao.conselho) || "",
    encerrado,
    quando: jogo.data === hoje() ? `hoje, ${hora}` : `${jogo.data} ${hora}`.trim()
  };
}

function falaPalpite(a) {
  if (!a || !a.jogo) {
    const base = a && a.resumo ? a.resumo : "Não achei jogo agendado pra montar a leitura.";
    if (a && a.proximo) {
      return base + "\nPróximo: " + a.proximo.mandante + " x " + a.proximo.visitante
        + (a.proximo.data ? " · " + a.proximo.data.split("-").reverse().join("/") : "")
        + (a.proximo.horario ? " " + a.proximo.horario : "")
        + (a.proximo.competicao ? " · " + a.proximo.competicao : "") + ".";
    }
    return base;
  }
  const c = a.chances || {};
  const quando = a.jogo.hoje ? " hoje" : (a.jogo.data ? " em " + String(a.jogo.data).split("-").reverse().join("/") : "");
  const linhas = [
    `${a.jogo.mandante} x ${a.jogo.visitante}${quando}${a.jogo.horario ? ", " + a.jogo.horario : ""}${a.jogo.local ? " · " + a.jogo.local : ""}${a.jogo.competicao ? " · " + a.jogo.competicao : ""}.`,
    "",
    a.leitura || a.resumo,
    `${a.jogo.mandante} ${c.casa}% · empate ${c.empate}% · ${a.jogo.visitante} ${c.fora}%.`
  ];
  if (a.desfalques && a.desfalques[0]) linhas.push(a.desfalques[0]);
  if (a.caminho) linhas.push(a.caminho);
  return linhas.filter(Boolean).join("\n");
}

function resumoLocal(db, time) {
  const tab = (db.tabela || []).find((x) => x.time === time);
  const agenda = agendaFutura(db).filter((j) => clubeNoJogo(j, time));
  const deHoje = agenda.filter((j) => j.data === hoje());
  const partes = [];
  if (tab) partes.push(`${time}: ${tab.posicao}º, ${tab.pontos} pts`);
  if (deHoje.length) partes.push("Hoje: " + deHoje.map(linhaJogo).join(" · "));
  else if (agenda.length) partes.push("Próximos:\n" + agenda.slice(0, 3).map(linhaJogo).join("\n"));
  return partes.join("\n") || `Sem dado do ${time} agora.`;
}

function querLider(p) {
  return /\blider\b|\blidera\b|quem (esta|ta) em primeiro|primeiro lugar|quem (esta|ta) na ponta/.test(p);
}

function querPassado(p) {
  return querResultado(p);
}

const FORA_DO_ACERVO = [
  [/quantos? titul|titulos|campeao (mundial|do mundo)|libertadores que ganhou|mundial de/, "quantos títulos um clube tem"],
  [/histori|fundac|fundado|foi criado|surgiu o|nasceu o/, "a história e a fundação dos clubes"],
  [/melhor jogador|maior idolo|maior jogador|craque de todos|artilheiro historico/, "quem é o melhor jogador"],
  [/contratac|transferenc|mercado da bola|vai contratar|salario|quanto ganha|valor de mercado|multa rescisoria/, "mercado, contratos e salários"]
];

function foraDoAcervo(p) {
  for (const [re, assunto] of FORA_DO_ACERVO) if (re.test(p)) return assunto;
  return null;
}

function falaSemDado(assunto, timeAlvo, db, eu) {
  const linha = (db.tabela || []).find((x) => x.time === timeAlvo);
  const vem = agendaFutura(db).filter((j) => clubeNoJogo(j, timeAlvo))[0];
  const tenho = [];
  if (linha) tenho.push(`${timeAlvo} na ${linha.posicao}ª com ${linha.pontos} pts`);
  if (vem) tenho.push(`próximo jogo: ${linhaJogo(vem)}`);
  const oferta = tenho.length ? " Do que eu tenho: " + tenho.join(" · ") + "." : "";
  const ctx = BotVoz.montarContexto(eu || { nome: "parceiro", time: timeAlvo }, db, timeAlvo, assunto);
  return BotVoz.fallbackBot(ctx) + oferta;
}

function falaUltimos(db, timeAlvo, extra) {
  const doCal = universoJogos(db).filter((j) => clubeNoJogo(j, timeAlvo) && j.placarMandante != null);
  const doExtra = ((extra && extra.jogos) || []).filter((j) =>
    clubeNoJogo(j, timeAlvo) && j.placarMandante != null && String(j.data || "") <= hoje());
  const todos = doCal.concat(doExtra)
    .filter((j, i, arr) => arr.findIndex((x) => x.data === j.data && x.mandante === j.mandante) === i)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .slice(0, 3);
  if (!todos.length) return null;
  const ult = todos[0];
  const gm = ult.placarMandante;
  const gv = ult.placarVisitante;
  const casa = clubeNoJogo({ mandante: ult.mandante }, timeAlvo);
  const meus = casa ? gm : gv;
  const deles = casa ? gv : gm;
  const veredito = meus > deles ? "Vitória" : meus < deles ? "Derrota" : "Empate";
  const cabeca = `${veredito} no último: ${linhaJogo(ult)}`;
  if (todos.length === 1) return cabeca;
  return cabeca + "\nAntes disso:\n" + todos.slice(1).map(linhaJogo).join("\n");
}

function falaResultadoConfronto(jogo) {
  if (!jogo) return null;
  const gm = jogo.placarMandante;
  const gv = jogo.placarVisitante;
  const linha = linhaJogo(jogo);
  if (gm == null) return `Esse confronto ainda não rolou. Está marcado: ${linha}`;
  const venceu = gm > gv ? jogo.mandante : gv > gm ? jogo.visitante : null;
  if (!venceu) return `Empate: ${linha}`;
  return `${venceu} venceu: ${linha}`;
}

function responderChat(pergunta, eu, db, det, extra, liga, jogosLiga, tabelaLiga, extrasConfronto, agendaPack) {
  const p = normaliza(pergunta).trim();
  if (!p) return "Pergunta de qualquer time, da tabela, dos jogos ou do ranking de torcida.";

  det = det && typeof det.then !== "function" ? det : { nome: eu.time, origem: "local", explicito: false };
  const timeAlvo = det.nome;
  const meuTime = eu.time;
  const outroClube = det.explicito && normaliza(timeAlvo) !== normaliza(meuTime);
  const local = det.origem === "local" && TIMES.includes(timeAlvo);
  const postsDoTime = db.posts.filter((x) => x.time === timeAlvo).sort((a, b) => b.id - a.id);
  const jogosHoje = db.jogos.filter((j) => j.data === hoje());
  const jogosTime = db.jogos.filter((j) => j.mandante === timeAlvo || j.visitante === timeAlvo);

  const proximoDoTime = agendaFutura(db).find((j) => clubeNoJogo(j, timeAlvo))
    || ((extra && extra.jogos) || []).find((j) => !j.concluido && clubeNoJogo(j, timeAlvo));
  const ctxVoz = BotVoz.montarContexto(eu, db, timeAlvo, pergunta, { proximo: proximoDoTime });
  const histRecente = histDo(eu).slice(-6);
  if (histRecente.some((h) => h && h.pergunta && normaliza(h.pergunta) === p)) ctxVoz.memoria = { repetiu: true };

  if (perguntaForaDeBola(pergunta)) {
    const math = BotVoz.detectarMatematica(pergunta);
    if (math) return BotVoz.farpaMatematica(math.expressao, math.resultado, ctxVoz);
    return respostaAleatoria(pergunta, eu, db);
  }

  // Rival / clássico — Bot torce CONTRA o usuário
  if (BotVoz.querRival(p) || ctxVoz.isClassico) {
    const rival = BotVoz.rivalDe(meuTime) || ctxVoz.rival;
    if (rival) {
      const ctxRival = BotVoz.montarContexto(eu, db, meuTime, pergunta, { proximo: proximoDoTime });
      ctxRival.rival = rival;
      ctxRival.isClassico = true;
      const rivalLinha = (db.tabela || []).find((x) => x.time === rival);
      if (rivalLinha) ctxRival.rivalPosicao = rivalLinha.posicao;
      const jogoRival = agendaFutura(db).find((j) => clubeNoJogo(j, meuTime) && clubeNoJogo(j, rival))
        || universoJogos(db).find((j) => clubeNoJogo(j, meuTime) && clubeNoJogo(j, rival));
      let fatos = "";
      if (jogoRival) fatos = linhaJogo(jogoRival);
      return BotVoz.temperarFatos(fatos, ctxRival, "classico");
    }
  }

  if (BotVoz.querRebaixamento(p) || BotVoz.querG4(p)) {
    const lista = (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao);
    const tab = lista.find((x) => x.time === timeAlvo);
    const fatos = tab
      ? `📊 ${tab.time} — ${tab.posicao}ª posição, ${tab.pontos} pts em ${tab.jogos} jogos.`
      : "";
    const tipo = BotVoz.querRebaixamento(p) ? "rebaixamento" : "g4";
    if (tipo === "g4" && tab) {
      const g4 = lista[3];
      const falta = g4 ? Math.max(0, g4.pontos - tab.pontos + 1) : null;
      const extra = falta != null
        ? (tab.posicao <= 4
          ? ` Tá no G4, ${BotVoz.primeiroNome(eu.nome)}. Aproveita — eu já tô torcendo contra no próximo clássico.`
          : ` Faltam cerca de ${falta} ponto(s) pro G4. Com o que resta de jogos, é difícil mas não é impossível.`)
        : "";
      return BotVoz.temperarFatos(fatos + extra, ctxVoz, "g4");
    }
    return BotVoz.temperarFatos(fatos, ctxVoz, tipo);
  }

  const mathInline = BotVoz.detectarMatematica(pergunta);
  if (mathInline && !/\bjogo|tabela|placar|time|clube|rival|classico\b/.test(p)) {
    return BotVoz.farpaMatematica(mathInline.expressao, mathInline.resultado, ctxVoz);
  }

  const citadosChat = timesCitados(pergunta);
  if (citadosChat.length >= 2) {
    const pack = confrontoEntre(db, citadosChat[0], citadosChat[1]);
    if (querResultado(p)) {
      const fala = falaResultadoConfronto(pack.passado || pack.futuro);
      if (fala) return fala;
      return `Não achei ${citadosChat[0]} x ${citadosChat[1]} na janela que eu acompanho.`;
    }
    if (!querPalpite(pergunta) && !querProximos(pergunta) && pack.passado) {
      const fala = falaResultadoConfronto(pack.passado);
      if (fala) return fala;
    }
  }

  if (querPalpite(pergunta)) {
    const jogo = (extrasConfronto && extrasConfronto.jogo) || acharJogoAnalise(pergunta, eu, db);
    const ea = extrasConfronto && extrasConfronto.casa;
    const eb = extrasConfronto && extrasConfronto.fora;
    const pred = extrasConfronto && extrasConfronto.pred;
    const alvo = (extrasConfronto && extrasConfronto.alvo) || det.nome || eu.time;
    const analise = montaAnalise(db, jogo, ea, eb, alvo, pred, extrasConfronto && extrasConfronto.desfalques);
    if (!analise.jogo && extrasConfronto && extrasConfronto.proximo) analise.proximo = extrasConfronto.proximo;
    return falaPalpite(analise);
  }

  if (/\baposta|apostar|odd|odds|bet|banca|fazer uma fezinha|quanto paga\b/.test(p)) {
    return "Aposta não é comigo, não dou dica de banca. Se quiser, eu abro a leitura do jogo: quem está melhor na tabela, forma recente e quem joga em casa.";
  }

  const saudacao = p.match(/^(oi|ola|eai|e ae|fala|hey|opa|bom dia|boa tarde|boa noite)\b/);
  if (saudacao) {
    const resto = p.slice(saudacao[0].length).replace(/[?!.,\s]/g, "");
    if (!resto) return BotVoz.saudacaoBot(ctxVoz);
  }

  if (p.includes("ajuda") || p.includes("o que voce") || p.includes("comandos") || p.includes("pode fazer")) {
    return `Eu sou o Bot da nação, ${BotVoz.primeiroNome(eu.nome)}. Pergunta de time, tabela, clássico, rebaixamento, desfalque ou o que a nação tá postando. Com farpa, claro. ⚽`;
  }

  if (querEstadio(pergunta)) {
    const ficha = fichaCache(db, timeAlvo);
    const local = estadioDoJogo(jogoDoTime(db, timeAlvo), db);
    if (ficha.estadio) {
      const cap = ficha.capacidade ? `, cabe ${ficha.capacidade}` : "";
      return `O ${timeAlvo} manda no ${ficha.estadio}${cap}.`;
    }
    if (local) return `O jogo é no ${local}.`;
    return `Não tenho o estádio do ${timeAlvo} cadastrado.`;
  }

  if (querTecnico(pergunta)) {
    const ficha = fichaCache(db, timeAlvo);
    if (ficha.tecnico) return `Quem treina o ${timeAlvo} é ${ficha.tecnico}.`;
    return `Não tenho o nome do técnico do ${timeAlvo} aqui. Posso falar tabela e o próximo jogo.`;
  }

  if (querElenco(pergunta)) {
    const pack = extrasConfronto || {};
    const linhas = [];
    const faltas = (pack.desfalques || []).concat(desfalquesDoJogo(pack.jogo || jogoDoTime(db, timeAlvo), db));
    const uniq = faltas.filter((x, i) => x && faltas.indexOf(x) === i);
    if (uniq.length) linhas.push("Desfalques: " + uniq.join("; "));
    const esc = pack.escalacao;
    if (esc && esc.casa && esc.casa.titulares && esc.casa.titulares.length) {
      linhas.push((esc.casa.time || "Mandante") + (esc.casa.formacao ? " " + esc.casa.formacao : "") + ": " + esc.casa.titulares.join(", "));
    }
    if (esc && esc.fora && esc.fora.titulares && esc.fora.titulares.length) {
      linhas.push((esc.fora.time || "Visitante") + (esc.fora.formacao ? " " + esc.fora.formacao : "") + ": " + esc.fora.titulares.join(", "));
    }
    const portal = desfalquesDoPortal(db, timeAlvo);
    for (const n of portal) if (!linhas.join(" ").includes(n)) linhas.push("Cobertura: " + n);
    if (linhas.length) return linhas.join("\n");
    return `Ainda não soltaram escalação nem lista de desfalque do ${timeAlvo}. O que eu tenho é tabela e o próximo jogo.`;
  }

  const semDado = foraDoAcervo(p);
  if (semDado) return falaSemDado(semDado, timeAlvo, db, eu);

  if (querPassado(p)) {
    const ult = falaUltimos(db, timeAlvo, extra);
    if (ult) return ult;
    return `Ainda não tenho resultado fechado do ${timeAlvo} na janela que eu acompanho.`;
  }

  if (querLider(p) && (!liga || liga.local || p.includes("tabela") || p.includes("brasileirao"))) {
    const lista = (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao);
    if (lista.length) {
      const top = lista[0];
      const vice = lista[1];
      const dif = vice ? ` ${top.pontos - vice.pontos} na frente do ${vice.time}.` : "";
      return `Líder do Brasileirão: ${top.time}, ${top.pontos} pontos em ${top.jogos} jogos.${dif}`;
    }
  }

  if (querProximos(pergunta)) {
    return falaProximos(eu, db, det, extra, liga, jogosLiga, agendaPack, pergunta);
  }

  if (liga && (!det.explicito || fraseSoLiga(pergunta, liga))) {
    return falaLiga(db, liga, jogosLiga, eu, tabelaLiga);
  }

  const querTabela = p.includes("tabela") || p.includes("brasileirao") || !!liga || p.includes("classificac") || p.includes("posicao") || p.includes("lugar") || (p.includes("ponto") && !p.includes("post"));
  const querRankingSite = (p.includes("ranking") || ((p.includes("quem esta na frente") || p.includes("quem ta na frente")) && !querTabela) || (p.includes("mais") && p.includes("torcedor"))) && !p.includes("brasileirao") && !p.includes("tabela");
  const querTorcida = p.includes("falando") || p.includes("comentario") || p.includes("post") || p.includes("feed");
  const querJogo = p.includes("jogo") || p.includes("joga") || p.includes("partida") || p.includes("placar") || p.includes("resultado") || p.includes("rodada") || p.includes("agenda") || p.includes("proxim");
  const mencionouHoje = p.includes("hoje") || p.includes("agora") || /(^|\s)hj(\s|$)/.test(p);
  const querJogosDeHoje = querJogo || (mencionouHoje && (det.explicito || p.includes("quais") || p.includes("agenda") || p.includes("tem hoje")));
  const listaGeralHoje = !det.explicito && (p.includes("quais") || (p.includes("jogo") && mencionouHoje && !p.includes("meu") && !p.includes("joga")));

  if (listaGeralHoje && (p.includes("quais") || (p.includes("jogo") && mencionouHoje))) {
    if (jogosHoje.length) return "Jogos de hoje:\n" + jogosHoje.slice(0, 10).map(linhaJogo).join("\n");
    const vem = agendaFutura(db).filter((j) => j.data !== hoje()).slice(0, 5);
    if (!vem.length) return "Hoje não tem jogo na cobertura e a agenda ainda não carregou.";
    return "Hoje não rola jogo. O que vem primeiro:\n" + vem.map(linhaJogo).join("\n");
  }

  if (!local && (querJogo || querTabela || mencionouHoje || (det.explicito && det.origem !== "local"))) {
    const texto = falaExterna(extra, mencionouHoje || querJogo);
    if (texto) return texto;
    if (det.explicito) {
      return `Não achei o ${timeAlvo} agora.`;
    }
  }

  if (querTabela) {
    if (p.includes("lider") || ((p.includes("quem") || p.includes("primeiro")) && (p.includes("frente") || p.includes("lider")))) {
      const top = (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao)[0];
      if (!top) return "Ainda não tem tabela cadastrada.";
      return `Líder do Brasileirão: ${top.time}, ${top.posicao}º com ${top.pontos} pontos.`;
    }
    if (local) return falaTabela(db, timeAlvo, eu);
    const texto = falaExterna(extra, false);
    if (texto) return BotVoz.temperarFatos(texto, ctxVoz, "tabela");
    return `O ${timeAlvo} não tá no Brasileirão que eu cubro. Pergunta a posição de um time da Série A ou o jogo dele.`;
  }

  const querImprensa = p.includes("noticia") || p.includes("imprensa") || p.includes("jornal") || p.includes("espn") || p.includes("uol") || p.includes("lance") || p.includes("bastidor") || p.includes("coluna") || p.includes("mercado") || p.includes("site do clube") || p.includes("oficial") || p.includes("materia") || p.includes("globo") || /(^|\s)ge(\s|$)/.test(p);
  if (querImprensa) {
    let lista = (db.noticias || []).slice().sort((a, b) => b.id - a.id);
    if (det.explicito && local) lista = lista.filter((n) => !n.time || n.time === timeAlvo);
    if (!lista.length) {
      return `Não achei matéria sobre o ${timeAlvo} no portal ainda.`;
    }
    return lista.slice(0, 2).map(linhaNoticia).join("\n");
  }

  if (querRankingSite) {
    const rank = rankingTimes(db);
    const top = rank.slice(0, 3).map((x, i) => `${i + 1}º ${x.time} (${x.torcedores} ${x.torcedores === 1 ? "torcedor" : "torcedores"})`).join(" · ");
    return `Ranking daqui: ${top}`;
  }

  if (querTorcida) {
    if (!local) return `Sem feed do ${timeAlvo} aqui.`;
    if (!postsDoTime.length) return `Ninguém do ${timeAlvo} postou ainda.`;
    const trechos = postsDoTime.slice(0, 2).map((x) => {
      const pub = postPublico(db, x);
      return `${pub.nome}: "${pub.texto}"`;
    });
    return trechos.join("\n");
  }

  if (querJogosDeHoje) {
    const lista = mencionouHoje ? jogosHoje.filter((j) => j.mandante === timeAlvo || j.visitante === timeAlvo) : jogosTime;
    if (lista.length) {
      const extraLocal = resumoLocal(db, timeAlvo);
      return extraLocal || `Jogos do ${timeAlvo}:\n` + lista.map(linhaJogo).join("\n");
    }
    const doClube = agendaFutura(db).filter((j) => clubeNoJogo(j, timeAlvo)).slice(0, 3);
    if (doClube.length) {
      const cabeca = doClube[0].data === hoje() ? `Jogo do ${timeAlvo} hoje:` : `${timeAlvo} não joga hoje. Próximo:`;
      return cabeca + "\n" + doClube.map(linhaJogo).join("\n");
    }
    const textoExt = falaExterna(extra, mencionouHoje || querJogo);
    if (textoExt) return textoExt;
    if (local) {
      return mencionouHoje ? `${timeAlvo} não joga hoje.` : `Sem jogo do ${timeAlvo} na janela dos próximos dias.`;
    }
  }

  if (p.includes("meu time") || p.includes("resumo") || (det.explicito && local && p === normaliza(timeAlvo))) {
    const pack = resumoLocal(db, timeAlvo);
    if (pack) return pack;
  }

  if (det.explicito && extra) return falaExterna(extra, false);
  if (det.explicito && local) {
    const pack = resumoLocal(db, timeAlvo);
    if (pack) return pack;
    return `Sem dado do ${timeAlvo}.`;
  }
  if (outroClube) {
    return `Não achei o ${timeAlvo}.`;
  }

  return respostaAleatoria(pergunta, eu, db);
}

// Post como o cliente vê. `eu` é opcional (visitante): sem conta, nada aparece como "meu".
function postPublico(db, p, eu) {
  const logado = !!(eu && eu.autenticado);
  const autor = db.usuarios.find((u) => u.id === p.usuarioId);
  const time = p.time || (autor && autor.time) || "";
  const nomeDe = (id) => {
    const u = db.usuarios.find((x) => x.id === id);
    return u ? u.nome : "torcedor";
  };
  const curtidas = db.curtidas.filter((c) => c.postId === p.id);
  const comentarios = db.comentarios.filter((c) => c.postId === p.id);
  return {
    id: p.id,
    usuarioId: p.usuarioId || 0,
    texto: p.texto,
    foto: p.foto ? urlMidia(p.foto) : "",
    time,
    nome: autor ? autor.nome : "torcedor",
    usuario: autor ? (autor.usuario || sanitizarUsuario(autor.nome)) : "torcedor",
    fotoAutor: autor && autor.foto ? urlMidia(autor.foto) : "",
    escudo: time ? urlEscudo(time) : "",
    seguindo: logado && !!p.usuarioId && db.seguindo.some((s) => s.de === eu.id && s.para === p.usuarioId),
    criadoEm: p.criadoEm,
    likes: curtidas.length,
    likesNomes: curtidas.slice(0, 2).map((c) => nomeDe(c.usuarioId)),
    curtiu: logado && curtidas.some((c) => c.usuarioId === eu.id),
    meu: logado && p.usuarioId === eu.id,
    comentariosN: comentarios.length,
    comentarios: comentarios.map((c) => {
      const u = db.usuarios.find((x) => x.id === c.usuarioId);
      return {
        id: c.id,
        texto: c.texto,
        nome: u ? u.nome : "torcedor",
        foto: u && u.foto ? urlMidia(u.foto) : "",
        criadoEm: c.criadoEm,
        meu: logado && (c.usuarioId === eu.id || p.usuarioId === eu.id)
      };
    })
  };
}

function envolveTime(j, time) {
  return j && time && (j.mandante === time || j.visitante === time);
}

function montarNotificacoes(db, eu) {
  const lista = [];
  const visto = new Set();
  function add(n) {
    if (!n || !n.id || visto.has(n.id)) return;
    visto.add(n.id);
    lista.push(n);
  }
  const jogosHoje = (db.jogos || []).filter((j) => j.data === hoje() && jogoAberto(j));
  for (const j of jogosHoje) {
    const meu = envolveTime(j, eu.time) || envolveTime(j, eu.feedTime);
    const vivo = j.status === "ao vivo";
    const placar = j.placarMandante == null ? "" : ` · ${j.placarMandante}x${j.placarVisitante}`;
    add({
      id: "jogo-" + (j.id || idDoJogo(j)),
      tipo: vivo ? "ao vivo" : "jogo",
      titulo: (meu ? (eu.time + " joga · ") : "") + j.mandante + " x " + j.visitante + placar,
      texto: (j.horario || "") + (j.competicao ? " · " + j.competicao : "") + (vivo ? " · bola rolando" : ""),
      quando: vivo ? "agora" : "hoje",
      href: "/jogo.html?id=" + encodeURIComponent(idDoJogo(j))
    });
  }
  const prox = agendaFutura(db)
    .filter((j) => (clubeNoJogo(j, eu.time) || clubeNoJogo(j, eu.feedTime)) && String(j.data || "") >= hoje() && j.status !== "encerrado")
    .slice(0, 4);
  for (const j of prox) {
    if (j.data === hoje()) continue;
    add({
      id: "prox-" + idDoJogo(j),
      tipo: "agenda",
      titulo: "Próximo · " + j.mandante + " x " + j.visitante,
      texto: linhaJogo(j),
      quando: j.data === hoje() ? "hoje" : "agenda",
      href: "/jogo.html?id=" + encodeURIComponent(idDoJogo(j))
    });
  }
  for (const time of [eu.time, eu.feedTime].filter((t, i, a) => t && a.indexOf(t) === i)) {
    const ult = ultimosDoTime(db, time, 1)[0];
    if (!ult) continue;
    add({
      id: "ult-" + time + "-" + idDoJogo(ult),
      tipo: "resultado",
      titulo: "Último do " + time,
      texto: linhaJogo(ult),
      quando: "resultado",
      href: "/jogo.html?id=" + encodeURIComponent(idDoJogo(ult))
    });
  }
  const noticias = (db.noticias || []).filter((n) => n.time === eu.time || n.time === eu.feedTime || !n.time).slice(0, 8);
  for (const n of noticias) {
    add({
      id: "news-" + n.id,
      tipo: "noticia",
      titulo: n.titulo,
      texto: encurtar(n.resumo, 140),
      quando: n.time || "cobertura",
      href: n.url || "/portal.html"
    });
  }
  const tab = (db.tabela || []).find((x) => x.time === eu.time);
  if (tab) {
    add({
      id: "tab-" + eu.time,
      tipo: "tabela",
      titulo: eu.time + " é " + tab.posicao + "º no Brasileirão",
      texto: tab.pontos + " pts · " + (tab.jogos || "?") + " jogos",
      quando: "classificação",
      href: "/jogos.html"
    });
  }
  const rank = rankingTimes(db);
  const meuRank = rank.findIndex((x) => x.time === eu.time) + 1;
  if (meuRank) {
    add({
      id: "rank",
      tipo: "ranking",
      titulo: eu.time + " é " + meuRank + "º na torcida da casa",
      texto: "Quem some no meio da semana não é nação.",
      quando: "comunidade",
      href: "/ranking.html"
    });
  }
  const meus = (db.posts || []).filter((p) => p.usuarioId === eu.id);
  let likes = 0;
  let coms = 0;
  for (const p of meus) {
    likes += (db.curtidas || []).filter((c) => c.postId === p.id && c.usuarioId !== eu.id).length;
    coms += (db.comentarios || []).filter((c) => c.postId === p.id && c.usuarioId !== eu.id).length;
  }
  if (likes) add({ id: "likes", tipo: "social", titulo: likes + " curtida(s) na sua arquibancada", texto: "O feed tá reagindo ao que você soltou.", quando: "nação", href: "/feed.html#perfil" });
  if (coms) add({ id: "coms", tipo: "social", titulo: coms + " comentário(s) nos seus posts", texto: "Entra no feed e responde a nação.", quando: "nação", href: "/feed.html" });
  const seguidores = (db.seguindo || []).filter((s) => s.para === eu.id).length;
  const seguindo = (db.seguindo || []).filter((s) => s.de === eu.id).length;
  if (seguidores) add({ id: "segs", tipo: "social", titulo: seguidores + " pessoa(s) te seguem", texto: seguindo ? "Você segue " + seguindo + "." : "A nação chegou na sua conta.", quando: "nação", href: "/feed.html#clube" });
  add({
    id: "chat",
    tipo: "assistente",
    titulo: "Pergunta pro bot da torcida",
    texto: "Técnico, desfalque, próximo jogo, palpite — manda na língua da arquibancada.",
    quando: "sempre",
    href: "/chatbot.html"
  });
  return lista.slice(0, 28);
}

// "Resumo do dia" do clube do usuário (RF22/RF23): jogos de hoje, tabela, movimento da torcida e imprensa.
function resumoDoDia(db, eu) {
  const time = eu.time;
  const hojeStr = hoje();
  const agenda = agendaFutura(db).filter((j) => clubeNoJogo(j, time));
  const jogosHoje = agenda.filter((j) => j.data === hojeStr);
  const proximo = agenda.find((j) => String(j.data) > hojeStr) || null;
  const tab = (db.tabela || []).find((x) => x.time === time) || null;
  const postsDoTime = (db.posts || []).filter((p) => p.time === time);
  const postsHoje = postsDoTime.filter((p) => dataBrt(p.criadoEm) === hojeStr).length;
  const noticia = (db.noticias || [])
    .filter((n) => n.time === time)
    .sort((a, b) => b.id - a.id)[0]
    || (db.noticias || []).filter((n) => !n.time).sort((a, b) => b.id - a.id)[0]
    || null;

  const partes = [];
  if (tab) partes.push(`${time} está em ${tab.posicao}º no Brasileirão, com ${tab.pontos} pontos em ${tab.jogos} jogos.`);
  if (jogosHoje.length) {
    partes.push("Hoje: " + jogosHoje.map(linhaJogo).join(" · ") + ".");
  } else {
    partes.push(`Hoje o ${time} não tem jogo cadastrado.` + (proximo ? ` Próximo: ${linhaJogo(proximo)}.` : ""));
  }
  if (postsHoje) partes.push(`Hoje a torcida já soltou ${postsHoje} post${postsHoje === 1 ? "" : "s"}.`);
  else if (postsDoTime.length) partes.push(`A torcida já soltou ${postsDoTime.length} post${postsDoTime.length === 1 ? "" : "s"}.`);
  if (noticia) partes.push(`Na imprensa: “${noticia.titulo}”.`);

  const lite = (j) => jogoResumido(marcarAgenda(db, j, eu, grupoDoJogo(j)));
  return {
    time,
    escudo: urlEscudo(time),
    data: hojeStr,
    texto: partes.join(" "),
    jogosHoje: jogosHoje.map(lite),
    proximo: proximo ? lite(proximo) : null,
    tabela: tab,
    posts: { total: postsDoTime.length, hoje: postsHoje },
    noticia: noticia ? { titulo: noticia.titulo, url: noticia.url || metaFonte(noticia.fonte, noticia.time).url, fonteNome: metaFonte(noticia.fonte, noticia.time).nome } : null
  };
}

function montarNacao(db, eu) {
  const logado = !!eu.autenticado;
  const posts = (db.posts || []).slice().sort((a, b) => b.id - a.id).slice(0, 60).map((p) => postPublico(db, p, eu));
  const meusPosts = logado ? (db.posts || []).filter((p) => p.usuarioId === eu.id) : [];
  const meusIds = new Set(meusPosts.map((p) => p.id));
  const likesRecebidos = (db.curtidas || []).filter((c) => meusIds.has(c.postId) && c.usuarioId !== eu.id).length;
  const euUser = logado ? (db.usuarios || []).find((x) => x.id === eu.id) : null;

  const vistos = new Set();
  const pessoas = [];
  for (const p of posts) {
    if (!p.usuarioId || p.meu || vistos.has(p.usuarioId)) continue;
    vistos.add(p.usuarioId);
    pessoas.push({
      usuarioId: p.usuarioId, nome: p.nome, usuario: p.usuario, foto: p.fotoAutor || "",
      time: p.time, escudo: p.escudo, seguindo: !!p.seguindo
    });
    if (pessoas.length >= 12) break;
  }

  const prox = universoJogos(db)
    .filter((j) => clubeNoJogo(j, eu.time) && String(j.data || "") >= hoje() && j.status !== "encerrado")
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.horario || "").localeCompare(String(b.horario || "")))[0] || null;
  const ultimos = ultimosDoTime(db, eu.time, 5);

  return {
    logado,
    eu: {
      nome: eu.nome,
      usuario: eu.usuario || sanitizarUsuario(eu.nome),
      foto: fotoPublica(euUser || eu),
      time: eu.time,
      feedTime: eu.feedTime || eu.time,
      escudo: urlEscudo(eu.time),
      convidado: !!eu.convidado
    },
    tema: temaDoTime(eu.time, eu.pais),
    resumo: resumoDoDia(db, eu),
    perfil: {
      posts: meusPosts.length,
      curtidas: likesRecebidos,
      seguindo: logado ? (db.seguindo || []).filter((s) => s.de === eu.id).length : 0,
      seguidores: logado ? (db.seguindo || []).filter((s) => s.para === eu.id).length : 0
    },
    casa: {
      time: eu.time,
      escudo: urlEscudo(eu.time),
      tabela: (db.tabela || []).find((x) => x.time === eu.time) || null,
      forma: ultimos.map((j) => j.letra).join(" "),
      proximo: prox ? {
        idJogo: idDoJogo(prox),
        mandante: prox.mandante,
        visitante: prox.visitante,
        data: prox.data,
        horario: prox.horario,
        competicao: prox.competicao || "",
        linha: linhaJogo(prox)
      } : null
    },
    posts,
    pessoas,
    mosaico: montarMosaico(db, eu, posts),
    timeline: montarTimeline(db, eu, posts)
  };
}

function fotoLocalOk(url) {
  const s = String(url || "");
  if (!s.startsWith("/fotos/")) return true;
  try {
    const full = path.join(DIR_FOTOS, path.basename(s));
    return full.startsWith(DIR_FOTOS) && fs.existsSync(full) && fs.statSync(full).size > 2000;
  } catch {
    return false;
  }
}

function fotoReal(url) {
  const s = String(url || "");
  if (!s) return false;
  if (s.startsWith("/img/midia")) return true;
  if (s.startsWith("/fotos/")) return fotoLocalOk(s);
  if (/^https?:\/\//i.test(s)) {
    // hosts que costumam bloquear hotlink / devolver lixo
    if (/gazetaesportiva\.com/i.test(s)) return false;
    return true;
  }
  return false;
}

function fotoGrade(url) {
  const s = String(url || "");
  if (!fotoReal(s)) return "";
  if (s.startsWith("/fotos/") || s.startsWith("/img/")) return s;
  return urlMidia(s);
}

const FOTOS_GRADE_RESERVA = [
  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1606925797300-0b35e9d1794b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=800&q=80"
];

function montarMosaico(db, eu, posts) {
  const tiles = [];
  const visto = new Set();
  const push = (t) => {
    if (!t || !t.id || visto.has(t.id)) return;
    const foto = fotoGrade(t.foto);
    if (!foto) return;
    visto.add(t.id);
    tiles.push(Object.assign({}, t, { foto }));
  };

  for (const p of (posts || []).filter((x) => fotoReal(x.foto))) {
    push({
      id: "post-" + p.id,
      tipo: "post",
      titulo: (p.texto || p.nome || "").slice(0, 90),
      foto: p.foto,
      href: "#p-" + p.id,
      video: false
    });
  }

  const news = (db.noticias || []).slice().sort((a, b) => Number(b.id) - Number(a.id));
  for (const n of news) {
    if (tiles.length >= 36) break;
    push({
      id: "news-" + n.id,
      tipo: "noticia",
      titulo: String(n.titulo || "").slice(0, 90),
      foto: n.imagem,
      href: n.url || "/portal.html",
      video: false
    });
  }

  for (const j of (db.jogos || []).filter((x) => x.data === hoje() && jogoAberto(x))) {
    const foto = fotoDoClube(db, j.mandante) || fotoDoClube(db, j.visitante) || "";
    const vivo = j.status === "ao vivo";
    const placar = j.placarMandante != null ? `${j.placarMandante}–${j.placarVisitante}` : "x";
    push({
      id: "jogo-" + idDoJogo(j),
      tipo: vivo ? "ao-vivo" : "jogo",
      titulo: `${j.mandante} ${placar} ${j.visitante}`,
      foto,
      href: "/jogo.html?id=" + encodeURIComponent(idDoJogo(j)),
      video: vivo
    });
  }

  // sem conteúdo suficiente (instalação nova, sem rede): completa a grade com fotos de estádio e bola
  let i = 0;
  while (tiles.length < 6 && i < FOTOS_GRADE_RESERVA.length) {
    push({
      id: "reserva-" + i,
      tipo: "cobertura",
      titulo: "Nação Torcida",
      foto: FOTOS_GRADE_RESERVA[i],
      href: "/portal.html",
      video: false
    });
    i += 1;
  }

  return tiles.slice(0, 36);
}

// Linha do tempo da Nação: jogos ao vivo no topo e, depois, os posts com uma notícia a cada três posts.
function montarTimeline(db, eu, posts) {
  const itens = [];
  for (const j of (db.jogos || []).filter((x) => x.data === hoje() && x.status === "ao vivo")) {
    const placar = j.placarMandante != null ? `${j.placarMandante}–${j.placarVisitante}` : "x";
    itens.push({
      kind: "gol",
      id: "live-" + idDoJogo(j),
      titulo: "AO VIVO",
      texto: `${j.mandante} ${placar} ${j.visitante}`,
      sub: j.competicao || "bola rolando",
      mandante: j.mandante,
      visitante: j.visitante,
      placar: j.placarMandante != null ? placar : "",
      minuto: j.minuto || "",
      escudoCasa: urlEscudo(j.mandante),
      escudoFora: urlEscudo(j.visitante),
      href: "/jogo.html?id=" + encodeURIComponent(idDoJogo(j))
    });
  }
  const noticias = (db.noticias || [])
    .filter((x) => x.imagem)
    .sort((a, b) => b.id - a.id)
    .slice(0, 8)
    .map((n) => {
      const f = metaFonte(n.fonte, n.time);
      return {
        kind: "noticia",
        id: n.id,
        titulo: n.titulo,
        resumo: n.resumo,
        imagem: urlMidia(n.imagem),
        time: n.time,
        fonteNome: f.nome,
        url: n.url || f.url,
        escudo: n.time ? urlEscudo(n.time) : "",
        publicadoEm: n.publicadoEm || ""
      };
    });
  let ni = 0;
  (posts || []).forEach((p, i) => {
    itens.push({ kind: "post", id: p.id });
    if ((i + 1) % 3 === 0 && ni < noticias.length) itens.push(noticias[ni++]);
  });
  while (ni < noticias.length && itens.filter((x) => x.kind === "noticia").length < 3) itens.push(noticias[ni++]);
  return itens;
}

function contextoBanco(eu, db, det, extra, extraCtx) {
  const jogoPublico = (j) => ({
    mandante: j.mandante,
    visitante: j.visitante,
    data: j.data,
    horario: j.horario,
    placar: j.placarMandante == null ? null : `${j.placarMandante} x ${j.placarVisitante}`,
    competicao: j.competicao || null
  });
  const timeAlvo = (det && det.nome) || eu.time;
  const posts = db.posts
    .filter((p) => p.time === timeAlvo)
    .sort((a, b) => b.id - a.id)
    .slice(0, 8)
    .map((p) => {
      const pub = postPublico(db, p);
      return {
        autor: pub.nome,
        texto: pub.texto,
        likes: pub.likes,
        comentarios: (pub.comentarios || []).slice(0, 4).map((c) => `${c.nome}: ${c.texto}`)
      };
    });
  return {
    dataHoje: hoje(),
    torcedor: { nome: eu.nome, timeDoCoracao: eu.time },
    timeDaPergunta: timeAlvo,
    respondaSobreOTimeDaPergunta: true,
    naoTroquePeloTimeDoCoracao: !!(det && det.explicito),
    jogosDeHoje: universoJogos(db).filter((j) => j.data === hoje()).slice(0, 16).map(jogoPublico),
    proximosJogosReais: agendaFutura(db).slice(0, 25).map(jogoPublico),
    proximosDoTimePerguntado: agendaFutura(db).filter((j) => clubeNoJogo(j, timeAlvo)).slice(0, 5).map(jogoPublico),
    resultadosJaConfirmados: ultimosDoTime(db, timeAlvo, 6).map(jogoPublico),
    confrontoEncontrado: extraCtx && extraCtx.confronto ? jogoPublico(extraCtx.confronto) : null,
    desfalquesConfirmados: (extraCtx && extraCtx.desfalques) || [],
    escalacaoConfirmada: (extraCtx && extraCtx.escalacao) || null,
    fichaDoClube: (() => {
      const f = fichaCache(db, timeAlvo);
      return { estadio: f.estadio || "", tecnico: f.tecnico || "", capacidade: f.capacidade || "" };
    })(),
    postsEComentariosDoTime: posts,
    rankingTorcida: rankingTimes(db).slice(0, 10),
    tabelaBrasileirao: (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao).map((x) => ({
      posicao: x.posicao,
      time: x.time,
      pontos: x.pontos,
      jogos: x.jogos
    })),
    historicoRecente: (extraCtx && extraCtx.historico) || [],
    noticiasDoPortal: (db.noticias || []).slice().sort((a, b) => b.id - a.id).slice(0, 10).map((n) => ({
      titulo: n.titulo,
      resumo: limpaTextoChat(n.resumo),
      time: n.time
    })),
    fichaDoTime: extra ? {
      nome: extra.nome,
      situacao: extra.situacao,
      record: extra.record,
      jogosJaDisputadosNoPassado: (extra.jogos || [])
        .filter((j) => String(j.data || "") < hoje())
        .slice(-6)
        .map((j) => ({ ...jogoPublico(j), aviso: "JÁ ACONTECEU, não anuncie como jogo futuro" }))
    } : null,
    proximosDaLiga: extraCtx && extraCtx.jogosLiga ? extraCtx.jogosLiga.slice(0, 10).map(jogoPublico) : [],
    proximosCopa: extraCtx && extraCtx.copa ? extraCtx.copa.slice(0, 8).map(jogoPublico) : []
  };
}

function respostaFactual(texto) {
  const t = String(texto || "");
  if (!t) return false;
  if (/^(Jogos de hoje|Próximos do|Hoje:|Hoje não|Líder do Brasileirão|Ranking daqui|📊)/i.test(t)) return true;
  // Já saiu com voz de bancada / farpa — não deixa a IA amaciar
  if (/tô torcendo|eu tô torcendo|Não me bate|cê perguntou de novo|Sou Bot de torcedor|CLÁSSICO,|Dois mais dois|Dez mais dez|Cem mais um|Dá \d+,|Bot de futebol/i.test(t)) return true;
  const linhasJogo = t.split("\n").filter((l) => / x .*·/.test(l)).length;
  return linhasJogo >= 2;
}

async function redigirComIA(pergunta, contexto, rascunho) {
  if (respostaFactual(rascunho)) return null;
  const system = [
    BotVoz.promptSistemaIA(),
    "",
    "APELIDOS (só estes): Corinthians=timão/coringão, Flamengo=mengão/rubro-negro, Palmeiras=verdão/porco, Santos=peixe, Atlético-MG=galo, Botafogo=fogão/glorioso, São Paulo=tricolor paulista, Grêmio=tricolor gaúcho, Cruzeiro=raposa, Vasco=gigante da colina, Internacional=colorado, Fluminense=tricolor carioca.",
    "",
    "DADOS — não se quebra:",
    "- Data, horário, placar, confronto, posição e pontos só saem do RASCUNHO ou do JSON. Copie igual.",
    "- Se o placar estiver nos dados, USE. Não diga que não tem.",
    "- Jogo futuro só se estiver em proximosJogosReais ou proximosDoTimePerguntado.",
    "- Passado fica no passado. Não inverta mando (A x B = A mandante).",
    "- Não invente escalação, contusão, contratação ou título.",
    "- Rivalidade clássica (ex.: Santos×Palmeiras) pode usar; não invente rival novo.",
    "- Se desfalques/escalação/estádio/técnico vierem no JSON, USE.",
    "",
    "PROIBIDO: markdown, asterisco, citar API/fonte/JSON, inglês, raciocínio interno, dica de aposta.",
    "Se não for futebol: zoação curta e volta pro jogo.",
    "Entregue só a resposta final."
  ].join("\n");
  const user = (rascunho ? "RASCUNHO (fatos conferidos):\n" + rascunho + "\n\n" : "")
    + "DADOS:\n" + JSON.stringify(contexto) + "\n\nPERGUNTA:\n" + pergunta;

  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const tarefas = [];
  if (groqKey) tarefas.push(chatGroq("https://api.groq.com/openai/v1/chat/completions", groqKey, MODELOS_GROQ, system, user));
  if (geminiKey) tarefas.push(chatGemini(geminiKey, system, user));
  if (openaiKey) tarefas.push(chatGroq("https://api.openai.com/v1/chat/completions", openaiKey, [process.env.AI_MODEL || "gpt-4o-mini"], system, user));
  if (!tarefas.length) return null;

  // primeira resposta boa ganha (mais rápido)
  return await new Promise((resolve) => {
    let pendentes = tarefas.length;
    let resolvido = false;
    const acabar = (val) => {
      if (resolvido) return;
      resolvido = true;
      resolve(val);
    };
    // Assunto que a IA só pode citar se estiver nos dados confirmados (rascunho ou JSON): desfalque, lesão, suspensão,
    // escalação. Instrução no prompt não bastou (apareceu "se o desfalque do verdão não pesar" sem desfalque nenhum).
    const base = normaliza(String(rascunho || "") + " " + JSON.stringify(contexto || {}));
    const ASSUNTO_SENSIVEL = /desfalque|lesao|lesionad|contus|suspens|suspenso|escalacao|departamento medico/;
    const inventaAssunto = (resp) => {
      const r = normaliza(resp);
      const m = r.match(ASSUNTO_SENSIVEL);
      if (!m) return false;
      const tem = base.includes(m[0]);
      // "desfalquesConfirmados": [] vazio no JSON não conta como dado
      const vazio = /"desfalquesconfirmados":\[\]/.test(base) && /desfalque/.test(m[0]) && !normaliza(String(rascunho || "")).includes("desfalque");
      return !tem || vazio;
    };
    for (const t of tarefas) {
      Promise.resolve(t).then((txt) => {
        const limpo = polirResposta(txt);
        if (respostaAceitavel(limpo) && !inventaAssunto(limpo)) acabar(escolherMelhorIa([limpo], rascunho));
        else if (--pendentes <= 0) acabar(null);
      }).catch(() => {
        if (--pendentes <= 0) acabar(null);
      });
    }
    setTimeout(() => acabar(null), 7000);
  });
}

const LIXO_IA = [
  /\b(can|should|must|could)\s+(mention|say|answer|reply|include|add)\b/i,
  /\bif\s+(relevant|needed|possible|asked)\b/i,
  /\b(assistant|system|user)\s*(final|:)/i,
  /\b(we|i)\s+(need|should|must|have)\s+to\b/i,
  /\b(the\s+(user|answer|question|draft)|draft|guideline|instruction)s?\b/i,
  /\banalysis\b|<\/?think>|```/i,
  /\bkeep\s+it\b|\bin\s+portuguese\b|\bper\s+the\b/i
];

function polirResposta(texto) {
  // Mantém emoji de estádio/futebol; remove só lixo invisível e markdown.
  return String(texto || "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/[*_`#]{2,}/g, "")
    .replace(/^\s*(resposta|rascunho|final)\s*:\s*/i, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, arr) => l || (i > 0 && i < arr.length - 1 && arr[i - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function respostaAceitavel(texto) {
  const t = polirResposta(texto);
  if (!t || t.length < 25) return false;
  if (LIXO_IA.some((re) => re.test(t))) return false;
  const semAcento = !/[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/.test(t);
  const palavrasPt = /\b(o|a|os|as|de|do|da|em|no|na|que|com|pra|para|tá|time|jogo|gol|torcida|pontos)\b/i.test(t);
  if (semAcento && !palavrasPt) return false;
  return true;
}

function escolherMelhorIa(textos, rascunho) {
  const limpos = textos.map(polirResposta).filter(respostaAceitavel);
  if (!limpos.length) return null;
  if (limpos.length === 1) return limpos[0];
  textos = limpos;
  const r = String(rascunho || "");
  const nomes = r.match(/[A-ZÁÉÍÓÚÃÕÂÊÔ][\wÀ-ú-]+/g) || [];
  let best = textos[0];
  let score = -999;
  for (const t of textos) {
    const low = t.toLowerCase();
    let s = 0;
    for (const n of nomes) if (n.length > 3 && low.includes(n.toLowerCase())) s += 2;
    if (t.length >= 60 && t.length <= 900) s += 2;
    if (t.length < 20) s -= 3;
    if (s > score) { score = s; best = t; }
  }
  return best;
}

const MODELOS_GROQ = (process.env.AI_MODEL ? [process.env.AI_MODEL] : [])
  .concat(["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"]);
const MODELOS_GEMINI = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
const modeloBom = {};

function ordemModelos(provedor, lista) {
  const bom = modeloBom[provedor];
  return bom ? [bom].concat(lista.filter((m) => m !== bom)) : lista;
}

async function chatGroq(url, key, modelos, system, user) {
  for (const model of ordemModelos(url, modelos)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const corpo = {
        model,
        temperature: 0.72,
        max_tokens: 380,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      };
      if (/gpt-oss/.test(model)) {
        corpo.reasoning_effort = "low";
        corpo.reasoning_format = "hidden";
      }
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(corpo),
        signal: ctrl.signal
      });
      if (!r.ok) continue;
      const d = await r.json();
      const txt = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (txt && String(txt).trim()) {
        modeloBom[url] = model;
        return String(txt).trim();
      }
    } catch { /* tenta o próximo modelo */ } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function chatGemini(key, system, user) {
  for (const model of ordemModelos("gemini", MODELOS_GEMINI)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0.72, maxOutputTokens: 380 }
          }),
          signal: ctrl.signal
        }
      );
      if (!r.ok) continue;
      const d = await r.json();
      const txt = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts
        && d.candidates[0].content.parts.map((p) => p.text).filter(Boolean).join("\n");
      if (txt && String(txt).trim()) {
        modeloBom.gemini = model;
        return String(txt).trim();
      }
    } catch { /* tenta o próximo modelo */ } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

let saudeIa = { em: 0, groq: null, gemini: null };

// Última verificação conhecida das IAs (não faz chamada nenhuma).
function estadoIa() {
  return saudeIa;
}

// Testa as IAs de verdade (gasta uma chamada pequena em cada provedor). Resultado fica 5 minutos em cache.
async function checarIa() {
  if (Date.now() - saudeIa.em < 5 * 60 * 1000) return saudeIa;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const [g, m] = await Promise.all([
    groqKey ? chatGroq("https://api.groq.com/openai/v1/chat/completions", groqKey, MODELOS_GROQ, "Responda em uma palavra.", "diga ok") : null,
    geminiKey ? chatGemini(geminiKey, "Responda em uma palavra.", "diga ok") : null
  ]);
  saudeIa = {
    em: Date.now(),
    groq: groqKey ? { ok: !!g, modelo: modeloBom["https://api.groq.com/openai/v1/chat/completions"] || null } : null,
    gemini: geminiKey ? { ok: !!m, modelo: modeloBom.gemini || null } : null
  };
  return saudeIa;
}


// ---------------------------------------------------------------- manutenção
// Limpezas e correções de dados antigos. Roda ao iniciar e de hora em hora.
// (O código antigo refazia tudo isso dentro de load(), a cada requisição.)
function manutencao() {
  const db = load();
  const hojeStr = hoje();
  let mudou = false;

  // jogos de dias passados que ficaram sem placar nunca foram acompanhados até o fim: não servem
  const jogos = (db.jogos || []).filter((j) => j.fonte === "admin" || !(String(j.data || "") < hojeStr && j.placarMandante == null));
  if (jogos.length !== db.jogos.length) { db.jogos = jogos; mudou = true; }

  // sobras da versão com dados de exemplo fixos (ids pequenos) e entidades HTML sem decodificar
  const noticias = (db.noticias || []).filter((n) => Number(n.id) > 1e9);
  if (noticias.length !== db.noticias.length) { db.noticias = noticias; mudou = true; }
  for (const n of db.noticias) {
    const titulo = decodificarEntidades(n.titulo);
    // resumos gravados antes ficaram cortados no meio da palavra
    const resumo = encurtar(decodificarEntidades(n.resumo), 200);
    if (titulo !== n.titulo || resumo !== n.resumo) { n.titulo = titulo; n.resumo = resumo; mudou = true; }
  }

  for (const u of db.usuarios) {
    if (!u.usuario) { u.usuario = usuarioLivre(db, u.nome || u.email, u.id); mudou = true; }
    if (!u.foto && u.nome && u.time) { u.foto = urlEscudo(u.time); mudou = true; }
    // contas de demonstração têm senha conhecida: não entram por login (DEMO_LOGIN=1 libera)
    if (/@torcida\.local$/i.test(u.email || "") && !u.semLogin) { u.semLogin = true; mudou = true; }
  }

  // classificação vinda da raspagem antiga (Wikipedia) está parada no tempo: força nova coleta
  if (!db.tabelaMeta || db.tabelaMeta.fonte !== "ESPN") {
    db.tabelaMeta = { ...(db.tabelaMeta || {}), puxadoEm: new Date(0).toISOString() };
    mudou = true;
  }
  // sem a tabela ESPN os dados antigos ficam apenas como último recurso
  if (!tabelaSaudavel(db.tabela)) db.tabela = [];

  if (corrigirEscudosAntigos(db)) mudou = true;

  limparPastaDeCache(DIR_MIDIA, MAX_ARQUIVOS_MIDIA, 30 * 24 * 60 * 60 * 1000);
  if (mudou) save();
}

// A tabela de ids de marcas.js antiga estava errada para muitos clubes (o id 129 era o Ceará, não o Internacional) e o
// escudo errado ficou gravado em duas partes: no endereço guardado em cada ficha de clube e nas imagens baixadas em
// data/escudos. Esta migração roda uma vez: refaz o endereço das fichas pela tabela nova e limpa a pasta de imagens
// (é só cache; cada escudo é baixado de novo, já certo, na próxima vez que alguém o pedir).
function corrigirEscudosAntigos(db) {
  if (!db.meta) db.meta = {};
  if (db.meta.escudosCorrigidosV3) return false;
  for (const ficha of Object.values(db.fichas || {})) {
    if (ficha && /media\.api-sports\.io\/football\/teams\//.test(String(ficha.escudo || ""))) {
      const certo = marcaDoClube(ficha.nome || "").logo;
      ficha.escudo = /^https?:/i.test(certo) ? certo : "";
    }
  }
  try {
    for (const arq of fs.readdirSync(DIR_ESCUDOS)) {
      try { fs.unlinkSync(path.join(DIR_ESCUDOS, arq)); } catch { /* em uso */ }
    }
  } catch { /* a pasta ainda não existe */ }
  db.meta.escudosCorrigidosV3 = true;
  return true;
}

function eventosDoPlacar() {
  return placarMemo.eventos;
}

function placarAtualizadoEm() {
  return placarMemo.em;
}

module.exports = {
  // dados e constantes
  TIMES, FONTES, ALIASES, GRUPOS_AGENDA, STOPWORDS, clientesStream,
  // utilidades
  hoje, normaliza, linhaJogo, decodificarEntidades, sanitizarUsuario, usuarioLivre, clubeOk, iaLigada, nomeBate,
  // sessão e perfil
  sessaoPublica, temaDoTime, fotoPublica, fotoPerfilOk, salvarFoto, avataresSimples, svgAvatar, elencoAvatares,
  // imagens
  urlEscudo, urlMidia, midiaAssinadaValida, midiaEmDisco, escudoEmDisco, svgDoClube, fotoGrade, fotoLocalOk,
  // jogos e agenda
  avisarStream, ordemJogo, jogoAberto, jogoResumido, jogoComMarca, marcarAgenda, grupoDoJogo, idDoJogo, chaveParData,
  universoJogos, acharJogoPorId, agendaFutura, jogosCalendario, lerCalendario, montarAgendaCompleta, ultimosDoTime,
  clubeNoJogo, mesmoPar, noticiasDoConfronto, buscaGeral, jogoDoTime,
  // coleta
  atualizarPlacaresHoje, placaresEmSegundoPlano, haJogoAgora, extrasDoPlacar, eventosDoPlacar, placarAtualizadoEm,
  sincronizarCalendario, sincronizarPortal, resultadosEmSegundoPlano, fichasEmSegundoPlano, fichasDosNomes, montarFicha, fichaCache,
  puxarAgendaExterna, resolverFixtureAf, buscarPredicaoAf, proximoJogoAf, puxarJogosLiga, puxarTabelaLiga, packElenco,
  // análise e conteúdo
  montaAnalise, metaFonte, rankingTimes, resumoDoDia, montarNacao, postPublico, montarNotificacoes,
  // chatbot
  detectarLiga, fraseSoLiga, perguntaForaDeBola, querPalpite, querProximos, querResultado, querElenco, querEstadio, querTecnico,
  timesCitados, confrontoEntre, jogoCitadoNaPergunta, acharJogoAnalise, perguntaComMemoria, detectarClube, histDo, gravarHist,
  responderChat, respostaFactual, redigirComIA, contextoBanco, checarIa, estadoIa,
  // integrações
  apiFootballLigada, usoApiFootball, footballDataLigada, sportsDbLigada, sportsDbKey,
  // manutenção
  manutencao, limparPastaDeCache
};
