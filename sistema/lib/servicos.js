// Serviços que montam as respostas maiores da API (portal, jogo, análise, chatbot) e as rotinas de fundo.
// Regra de ouro: página de leitura nunca espera a internet. Responde com o que já está guardado e
// pede a atualização em segundo plano; a página volta a perguntar sozinha e recebe o dado novo.
const D = require("./dominio");
const { load, save } = require("./db");
const { DIR_MIDIA } = require("./config");

function emSegundoPlano(promessa) {
  Promise.resolve(promessa).catch(() => {});
}

function pontuacaoTabela() {
  return (load().tabela || []).slice().sort((a, b) => a.posicao - b.posicao);
}

// ---------------------------------------------------------------- portal
function ultimoResumido(j) {
  return {
    idJogo: j.idJogo,
    mandante: j.mandante,
    visitante: j.visitante,
    data: j.data,
    placarMandante: j.placarMandante,
    placarVisitante: j.placarVisitante,
    competicao: j.competicao || "",
    letra: j.letra,
    escudoCasa: j.escudoCasa,
    escudoFora: j.escudoFora
  };
}

async function portal(eu) {
  emSegundoPlano(D.sincronizarPortal(false));
  emSegundoPlano(D.sincronizarCalendario(load(), false));
  D.placaresEmSegundoPlano(45000);
  D.resultadosEmSegundoPlano(eu.time);
  const db = load();
  const hojeStr = D.hoje();
  const alvos = [eu.time, eu.feedTime].filter((n, i, a) => n && a.indexOf(n) === i);
  const deHoje = (db.jogos || []).filter((j) => j.data === hojeStr).sort(D.ordemJogo);
  D.fichasEmSegundoPlano(db, [...deHoje.flatMap((j) => [j.mandante, j.visitante]), ...alvos]);
  const resumir = (j) => D.jogoResumido(D.marcarAgenda(db, j, eu, D.grupoDoJogo(j)));

  const jogosHoje = deHoje.map(resumir);
  const extra = D.extrasDoPlacar(D.eventosDoPlacar(), deHoje).filter(D.jogoAberto).map((j) => ({ ...j, idJogo: D.idDoJogo(j) }));
  const naTela = new Set(deHoje.map((j) => j.espnId || D.chaveParData(j)));
  const futuros = D.agendaFutura(db).filter((j) => D.jogoAberto(j) && !naTela.has(j.espnId || D.chaveParData(j)));
  const meus = futuros.filter((j) => alvos.some((n) => D.clubeNoJogo(j, n)));
  const proximos = meus.concat(futuros.filter((j) => !meus.includes(j))).slice(0, 8).map(resumir);

  const noticias = (db.noticias || []).slice().sort((a, b) => b.id - a.id).map((n) => {
    const f = D.metaFonte(n.fonte, n.time);
    return {
      id: n.id,
      secao: n.secao,
      time: n.time,
      titulo: n.titulo,
      resumo: n.resumo,
      imagem: D.fotoGrade(n.imagem) || undefined,
      fonteNome: f.nome,
      url: n.url || f.url,
      publicadoEm: n.publicadoEm || ""
    };
  });
  const grupo = (secao) => noticias.filter((n) => n.secao === secao).slice(0, 6);
  // Capa do portal: primeiro o clube do coração (com foto), depois qualquer do clube, só então o resto.
  const manchete =
    noticias.find((n) => n.imagem && n.time === eu.time) ||
    noticias.find((n) => n.time === eu.time) ||
    noticias.find((n) => n.imagem && !n.time) ||
    noticias.find((n) => n.imagem) ||
    noticias[0] ||
    null;

  const tabela = pontuacaoTabela().map((l) => ({ ...l, escudo: D.urlEscudo(l.time) }));
  const proximoClube = D.universoJogos(db)
    .filter((j) => D.clubeNoJogo(j, eu.time) && String(j.data || "") >= hojeStr && j.status !== "encerrado")
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.horario || "").localeCompare(String(b.horario || "")))[0] || null;

  return {
    data: hojeStr,
    atualizadoEm: new Date(D.placarAtualizadoEm() || Date.now()).toISOString(),
    aoVivo: jogosHoje.filter((j) => j.status === "ao vivo").length + extra.filter((j) => j.status === "ao vivo").length,
    jogosHoje,
    extra,
    proximos,
    tabela,
    meta: db.tabelaMeta || {},
    noticiasMeta: db.noticiasMeta || {},
    noticias: { jogo: grupo("jogo"), mercado: grupo("mercado") },
    manchete,
    resumo: D.resumoDoDia(db, eu),
    clube: {
      nome: eu.time,
      escudo: D.urlEscudo(eu.time),
      tabela: tabela.find((x) => x.time === eu.time) || null,
      proximo: proximoClube ? resumir(proximoClube) : null,
      ultimos: D.ultimosDoTime(db, eu.time, 5).map(ultimoResumido)
    },
    tema: D.temaDoTime(eu.time, eu.pais)
  };
}

