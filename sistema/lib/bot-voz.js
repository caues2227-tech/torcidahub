/* Personalidade do Bot TORCIDA.: rival de bancada, farpa leve, PT-BR de arquibancada. */
"use strict";

const RIVALIDADES = {
  Santos: ["Palmeiras", "Corinthians", "São Paulo"],
  Flamengo: ["Fluminense", "Vasco", "Botafogo"],
  Palmeiras: ["Corinthians", "Santos", "São Paulo"],
  Corinthians: ["Palmeiras", "São Paulo", "Santos"],
  "São Paulo": ["Corinthians", "Palmeiras", "Santos"],
  Fluminense: ["Flamengo", "Vasco", "Botafogo"],
  Vasco: ["Flamengo", "Fluminense", "Botafogo"],
  Botafogo: ["Flamengo", "Fluminense", "Vasco"],
  Grêmio: ["Internacional"],
  Internacional: ["Grêmio"],
  Cruzeiro: ["Atlético-MG"],
  "Atlético-MG": ["Cruzeiro"],
  Bahia: ["Vitória"],
  Vitória: ["Bahia"]
};

const FARPAS_TIME_BEM = [
  "Ah, {clube} tá voando, né? Enquanto isso, tem time lutando pra não cair. Mas parabéns, {nome}. Aproveita: hoje cê tá no topo, amanhã cê tá chorando. ⚽",
  "{pos}ª posição, {pts} pontos. Tá, tá bom. Mas cê lembra da última vez que o {clube} tava nessa? Ah, esquece. Bora pro próximo. 🏆",
  "Lá em cima, {nome}. Respeito. Mas vou ser sincero: eu tô torcendo CONTRA você no próximo clássico. Não me odeia. 🔥",
  "G4 / ponta de cima, Libertadores no radar. Tá, você ganhou. Mas o {rival} tá no encalço e futebol brasileiro é caótico assim. ⚽",
  "Momento bom, hein? Impressionante. Só não esquece: um tropeço e a torcida vira. Aproveita a festa, {nome}. 🎉"
];

const FARPAS_TIME_MAL = [
  "Tá, {nome}. {clube} na {pos}ª com {pts} pontos. Zona batendo na porta. Mas ainda tem bola pra jogar. Levanta a cabeça. 🐟",
  "Sequência ruim dói, eu sei. Mas o {clube} já saiu de buraco pior. Não desiste agora. 💪",
  "Zona do rebaixamento, {nome}. Não é legal. Lado bom: pelo menos tem gente sofrendo mais que você. 😅",
  "{pts} pontos. Não é bonito. Mas futebol se joga até o apito final. Bora. ⚽",
  "Cê tá sofrendo, eu sei. O {clube} sempre volta — é DNA. Aguenta a tempestade. 🙏"
];

const FARPAS_CLASSICO = [
  "🔥 CLÁSSICO, {nome}! {clube} x {rival}. E vou ser honesto: eu tô torcendo pro {rival}. Não me bate. Todo mundo tem um rival, e hoje o meu é o seu. ⚔️",
  "Clássico chegando, {nome}. {clube} x {rival}. Na tabela: você {meu_pos}ª, eles {rival_pos}ª. {contexto_tabela} Em clássico, tabela não vale nada. Vale raiva. 🔥",
  "Dia de clássico, {nome}. Cê tá nervoso, eu sei. Eu também tô — do outro lado. Torcendo pro {rival}. Me perdoa depois. ⚔️⚽",
  "{clube} x {rival}. O clássico dos clássicos. {frase_local} E eu tô aqui, torcendo contra você. Com carinho. (Mentira.) 🔥",
  "Clássico, {nome}. {meu_pos}ª vs {rival_pos}ª. Em clássico, posição é papel. Quem vence é quem quer mais. E hoje… eu quero mais que você. 😏"
];