function hojeTodos(eu) {
  D.placaresEmSegundoPlano(30000);
  const db = load();
  const deHoje = (db.jogos || []).filter((j) => j.data === D.hoje()).sort(D.ordemJogo);
  D.fichasEmSegundoPlano(db, deHoje.flatMap((j) => [j.mandante, j.visitante]));
  const jogos = deHoje.map((j) => D.jogoResumido(D.marcarAgenda(db, j, eu, D.grupoDoJogo(j))));
  const extra = D.extrasDoPlacar(D.eventosDoPlacar(), deHoje).map((j) => ({ ...j, idJogo: D.idDoJogo(j) }));
  return { data: D.hoje(), atualizadoEm: new Date(D.placarAtualizadoEm() || Date.now()).toISOString(), jogos, extra };
}

// ---------------------------------------------------------------- jogo e análise
const enriquecendo = new Map();
const ENRIQUECER_VALIDADE_MS = 3 * 60 * 60 * 1000;

// Busca, em segundo plano, o que enriquece a análise (agenda dos dois times e previsão da API-Football).
function enriquecerJogo(jogo) {
  const chave = D.idDoJogo(jogo);
  const meta = load().meta;
  if (!meta.enriquecido) meta.enriquecido = {};
  const feito = meta.enriquecido[chave];
  if (enriquecendo.has(chave) || (feito && Date.now() - feito.em < ENRIQUECER_VALIDADE_MS)) return;
  const tarefa = (async () => {
    const resolvido = (await D.resolverFixtureAf(jogo, load())) || jogo;
    await D.puxarAgendaExterna(resolvido.mandante, load());
    await D.puxarAgendaExterna(resolvido.visitante, load());
    if (resolvido.fixtureId) await D.buscarPredicaoAf(resolvido.fixtureId);
    meta.enriquecido[chave] = { em: Date.now(), fixtureId: resolvido.fixtureId || null, local: resolvido.local || "" };
    save();
  })().catch(() => {}).finally(() => enriquecendo.delete(chave));
  enriquecendo.set(chave, tarefa);
}

function dadosGuardados(db, jogo) {
  const ext = (nome) => (db.agendaExterna || {})[D.normaliza(nome)] || null;
  const info = ((db.meta || {}).enriquecido || {})[D.idDoJogo(jogo)] || {};
  const fixtureId = jogo.fixtureId || info.fixtureId || null;
  return {
    extraCasa: ext(jogo.mandante),
    extraFora: ext(jogo.visitante),
    predicao: fixtureId ? (db.predicoes || {})[String(fixtureId)] || null : null,
    fixtureId,
    local: jogo.local || info.local || ""
  };
}

function analiseDoJogo(eu, jogo, alvo) {
  const db = load();
  D.fichasEmSegundoPlano(db, [jogo.mandante, jogo.visitante]);
  D.resultadosEmSegundoPlano(jogo.mandante);
  D.resultadosEmSegundoPlano(jogo.visitante);
  const base = Object.assign({}, jogo, D.jogoComMarca(jogo, {
    [jogo.mandante]: D.fichaCache(db, jogo.mandante),
    [jogo.visitante]: D.fichaCache(db, jogo.visitante)
  }));
  const g = dadosGuardados(db, base);
  if (g.fixtureId) base.fixtureId = g.fixtureId;
  if (!base.local && g.local) base.local = g.local;
  // jogo que já acabou não tem o que prever: não gasta cota da API-Football nem fica "buscando dados"
  const encerrado = base.status === "encerrado" || base.concluido === true;
  if (!encerrado) enriquecerJogo(jogo);
  const analise = D.montaAnalise(db, base, g.extraCasa, g.extraFora, alvo || eu.time, g.predicao);
  analise.detalhado = encerrado || !!(g.extraCasa || g.extraFora || g.predicao);
  return analise;
}

async function jogo(eu, id) {
  emSegundoPlano(D.sincronizarCalendario(load(), false));
  D.placaresEmSegundoPlano(30000);
  const db = load();
  const j = D.acharJogoPorId(db, id);
  if (!j) return null;
  const analise = analiseDoJogo(eu, j);
  return { ...analise, noticias: D.noticiasDoConfronto(load(), j), tema: D.temaDoTime(eu.time, eu.pais) };
}