const FARPAS_MATEMATICA = {
  "2+2": "Dois mais dois dá quatro, {nome}. Igual a pontuação que o {clube} ainda não tem na tabela. Mas vai ter. Um dia. ⚽",
  "10+10": "Dez mais dez dá vinte. Vinte pontos. Faz as contas com a zona e o {clube}. 📊",
  "100+1": "Cem mais um dá cento e um. E ainda a gente sofre com o {clube}. É assim mesmo. 💔",
  default: "Dá {resultado}, {nome}. Mas cê perguntou pro Bot de futebol. Cê podia ter perguntado quanto falta pro {clube} subir — aí sim era conversa. ⚽"
};

const FALLBACKS = [
  "Hmm, não achei isso na minha base, {nome}. Se for sobre o {clube}, tabela, jogos ou rival, eu respondo. Tenta de novo? ⚽",
  "Essa eu não sei, {nome}. Sou Bot de torcedor, não de Google. Pergunta sobre o {clube}, a tabela ou o clássico. Aí eu brilho. ✨",
  "Não entendi, {nome}. Tabela? Próximos jogos? Rival? Rebaixamento? Manda mais específico. ⚽",
  "Blá blá blá, {nome}. Eu sou o Bot da nação, não assistente genérico. Fala do {clube} que a gente conversa. 🔥",
  "Essa me pegou de surpresa, {nome}. Pergunta do {clube}, da tabela ou do clássico que eu volto ao normal. 😄"
];

const SAUDACOES = [
  "Fala, {nome}! ⚽ Pronto pra mais uma rodada de sofrimento (ou alegria) com o {clube}? Tabela, jogos, rival, rebaixamento — eu respondo. Com farpa, claro.",
  "E aí, {nome}! 🏟️ O {clube} tá na {pos}ª com {pts} pontos. {frase_contexto}. Quer saber mais? Manda a pergunta.",
  "Bem-vindo de volta, {nome}! 🔥 O {clube} tá {contexto_posicao}. Próximo: {proximo_jogo}. Quer detalhes… ou quer que eu te provoque?"
];

function pick(arr) {
  if (!arr || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function primeiroNome(nome) {
  const n = String(nome || "parceiro").trim();
  return n.split(/\s+/)[0] || "parceiro";
}

function rivalDe(clube) {
  const lista = RIVALIDADES[clube] || [];
  return lista[0] || null;
}

function gerarContextoTabela(ctx) {
  if (ctx.rivalPosicao == null || ctx.posicao == null) return "Em clássico, tabela é papel.";
  if (ctx.posicao < ctx.rivalPosicao) {
    return `Você tá ${ctx.rivalPosicao - ctx.posicao} posição(ões) na frente. Mas em clássico isso não vale nada.`;
  }
  if (ctx.posicao > ctx.rivalPosicao) {
    return `Eles tão ${ctx.posicao - ctx.rivalPosicao} posição(ões) na frente. Cê precisa vencer pra encostar.`;
  }
  return "Empatados na tabela. Isso complica TUDO.";
}

function gerarFraseContexto(ctx) {
  if (ctx.posicao == null) return "Sem tabela carregada ainda";
  if (ctx.posicao <= 4) return "No G4, sonhando com a Libertadores";
  if (ctx.posicao >= (ctx.zonaReb || 17)) return "Na zona do rebaixamento, sofrendo";
  if (ctx.posicao <= 8) return "Brigando pela Sul-Americana";
  return "No meio da tabela, nem pro céu nem pro inferno";
}

function gerarContextoPosicao(ctx) {
  if (ctx.posicao == null) return "na briga do campeonato";
  if (ctx.posicao <= 4) return "voando no G4";
  if (ctx.posicao >= (ctx.zonaReb || 17)) return "sofrendo na zona do rebaixamento";
  return "no meio da tabela, lutando";
}

function gerarProximoJogo(ctx) {
  if (!ctx.proximoJogo) return "nenhum agendado";
  const j = ctx.proximoJogo;
  const adv = j.adversario || j.mandante || j.visitante || "?";
  const data = j.dataFmt || j.data || "";
  const hora = j.hora || j.horario || "";
  return `${adv}${data ? " · " + data : ""}${hora ? " " + hora : ""}`;
}

function personalizarResposta(template, ctx) {
  const sub = {
    "{nome}": primeiroNome(ctx.nome),
    "{clube}": ctx.clube || "seu clube",
    "{rival}": ctx.rival || "o rival",
    "{pos}": ctx.posicao != null ? String(ctx.posicao) : "?",
    "{pts}": ctx.pontos != null ? String(ctx.pontos) : "?",
    "{jogos}": ctx.jogosRestantes != null ? String(ctx.jogosRestantes) : "?",
    "{data}": ctx.dataJogo || "",
    "{hora}": ctx.horaJogo || "",
    "{local}": ctx.local === "casa" ? "EM CASA" : (ctx.local === "fora" ? "FORA" : ""),
    "{frase_local}": ctx.local === "casa"
      ? "Seu estádio, sua torcida, sua vantagem."
      : (ctx.local === "fora" ? "Campo adversário, torcida contra. Vai doer." : ""),
    "{meu_pos}": ctx.posicao != null ? String(ctx.posicao) : "?",
    "{rival_pos}": ctx.rivalPosicao != null ? String(ctx.rivalPosicao) : "?",
    "{diff_pos}": (ctx.posicao != null && ctx.rivalPosicao != null)
      ? String(Math.abs(ctx.posicao - ctx.rivalPosicao))
      : "?",
    "{contexto_tabela}": gerarContextoTabela(ctx),
    "{seq}": ctx.sequenciaDerrotas != null ? String(ctx.sequenciaDerrotas) : "umas",
    "{media}": ctx.media != null ? String(ctx.media) : "?",
    "{necessarios}": ctx.pontosNecessarios != null ? String(ctx.pontosNecessarios) : "?",
    "{resultado}": ctx.resultadoMatematica != null ? String(ctx.resultadoMatematica) : "?",
    "{diff}": ctx.diferencaPontos != null ? String(ctx.diferencaPontos) : "?",
    "{frase_contexto}": gerarFraseContexto(ctx),
    "{contexto_posicao}": gerarContextoPosicao(ctx),
    "{proximo_jogo}": gerarProximoJogo(ctx),
    "{rodada}": ctx.rodada != null ? String(ctx.rodada) : "?"
  };
  let out = String(template || "");
  Object.keys(sub).forEach((k) => {
    out = out.split(k).join(sub[k]);
  });
  return out.replace(/\s{2,}/g, " ").trim();
}

function montarContexto(eu, db, timeAlvo, pergunta, extras) {
  const clube = timeAlvo || (eu && eu.time) || "Santos";
  const lista = ((db && db.tabela) || []).slice().sort((a, b) => a.posicao - b.posicao);
  const linha = lista.find((x) => String(x.time || "").toLowerCase() === String(clube).toLowerCase());
  const rival = rivalDe(clube);
  const rivalLinha = rival
    ? lista.find((x) => String(x.time || "").toLowerCase() === String(rival).toLowerCase())
    : null;
  const zonaReb = Math.max(17, lista.length - 3);
  const zonaSula = 6;
  const msg = String(pergunta || "").toLowerCase();
  const isClassico = /cl[aá]ssico|rival|derbi|arquirrival|jogo.*contra|quem (e|é) meu rival/.test(msg)
    || (rival && msg.includes(String(rival).toLowerCase()) && /x|vs|contra/.test(msg));

  let proximoJogo = null;
  const agenda = extras && extras.proximo;
  if (agenda) {
    const casa = String(agenda.mandante || "") === clube;
    proximoJogo = {
      adversario: casa ? agenda.visitante : agenda.mandante,
      data: agenda.data,
      dataFmt: agenda.data ? String(agenda.data).split("-").reverse().join("/") : "",
      hora: agenda.horario || "",
      local: casa ? "casa" : "fora"
    };
  }

  const pos = linha ? linha.posicao : null;
  const pts = linha ? linha.pontos : null;
  const jogos = linha ? linha.jogos : null;
  const totalRodadas = 38;
  const jogosRestantes = jogos != null ? Math.max(0, totalRodadas - jogos) : null;
  const media = (pts != null && jogos) ? (pts / Math.max(1, jogos)).toFixed(1) : null;

  let pontosNecessarios = null;
  if (linha && lista.length >= zonaReb) {
    const limite = lista[zonaReb - 1] ? lista[zonaReb - 1].pontos : 0;
    pontosNecessarios = Math.max(0, limite - pts + 1);
  }

  return {
    nome: (eu && eu.nome) || "parceiro",
    clube,
    rival,
    posicao: pos,
    pontos: pts,
    jogosRestantes,
    jogosJogados: jogos,
    zonaReb,
    sequenciaDerrotas: extras && extras.sequenciaDerrotas,
    isClassico,
    timeBem: pos != null && pos <= zonaSula,
    timeMal: pos != null && pos >= zonaReb,
    proximoJogo,
    rivalPosicao: rivalLinha ? rivalLinha.posicao : null,
    diferencaPontos: rivalLinha && pts != null ? Math.abs(pts - rivalLinha.pontos) : 0,
    pontosNecessarios,
    media,
    local: proximoJogo ? proximoJogo.local : null,
    dataJogo: proximoJogo ? proximoJogo.dataFmt : "",
    horaJogo: proximoJogo ? proximoJogo.hora : "",
    resultadoMatematica: extras && extras.resultadoMatematica,
    memoria: extras && extras.memoria
  };
}

function escolherFarpa(ctx) {
  if (ctx.isClassico && ctx.rival) return personalizarResposta(pick(FARPAS_CLASSICO), ctx);
  if (ctx.timeBem && Math.random() < 0.7) return personalizarResposta(pick(FARPAS_TIME_BEM), ctx);
  if (ctx.timeMal && Math.random() < 0.7) return personalizarResposta(pick(FARPAS_TIME_MAL), ctx);
  return personalizarResposta(pick(FALLBACKS), ctx);
}

function saudacaoBot(ctx) {
  return personalizarResposta(pick(SAUDACOES), ctx);
}

function fallbackBot(ctx) {
  let txt = personalizarResposta(pick(FALLBACKS), ctx);
  if (ctx.memoria && ctx.memoria.repetiu) {
    txt = `Cê perguntou de novo, ${primeiroNome(ctx.nome)}? ` + txt;
  }
  return txt;
}

function farpaMatematica(expressao, resultado, ctx) {
  const key = String(expressao || "").replace(/\s+/g, "");
  const tpl = FARPAS_MATEMATICA[key] || FARPAS_MATEMATICA.default;
  return personalizarResposta(tpl, Object.assign({}, ctx, { resultadoMatematica: resultado }));
}

function farpaClassico(ctx) {
  return personalizarResposta(pick(FARPAS_CLASSICO), ctx);
}

function temperarFatos(rascunho, ctx, tipo) {
  const base = String(rascunho || "").trim();
  if (!base) return escolherFarpa(ctx);
  let gancho = "";
  if (tipo === "tabela") {
    if (ctx.timeBem) gancho = pick([
      `Ah, {nome}, tá bom pra você. Aproveita. ⚽`,
      `Meio que tá voando, né? Não se acostuma. 🔥`,
      `Tá. Respeito. Mas no clássico eu torço contra. ⚔️`
    ]);
    else if (ctx.timeMal) gancho = pick([
      `Tá, {nome}. Dói. Mas ainda tem bola. 🐟`,
      `Zona batendo. Cê sabia que ia doer. Aguenta. 🙏`,
      `Não é bonito. Mas o {clube} já voltou de pior. 💪`
    ]);
    else gancho = pick([
      `Meio de tabela. Nem pro céu, nem pro inferno. Uma rodada muda tudo. ⚽`,
      `Nem festa, nem enterro. Futebol brasileiro, né. 🏟️`
    ]);
  } else if (tipo === "rebaixamento") {
    gancho = pick(FARPAS_TIME_MAL);
  } else if (tipo === "g4") {
    gancho = pick(FARPAS_TIME_BEM);
  } else if (tipo === "classico") {
    return farpaClassico(ctx) + (base ? "\n\n" + base : "");
  }
  if (!gancho) return base;
  return base + "\n\n" + personalizarResposta(gancho, ctx);
}

const NUM_PT = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, quinze: 15, vinte: 20, trinta: 30, cem: 100, cento: 100
};

function parseNumToken(tok) {
  if (/^\d+$/.test(tok)) return Number(tok);
  return Object.prototype.hasOwnProperty.call(NUM_PT, tok) ? NUM_PT[tok] : null;
}

function detectarMatematica(pergunta) {
  const p = String(pergunta || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let m = p.match(/(\d+)\s*([+\-*/x×])\s*(\d+)/);
  let a; let b; let op;
  if (m) {
    a = Number(m[1]);
    b = Number(m[3]);
    op = m[2];
  } else {
    m = p.match(/\b([a-z0-9]+)\s*(mais|menos|vezes|dividido(?:\s+por)?|[+\-*/x×])\s*([a-z0-9]+)\b/);
    if (!m) return null;
    a = parseNumToken(m[1]);
    b = parseNumToken(m[3]);
    if (a == null || b == null) return null;
    const o = m[2];
    if (o === "mais" || o === "+") op = "+";
    else if (o === "menos" || o === "-") op = "-";
    else if (o === "vezes" || o === "*" || o === "x" || o === "×") op = "*";
    else if (o.indexOf("dividido") === 0 || o === "/") op = "/";
    else return null;
  }
  let r;
  if (op === "+") r = a + b;
  else if (op === "-") r = a - b;
  else if (op === "*" || op === "x" || op === "×") r = a * b;
  else if (op === "/") r = b === 0 ? null : a / b;
  else return null;
  if (r == null || !isFinite(r)) return null;
  const key = a + (op === "*" ? "x" : op) + b;
  return { expressao: key, resultado: r };
}

function querRebaixamento(p) {
  return /rebaix|z4|zona|nao cair|n[aã]o cair|cair de divisao|quanto falta.*cair|sair da zona/.test(p);
}

function querG4(p) {
  return /\bg4\b|libertadores|subir.*tabela|entrar no g4|to no g4|t[oô] no g4/.test(p);
}

function querRival(p) {
  return /rival|cl[aá]ssico|derbi|arquirrival|quem (e|é) meu rival|meu rival/.test(p);
}

function promptSistemaIA() {
  return [
    "Você é o Bot TORCIDA.: torcedor de BANCADA, não assistente.",
    "Tom: PT-BR de arquibancada — 'tá', 'né', 'bora', 'cê', 'vai'. Farpa leve, nunca humilhante.",
    "NUNCA formal. Proibido: 'prezado', 'gostaria de informar', relatório, tom de locutor.",
    "Quando o time do usuário tá bem: elogia com ironia ('ah, tá bom pra você').",
    "Quando tá mal: provoca com empatia ('tá, mas cê sabia que ia doer').",
    "Em clássico/rival: você TORCE CONTRA o usuário (lado do rival), com carinho provocador.",
    "Pode usar emoji de futebol (⚽🔥⚔️🐟💪🙏🎉😏📊✨😄🏟️🏆).",
    "2 a 5 linhas. Criativo na forma, fiel nos fatos do RASCUNHO/JSON.",
    "Não invente placar, posição, desfalque, contratação ou título.",
    "Se a pergunta for matemática: responde o número e puxa pro futebol com farpa.",
    "Se não souber: fala como torcedor ('sou Bot de torcedor, não de Google'), não como erro de sistema.",
    "Se o histórico mostrar pergunta parecida: zoa ('cê perguntou de novo?').",
    "Entregue só a resposta final, em português do Brasil."
  ].join("\n");
}

module.exports = {
  RIVALIDADES,
  rivalDe,
  personalizarResposta,
  montarContexto,
  escolherFarpa,
  saudacaoBot,
  fallbackBot,
  farpaMatematica,
  farpaClassico,
  temperarFatos,
  detectarMatematica,
  querRebaixamento,
  querG4,
  querRival,
  promptSistemaIA,
  primeiroNome
};