async function coracao(eu, pedido, idJogo) {
  emSegundoPlano(D.sincronizarPortal(false));
  D.placaresEmSegundoPlano(30000);
  const db = load();
  const alvo = (D.clubeOk(pedido) || D.TIMES.includes(pedido)) ? pedido : eu.time;
  let j = idJogo ? D.acharJogoPorId(db, idJogo) : D.jogoDoTime(db, alvo);
  if (!j) j = D.agendaFutura(db).find((x) => D.clubeNoJogo(x, alvo)) || null;
  if (!j) {
    const guardado = ((db.meta || {}).proximoJogo || {})[D.normaliza(alvo)];
    j = guardado || null;
    // time sem jogo no calendário: tenta achar o próximo jogo na API-Football, sem travar a resposta
    emSegundoPlano((async () => {
      const prox = await D.proximoJogoAf(alvo, null);
      if (prox) {
        const meta = load().meta;
        if (!meta.proximoJogo) meta.proximoJogo = {};
        meta.proximoJogo[D.normaliza(alvo)] = prox;
        save();
      }
    })());
  }
  if (!j) return D.montaAnalise(db, null, null, null, alvo, null);
  return analiseDoJogo(eu, { ...j }, alvo);
}

// ---------------------------------------------------------------- busca
function busca(eu, q) {
  const r = D.buscaGeral(load(), eu, q);
  return {
    q: r.q || q,
    clubes: r.clubes,
    jogos: (r.jogos || []).map((j) => D.jogoResumido({ ...j, grupo: D.grupoDoJogo(j), quente: false })),
    noticias: r.noticias
  };
}

// ---------------------------------------------------------------- chatbot
// Cada pergunta: entende a intenção, junta os dados (banco + fontes externas) e monta o rascunho com regras.
// Se houver IA configurada, ela só reescreve o rascunho em tom de torcida; os fatos vêm sempre do banco.
async function chatbot(eu, perguntaBruta) {
  const hist = D.histDo(eu);
  const pergunta = D.perguntaComMemoria(perguntaBruta, hist);
  const db = load();
  const liga = D.detectarLiga(pergunta);
  const soLiga = D.fraseSoLiga(pergunta, liga);
  const fora = D.perguntaForaDeBola(pergunta) && !liga;
  const palpiteCedo = D.querPalpite(pergunta) && !fora;
  const pedeAgenda = D.querProximos(pergunta);
  const pedePassado = D.querResultado(pergunta) && !fora;
  const pedeElenco = D.querElenco(pergunta) && !fora;
  const pedeCasa = (D.querEstadio(pergunta) || D.querTecnico(pergunta)) && !fora;
  const citadosPergunta = D.timesCitados(pergunta);
  const packConf = citadosPergunta.length >= 2
    ? D.confrontoEntre(db, citadosPergunta[0], citadosPergunta[1])
    : { passado: null, futuro: null };
  const jaTemResultado = !!(pedePassado && packConf.passado);
  const det = (soLiga || fora)
    ? { nome: eu.time, origem: "local", explicito: false }
    : await D.detectarClube(pergunta, eu.time);
  let extra = null;
  let jogosLiga = [];
  let tabelaLiga = [];
  let agendaPack = null;
  if (liga) {
    jogosLiga = await D.puxarJogosLiga(liga, db);
    if (!liga.local) tabelaLiga = await D.puxarTabelaLiga(liga, db);
  }
  if (!jaTemResultado && (det.explicito || pedeAgenda || palpiteCedo || pedePassado || pedeElenco || pedeCasa)) {
    extra = await D.puxarAgendaExterna(det.explicito ? (det.busca || det.nome) : eu.time, db, det.idTeam, det.idApiFootball);
    if (extra && extra.nome && det.origem !== "local" && det.explicito) det.nome = extra.nome;
  }
  if (pedeCasa) await D.montarFicha(det.nome || eu.time, db, { tecnico: true });
  if (pedeAgenda && !liga) {
    // contexto para a IA, tirado da agenda local (a ESPN já trouxe os próximos jogos)
    const agenda = D.agendaFutura(db);
    jogosLiga = agenda.filter((j) => /brasileir/i.test(j.competicao || "")).slice(0, 10);
    agendaPack = { brasileirao: jogosLiga, copa: agenda.filter((j) => /copa do brasil/i.test(j.competicao || "")).slice(0, 8) };
  }
  let extrasConfronto = null;
  if (palpiteCedo) {
    const confronto = D.jogoCitadoNaPergunta(db, pergunta);
    const timeAlvo = (confronto && confronto.mandante) || D.timesCitados(pergunta)[0] || det.nome || eu.time;
    const doClube = (lista) => (lista || []).find((j) => D.clubeNoJogo(j, timeAlvo));
    let jogoA = confronto || D.acharJogoAnalise(pergunta, eu, db);
    if (jogoA && !confronto && D.timesCitados(pergunta).length && !D.clubeNoJogo(jogoA, timeAlvo)) jogoA = null;
    if (!jogoA && extra && extra.jogos) {
      jogoA = extra.jogos.find((j) => j.data === D.hoje() && D.clubeNoJogo(j, timeAlvo))
        || extra.jogos.find((j) => !j.concluido && D.clubeNoJogo(j, timeAlvo))
        || null;
    }
    if (!jogoA) jogoA = await D.proximoJogoAf(timeAlvo, det.idApiFootball);
    if (!jogoA) {
      const extraJ = await D.puxarAgendaExterna(timeAlvo, db, det.idTeam, det.idApiFootball);
      extra = extra || extraJ;
      const jogos = (extraJ && extraJ.jogos) || [];
      jogoA = jogos.find((j) => j.data === D.hoje() && D.clubeNoJogo(j, timeAlvo))
        || jogos.find((j) => !j.concluido && D.clubeNoJogo(j, timeAlvo))
        || null;
    }
    if (jogoA && !D.clubeNoJogo(jogoA, timeAlvo)) jogoA = null;
    if (jogoA) jogoA = await D.resolverFixtureAf(jogoA, db);
    if (jogoA && D.clubeNoJogo(jogoA, timeAlvo)) {
      const pack = await D.packElenco(db, jogoA, timeAlvo, det.idApiFootball);
      const alvoJogo = pack.jogo || jogoA;
      extrasConfronto = {
        jogo: alvoJogo,
        pred: alvoJogo.fixtureId ? await D.buscarPredicaoAf(alvoJogo.fixtureId) : null,
        casa: await D.puxarAgendaExterna(jogoA.mandante, db),
        fora: await D.puxarAgendaExterna(jogoA.visitante, db),
        alvo: timeAlvo,
        desfalques: pack.desfalques,
        escalacao: pack.escalacao
      };
    } else {
      extrasConfronto = { alvo: timeAlvo, proximo: doClube(((extra && extra.jogos) || []).filter((j) => !j.concluido)) || null };
    }
  } else if (pedeElenco) {
    const timeAlvo = det.nome || eu.time;
    const jogoA = D.acharJogoAnalise(pergunta, eu, db) || D.agendaFutura(db).find((j) => D.clubeNoJogo(j, timeAlvo)) || null;
    extrasConfronto = await D.packElenco(db, jogoA, timeAlvo, det.idApiFootball);
  }
  const metaJogo = (packConf.passado || packConf.futuro) ? D.linhaJogo(packConf.passado || packConf.futuro) : null;
  const rascunho = D.responderChat(pergunta, eu, db, det, extra, liga, jogosLiga, tabelaLiga, extrasConfronto, agendaPack);
  let resposta = rascunho;
  if (D.iaLigada() && !fora && !D.respostaFactual(rascunho)) {
    const ia = await D.redigirComIA(pergunta, D.contextoBanco(eu, db, det, extra, {
      jogosLiga,
      copa: agendaPack && agendaPack.copa,
      historico: hist,
      confronto: packConf.passado || (pedePassado ? packConf.futuro : null),
      desfalques: extrasConfronto && extrasConfronto.desfalques,
      escalacao: extrasConfronto && extrasConfronto.escalacao
    }), rascunho);
    if (ia) resposta = ia;
  } else if (D.iaLigada() && fora) {
    const ia = await D.redigirComIA(pergunta, { foraDeBola: true, nome: eu.nome, historicoRecente: hist }, rascunho);
    if (ia) resposta = ia;
  }
  D.gravarHist(eu, perguntaBruta, resposta, { jogo: metaJogo });
  return resposta;
}

// ---------------------------------------------------------------- rotinas de fundo
function iniciarRotinas() {
  const repetir = (fn, ms) => setInterval(() => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch { /* segue */ } }, ms).unref();

  D.manutencao();
  setTimeout(() => emSegundoPlano(D.sincronizarCalendario(load(), true)), 500).unref();
  setTimeout(() => emSegundoPlano(D.sincronizarPortal(true)), 1500).unref();
  setTimeout(() => emSegundoPlano(D.atualizarPlacaresHoje(load(), { maxIdadeMs: 0 })), 2500).unref();

  repetir(() => D.sincronizarPortal(false), 3 * 60 * 1000);
  repetir(() => D.sincronizarCalendario(load(), false), 15 * 60 * 1000);
  repetir(D.manutencao, 60 * 60 * 1000);
  // Placar: a cada 20 s com bola rolando; fora disso, a cada 5 min (só para pegar mudanças de agenda).
  repetir(() => D.atualizarPlacaresHoje(load(), { maxIdadeMs: D.haJogoAgora() ? 15000 : 5 * 60 * 1000 }), 20 * 1000);
}

module.exports = { portal, hojeTodos, jogo, coracao, busca, chatbot, iniciarRotinas, emSegundoPlano, DIR_MIDIA };
