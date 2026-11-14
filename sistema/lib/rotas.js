// Tabela de rotas da API. Cada rota declara o que exige (login, admin, limite de uso);
// o despachante em server.js aplica essas regras antes de chamar o handler.
const fs = require("fs");
const path = require("path");
const { ErroHttp, rota, limitador, consumir, zerar, enviar } = require("./http");
const { load, save, novoId } = require("./db");
const { DIR_FOTOS, VERSAO } = require("./config");
const crypto = require("crypto");
const A = require("./auth");
const D = require("./dominio");
const S = require("./servicos");
const { enviarEmail } = require("./mail");
const { paises: listaPaises, buscarClubes, clubePorNome, definirExtras, CLUBES } = require("../clubes");
const { marcaDoClube } = require("../marcas");

// ---------------------------------------------------------------- limites de uso
limitador("api-ip", 60 * 1000, 600);
limitador("login-ip", 15 * 60 * 1000, 25);
limitador("login-email", 15 * 60 * 1000, 8);
limitador("senha-ip", 60 * 60 * 1000, 12);
// uma turma inteira na mesma rede (mesmo IP) precisa conseguir criar conta numa apresentação
limitador("cadastro-ip", 60 * 60 * 1000, 40);
limitador("onboarding-ip", 60 * 60 * 1000, 80);
limitador("post-usuario", 60 * 60 * 1000, 30);
limitador("comentario-usuario", 60 * 60 * 1000, 120);
limitador("curtida-usuario", 60 * 60 * 1000, 600);
limitador("chat-minuto", 60 * 1000, 12);
limitador("chat-hora", 60 * 60 * 1000, 150);
limitador("busca-ip", 60 * 1000, 90);
limitador("admin-ip", 15 * 60 * 1000, 30);

// ---------------------------------------------------------------- validações
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function invalido(campo, mensagem) {
  return new ErroHttp(400, mensagem, "validacao", { campo });
}

function textoCurto(valor, max) {
  return A.limpaTexto(valor, max);
}

function contaCaracteres(texto) {
  return Array.from(String(texto || "")).length;
}

function idDaUrl(valor) {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErroHttp(400, "Identificador inválido.", "id_invalido");
  return n;
}

function validarClubes(b, padrao) {
  const time = textoCurto(b.time || (padrao && padrao.time), 80);
  const feedTime = textoCurto(b.feedTime || time, 80);
  if (!time) throw invalido("time", "Escolha o time do coração.");
  if (!D.clubeOk(time)) throw invalido("time", "Escolha um time da lista.");
  if (!D.clubeOk(feedTime)) throw invalido("feedTime", "Escolha um time da lista.");
  const clube = clubePorNome(time);
  return { time, feedTime, pais: clube.pais };
}

function usuarioDoBanco(eu) {
  return load().usuarios.find((x) => x.id === eu.id) || null;
}

function sessaoComTokenNovo(user) {
  return D.sessaoPublica(user);
}

// ---------------------------------------------------------------- registro
function registrar() {
  // -------- informações gerais
  rota("GET", "/api/saude", () => {
    const db = load();
    return {
      ok: true,
      versao: VERSAO,
      horario: new Date().toISOString(),
      uptimeSeg: Math.round(process.uptime()),
      ia: D.iaLigada(),
      apiFootball: D.apiFootballLigada(),
      footballData: D.footballDataLigada(),
      sportsDb: D.sportsDbLigada(),
      conexoesAoVivo: D.clientesStream.size,
      jogosHoje: (db.jogos || []).filter((j) => j.data === D.hoje()).length,
      jogosNoCalendario: D.jogosCalendario().length,
      noticias: (db.noticias || []).length,
      tabela: (db.tabela || []).length,
      usuarios: (db.usuarios || []).length
    };
  });

  rota("GET", "/api/times", () => {
    const extras = load().clubesExtra || [];
    return { times: D.TIMES.concat(extras.map((c) => c.nome)), brasileirao: D.TIMES, extras };
  });

  rota("GET", "/api/paises", () => ({ paises: listaPaises() }));

  rota("GET", "/api/clubes", ({ query }) => {
    const pais = textoCurto(query.pais, 60);
    const q = textoCurto(query.q, 60);
    const lista = buscarClubes(q, pais).slice(0, 400);
    return {
      clubes: lista.map((c) => ({ nome: c.nome, pais: c.pais, liga: c.liga, sigla: c.sigla || undefined, logo: marcaDoClube(c.nome, c.pais).logo })),
      total: CLUBES.length + (load().clubesExtra || []).length,
      paises: listaPaises()
    };
  });

  rota("GET", "/api/tema", ({ query, eu }) => {
    const time = textoCurto(query.time || eu.time, 80);
    if (!time) throw invalido("time", "Falta o time.");
    return D.temaDoTime(time, textoCurto(query.pais || eu.pais, 60));
  });

  // -------- conta e sessão
  rota("POST", "/api/cadastro", { limite: [["cadastro-ip", "ip"]] }, async ({ eu, corpo }) => {
    const b = await corpo();
    const nome = textoCurto(b.nome, 40);
    const email = textoCurto(b.email, 120).toLowerCase();
    const senha = String(b.senha || "");
    if (nome.length < 2) throw invalido("nome", "Informe seu nome (mínimo 2 letras).");
    if (!EMAIL.test(email)) throw invalido("email", "Informe um e-mail válido.");
    if (senha.length < 6) throw invalido("senha", "A senha precisa ter no mínimo 6 caracteres.");
    if (senha.length > 128) throw invalido("senha", "A senha pode ter no máximo 128 caracteres.");
    const clubes = validarClubes(b);
    const db = load();
    if (db.usuarios.some((x) => x.email === email)) throw new ErroHttp(409, "E-mail já cadastrado.", "email_em_uso", { campo: "email" });

    // visitante com perfil criado pelo onboarding vira conta completa, mantendo posts e curtidas
    const existente = eu.autenticado && eu.convidado ? usuarioDoBanco(eu) : null;
    const user = existente || { id: novoId(), papel: "torcedor", criadoEm: new Date().toISOString() };
    user.nome = nome;
    user.usuario = D.usuarioLivre(db, b.usuario || nome, user.id);
    user.email = email;
    user.senhaHash = await A.hashSenha(senha);
    user.time = clubes.time;
    user.feedTime = clubes.feedTime;
    user.pais = clubes.pais;
    user.convidado = false;
    if (!user.foto) user.foto = D.urlEscudo(clubes.time);
    if (!existente) db.usuarios.push(user);
    save();
    return { __status: 201, corpo: sessaoComTokenNovo(user) };
  });

  rota("POST", "/api/login", { limite: [["login-ip", "ip"]] }, async ({ corpo }) => {
    const b = await corpo();
    const email = textoCurto(b.email, 120).toLowerCase();
    const senha = String(b.senha || "");
    if (!email || !senha) throw invalido("email", "Informe e-mail e senha.");
    const porEmail = consumir("login-email", email);
    if (!porEmail.ok) throw new ErroHttp(429, "Muitas tentativas para este e-mail. Aguarde alguns minutos.", "limite", { esperaSeg: porEmail.esperaSeg });
    const user = load().usuarios.find((x) => x.email === email);
    const bloqueada = user && user.semLogin && process.env.DEMO_LOGIN !== "1";
    if (!user || bloqueada || !user.senhaHash) {
      await A.gastarTempoDeSenha(senha);
      throw new ErroHttp(401, "E-mail ou senha inválidos.", "credenciais");
    }
    if (!(await A.senhaOk(senha, user.senhaHash))) throw new ErroHttp(401, "E-mail ou senha inválidos.", "credenciais");
    if (A.precisaRehash(user.senhaHash)) {
      user.senhaHash = await A.hashSenha(senha);
      save();
    }
    zerar("login-email", email);
    return sessaoComTokenNovo(user);
  });

  // Pedido de redefinição: sempre responde ok (não revela se o e-mail existe).
  rota("POST", "/api/senha/esqueci", { limite: [["senha-ip", "ip"]] }, async ({ corpo, req }) => {
    const b = await corpo();
    const email = textoCurto(b.email, 120).toLowerCase();
    if (!EMAIL.test(email)) throw invalido("email", "Informe um e-mail válido.");
    const db = load();
    const user = db.usuarios.find((x) => x.email === email && x.senhaHash && !x.convidado);
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url");
      user.resetToken = token;
      user.resetExp = Date.now() + 60 * 60 * 1000; // 1h
      save();
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000").split(",")[0].trim();
      const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
      const link = proto + "://" + host + "/redefinir.html?token=" + encodeURIComponent(token);
      await enviarEmail({
        to: email,
        subject: "Redefinir senha · Torcida",
        text:
          "Olá" + (user.nome ? ", " + user.nome : "") + ".\n\n" +
          "Recebemos um pedido para redefinir sua senha no Torcida.\n" +
          "Abra o link abaixo (válido por 1 hora):\n\n" + link + "\n\n" +
          "Se você não pediu isso, ignore este e-mail.\n",
        html:
          "<p>Olá" + (user.nome ? ", <strong>" + user.nome + "</strong>" : "") + ".</p>" +
          "<p>Recebemos um pedido para redefinir sua senha no Torcida.</p>" +
          '<p><a href="' + link + '">Redefinir minha senha</a></p>' +
          "<p style=\"color:#888;font-size:12px\">Link válido por 1 hora. Se você não pediu, ignore este e-mail.</p>"
      });
    } else {
      await A.gastarTempoDeSenha(email);
    }
    return { ok: true, mensagem: "Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha." };
  });

  rota("POST", "/api/senha/redefinir", { limite: [["senha-ip", "ip"]] }, async ({ corpo }) => {
    const b = await corpo();
    const token = textoCurto(b.token, 200);
    const senha = String(b.senha || "");
    if (!token) throw invalido("token", "Link inválido ou expirado.");
    if (senha.length < 6) throw invalido("senha", "A senha precisa ter no mínimo 6 caracteres.");
    if (senha.length > 128) throw invalido("senha", "A senha pode ter no máximo 128 caracteres.");
    const db = load();
    const alvo = db.usuarios.find((x) => x.resetToken === token);
    if (!alvo || !alvo.resetExp || Date.now() > Number(alvo.resetExp)) {
      throw new ErroHttp(400, "Este link expirou ou já foi usado. Peça um novo.", "token_invalido");
    }
    alvo.senhaHash = await A.hashSenha(senha);
    delete alvo.resetToken;
    delete alvo.resetExp;
    save();
    return { ok: true, mensagem: "Senha atualizada. Você já pode entrar." };
  });

  // Entrar sem cadastro: cria um perfil de visitante só desse navegador (ou atualiza o perfil de quem já está logado).
  rota("POST", "/api/onboarding", { limite: [["onboarding-ip", "ip"]] }, async ({ eu, corpo }) => {
    const b = await corpo();
    const clubes = validarClubes(b);
    const db = load();
    const nome = textoCurto(b.nome, 40) || (eu.autenticado ? eu.nome : "Torcedor");
    if (nome.length < 2) throw invalido("nome", "Informe um nome com pelo menos 2 letras.");
    if (eu.autenticado) {
      const user = usuarioDoBanco(eu);
      const crestAntigo = D.urlEscudo(user.time);
      const usaPadrao = !user.foto || user.foto === crestAntigo || String(user.foto).startsWith("/img/escudo");
      user.nome = nome;
      user.time = clubes.time;
      user.feedTime = clubes.feedTime;
      user.pais = clubes.pais;
      if (b.usuario) user.usuario = D.usuarioLivre(db, b.usuario, user.id);
      if (usaPadrao) user.foto = D.urlEscudo(clubes.time);
      save();
      return sessaoComTokenNovo(user);
    }
    const user = {
      id: novoId(),
      nome,
      usuario: D.usuarioLivre(db, b.usuario || nome),
      email: "",
      senhaHash: "",
      time: clubes.time,
      feedTime: clubes.feedTime,
      pais: clubes.pais,
      foto: D.urlEscudo(clubes.time),
      papel: "torcedor",
      convidado: true,
      criadoEm: new Date().toISOString()
    };
    db.usuarios.push(user);
    save();
    return { __status: 201, corpo: sessaoComTokenNovo(user) };
  });

  rota("GET", "/api/me", ({ eu }) => {
    if (!eu.autenticado) {
      return { autenticado: false, tokenInvalido: !!eu.tokenInvalido, time: eu.time, feedTime: eu.feedTime, pais: eu.pais, tema: D.temaDoTime(eu.time, eu.pais) };
    }
    return { autenticado: true, ...sessaoComTokenNovo(usuarioDoBanco(eu)) };
  });

  // As sessões são tokens assinados, sem registro no servidor: sair é descartar o token no navegador.
  rota("POST", "/api/logout", () => ({ ok: true }));

  rota("POST", "/api/perfil", { auth: true }, async ({ eu, corpo }) => {
    const b = await corpo(9e6);
    const db = load();
    const user = usuarioDoBanco(eu);
    if (!user) throw new ErroHttp(404, "Conta não existe.", "nao_encontrado");
    if (b.nome !== undefined) {
      const nome = textoCurto(b.nome, 40);
      if (nome.length < 2) throw invalido("nome", "Informe um nome com pelo menos 2 letras.");
      user.nome = nome;
    }
    if (b.usuario) user.usuario = D.usuarioLivre(db, b.usuario, user.id);
    if (b.foto) {
      const foto = D.fotoPerfilOk(b.foto);
      if (!foto) throw invalido("foto", "Foto inválida. Use JPG, PNG, WEBP ou GIF até 6 MB.");
      user.foto = foto;
    }
    save();
    return sessaoComTokenNovo(user);
  });

  rota("GET", "/api/avatares", async ({ query, eu }) => {
    const time = textoCurto(query.time || eu.time, 80);
    if (!D.clubeOk(time)) throw invalido("time", "Escolha um clube da lista.");
    const nome = textoCurto(query.nome || eu.nome || "T", 40);
    const jogadores = await D.elencoAvatares(load(), time);
    return { time, simples: D.avataresSimples(nome, time), jogadores };
  });

  // -------- conteúdo de futebol
  rota("GET", "/api/portal", ({ eu }) => S.portal(eu));
  rota("GET", "/api/hoje", ({ eu }) => S.hojeTodos(eu));
  rota("GET", "/api/agenda", ({ eu }) => D.montarAgendaCompleta(eu));

  rota("GET", "/api/jogo", async ({ query, eu }) => {
    const r = await S.jogo(eu, textoCurto(query.id, 200));
    if (!r) throw new ErroHttp(404, "Jogo não encontrado.", "nao_encontrado");
    return r;
  });

  rota("GET", "/api/coracao", ({ query, eu }) => S.coracao(eu, textoCurto(query.time, 80), textoCurto(query.id, 200)));

  rota("GET", "/api/tabela", () => {
    S.emSegundoPlano(D.sincronizarPortal(false));
    const db = load();
    return {
      tabela: (db.tabela || []).slice().sort((a, b) => a.posicao - b.posicao).map((l) => ({ ...l, escudo: D.urlEscudo(l.time) })),
      meta: db.tabelaMeta || {}
    };
  });

  rota("GET", "/api/fontes", () => ({ fontes: D.FONTES }));

  rota("GET", "/api/noticias", ({ query }) => {
    const db = load();
    let lista = (db.noticias || []).slice().sort((a, b) => b.id - a.id);
    if (query.time) lista = lista.filter((n) => !n.time || n.time === query.time);
    if (query.fonte) lista = lista.filter((n) => n.fonte === query.fonte);
    if (query.secao) lista = lista.filter((n) => n.secao === query.secao);
    const limite = Math.min(60, Math.max(1, Number(query.limite) || 30));
    return {
      noticias: lista.slice(0, limite).map((n) => {
        const f = D.metaFonte(n.fonte, n.time);
        return { ...n, imagem: D.fotoGrade(n.imagem) || "", fonteNome: f.nome, papelFonte: f.papel, url: n.url || f.url };
      }),
      fontes: D.FONTES
    };
  });

  // GNews — proxy (chave só no servidor). Cache leve em memória pra respeitar a cota free.
  let gnewsCache = { em: 0, chave: "", body: null };
  rota("GET", "/api/gnews", { limite: [["busca-ip", "ip"]] }, async ({ query }) => {
    const key = String(process.env.GNEWS_KEY || "").trim();
    if (!key) throw new ErroHttp(503, "GNews não configurado (GNEWS_KEY).", "indisponivel");
    const max = Math.min(80, Math.max(1, Number(query.max) || 60));
    const global = String(query.modo || "") === "global" || String(query.global || "") === "1";
    const q = textoCurto(query.q, 80) || "futebol";
    const agora = Date.now();
    const cacheKey = (global ? "global3|" : "br|") + q + "|" + max;
    if (gnewsCache.body && gnewsCache.chave === cacheKey && agora - gnewsCache.em < 15 * 60 * 1000) {
      return { ...gnewsCache.body, cache: true };
    }
    const { httpJson } = require("./net");

    function mapArticles(list) {
      return (list || []).map((a) => ({
        title: a.title || "",
        description: a.description || "",
        content: a.content || "",
        image: a.image || "",
        url: a.url || "",
        source: a.source && a.source.name ? a.source.name : "Fonte",
        publishedAt: a.publishedAt || ""
      }));
    }

    async function buscar(consulta, comPais, porPagina) {
      const n = Math.min(10, Math.max(1, porPagina || 10));
      let u = "https://gnews.io/api/v4/search?q=" + encodeURIComponent(consulta) +
        "&lang=pt&max=" + n + "&sortby=publishedAt&apikey=" + encodeURIComponent(key);
      if (comPais) u += "&country=br";
      const data = await httpJson(u, 12000);
      return mapArticles(data && data.articles);
    }

    let articles = [];
    const vistos = new Set();
    function absorver(lote) {
      for (const a of lote) {
        const chave = String(a.title || "").toLowerCase().slice(0, 48);
        if (!chave || vistos.has(chave)) continue;
        vistos.add(chave);
        articles.push(a);
        if (articles.length >= max) return true;
      }
      return false;
    }

    if (global) {
      const consultas = [
        { q: "futebol", br: false },
        { q: "futebol brasileiro", br: true },
        { q: "brasileirão", br: true },
        { q: "flamengo OR palmeiras OR corinthians OR santos", br: true },
        { q: "champions league", br: false },
        { q: "premier league", br: false },
        { q: "la liga", br: false },
        { q: "serie a OR milan OR juventus", br: false },
        { q: "bundesliga OR bayern", br: false },
        { q: "libertadores", br: false },
        { q: "copa do mundo OR seleção brasileira", br: false },
        { q: "transferência futebol OR mercado da bola", br: false }
      ];
      for (let i = 0; i < consultas.length && articles.length < max; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1100));
        try {
          const lote = await buscar(consultas[i].q, consultas[i].br, 10);
          if (absorver(lote)) break;
        } catch (_) { /* tenta próxima */ }
      }
    } else {
      const data = await httpJson(
        "https://gnews.io/api/v4/search?q=" + encodeURIComponent(q) +
        "&lang=pt&country=br&max=" + Math.min(10, max) + "&sortby=publishedAt&apikey=" + encodeURIComponent(key),
        12000
      );
      absorver(mapArticles(data && data.articles));
    }

    if (!articles.length) throw new ErroHttp(502, "GNews sem resultados.", "upstream");
    const body = { articles: articles.slice(0, max), total: articles.length, cache: false, modo: global ? "global" : "br" };
    gnewsCache = { em: agora, chave: cacheKey, body };
    return body;
  });
  // O portal só publica o que vem da cobertura: ninguém cadastra notícia na mão.
  rota("POST", "/api/noticias", () => {
    throw new ErroHttp(403, "Notícia não se cadastra na mão. Entra pela cobertura.", "proibido");
  });

  rota("GET", "/api/busca", { limite: [["busca-ip", "ip"]] }, ({ query, eu }) => {
    const q = textoCurto(query.q, 80);
    if (q.length < 2) return { q, clubes: [], jogos: [], noticias: [] };
    return S.busca(eu, q);
  });

  rota("GET", "/api/fichas", async ({ query }) => {
    const nomes = String(query.nomes || "").split(",").map((s) => textoCurto(s, 80)).filter(Boolean).slice(0, 30);
    const mapa = D.fichasEmSegundoPlano(load(), nomes);
    return { fichas: mapa };
  });

  // -------- comunidade (leitura)
  rota("GET", "/api/ranking", () => ({ ranking: D.rankingTimes(load()) }));

  rota("GET", "/api/resumo", ({ eu }) => {
    const resumo = D.resumoDoDia(load(), eu);
    return { ...resumo, time: eu.time };
  });

  rota("GET", "/api/feed", ({ query, eu }) => {
    const db = load();
    const limite = Math.min(60, Math.max(1, Number(query.limite) || 30));
    const antes = Number(query.antes) || Infinity;
    const todos = db.posts.filter((p) => p.id < antes).sort((a, b) => b.id - a.id);
    const pagina = todos.slice(0, limite);
    return {
      posts: pagina.map((p) => D.postPublico(db, p, eu)),
      proximo: todos.length > limite ? pagina[pagina.length - 1].id : null,
      total: db.posts.length
    };
  });

  rota("GET", "/api/posts/:id", ({ params, eu }) => {
    const db = load();
    const p = db.posts.find((x) => x.id === idDaUrl(params.id));
    if (!p) throw new ErroHttp(404, "Post não existe mais.", "nao_encontrado");
    return { post: D.postPublico(db, p, eu) };
  });

  rota("GET", "/api/nacao", ({ eu }) => {
    D.resultadosEmSegundoPlano(eu.time);
    return D.montarNacao(load(), eu);
  });

  rota("GET", "/api/notificacoes", ({ eu }) => ({ notificacoes: D.montarNotificacoes(load(), eu) }));

  // Eventos ao vivo (gols, posts novos): o navegador mantém a conexão aberta.
  rota("GET", "/api/stream", ({ req, res }) => {
    if (D.clientesStream.size >= 300) throw new ErroHttp(503, "Muitas conexões ao vivo agora. Tente em instantes.", "lotado");
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 5000\n\n");
    res.write("data: " + JSON.stringify({ tipo: "abriu", em: new Date().toISOString() }) + "\n\n");
    D.clientesStream.add(res);
    const ping = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { /* fecha abaixo */ }
    }, 25000);
    req.on("close", () => {
      clearInterval(ping);
      D.clientesStream.delete(res);
    });
  });

  // -------- chatbot
  rota("POST", "/api/chatbot", { limite: [["chat-minuto", "ip"], ["chat-hora", "ip"]] }, async ({ eu, corpo }) => {
    const b = await corpo();
    const pergunta = textoCurto(b.pergunta, 400);
    if (!pergunta) throw invalido("pergunta", "Escreva a pergunta.");
    try {
      return { resposta: await S.chatbot(eu, pergunta) };
    } catch (e) {
      console.error("[chatbot]", e && e.stack ? e.stack : e);
      throw new ErroHttp(503, "Não rolou agora. Tenta de novo.", "indisponivel");
    }
  });

  // O estado da IA vem do último teste feito (o teste real fica no painel de administração).
  rota("GET", "/api/chatbot/status", () => {
    const s = D.estadoIa();
    return { ia: D.iaLigada(), groq: s.groq, gemini: s.gemini };
  });

  // -------- publicações
  rota("POST", "/api/posts", { auth: true, limite: [["post-usuario", "usuario"]] }, async ({ eu, corpo }) => {
    const b = await corpo(9e6);
    const texto = String(b.texto || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
    const foto = b.imagem ? D.salvarFoto(b.imagem) : null;
    if (b.imagem && !foto) throw invalido("imagem", "Imagem inválida. Use JPG, PNG, WEBP ou GIF até 6 MB.");
    if (!texto && !foto) throw invalido("texto", "Escreva alguma coisa ou ponha uma imagem.");
    if (contaCaracteres(texto) > 280) throw invalido("texto", "Máximo de 280 caracteres.");
    const db = load();
    const user = usuarioDoBanco(eu);
    // RN02: a etiqueta do post é sempre o time do coração do autor
    const post = { id: novoId(), usuarioId: eu.id, time: user.time, texto, foto: foto || "", criadoEm: new Date().toISOString() };
    db.posts.push(post);
    save();
    D.avisarStream({ tipo: "post", postId: post.id, usuarioId: user.id });
    return { __status: 201, corpo: { post: D.postPublico(db, post, eu) } };
  });

  rota("DELETE", "/api/posts/:id", { auth: true }, ({ eu, params }) => {
    const postId = idDaUrl(params.id);
    const db = load();
    const i = db.posts.findIndex((p) => p.id === postId);
    if (i < 0) throw new ErroHttp(404, "Post não existe mais.", "nao_encontrado");
    const post = db.posts[i];
    if (post.usuarioId !== eu.id && eu.papel !== "admin") throw new ErroHttp(403, "Esse post não é seu.", "proibido");
    db.posts.splice(i, 1);
    db.curtidas = db.curtidas.filter((c) => c.postId !== postId);
    db.comentarios = db.comentarios.filter((c) => c.postId !== postId);
    save();
    if (post.foto && /^\/fotos\/[\w.-]+$/.test(post.foto) && !db.posts.some((p) => p.foto === post.foto)) {
      const arq = path.join(DIR_FOTOS, path.basename(post.foto));
      try { fs.unlinkSync(arq); } catch { /* já tinha sumido */ }
    }
    D.avisarStream({ tipo: "post-apagado", postId });
    return { ok: true };
  });

  rota("POST", "/api/posts/:id/curtir", { auth: true, limite: [["curtida-usuario", "usuario"]] }, ({ eu, params }) => {
    const postId = idDaUrl(params.id);
    const db = load();
    if (!db.posts.some((p) => p.id === postId)) throw new ErroHttp(404, "Post não existe mais.", "nao_encontrado");
    const i = db.curtidas.findIndex((c) => c.postId === postId && c.usuarioId === eu.id);
    if (i >= 0) db.curtidas.splice(i, 1);
    else db.curtidas.push({ postId, usuarioId: eu.id, em: new Date().toISOString() });
    save();
    const likes = db.curtidas.filter((c) => c.postId === postId).length;
    D.avisarStream({ tipo: "curtida", postId, likes });
    return { ok: true, likes, curtiu: i < 0 };
  });

  rota("POST", "/api/posts/:id/comentar", { auth: true, limite: [["comentario-usuario", "usuario"]] }, async ({ eu, params, corpo }) => {
    const postId = idDaUrl(params.id);
    const b = await corpo();
    const texto = String(b.texto || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
    if (!texto) throw invalido("texto", "Comentário vazio.");
    if (contaCaracteres(texto) > 280) throw invalido("texto", "Máximo de 280 caracteres.");
    const db = load();
    if (!db.posts.some((p) => p.id === postId)) throw new ErroHttp(404, "Post não existe mais.", "nao_encontrado");
    const comentario = { id: novoId(), postId, usuarioId: eu.id, texto, criadoEm: new Date().toISOString() };
    db.comentarios.push(comentario);
    save();
    D.avisarStream({ tipo: "comentario", postId, nome: eu.nome });
    return {
      __status: 201,
      corpo: {
        ok: true,
        comentario: { id: comentario.id, texto, nome: eu.nome, foto: eu.foto ? D.urlMidia(eu.foto) : "", criadoEm: comentario.criadoEm, meu: true },
        comentariosN: db.comentarios.filter((c) => c.postId === postId).length
      }
    };
  });

  rota("DELETE", "/api/comentarios/:id", { auth: true }, ({ eu, params }) => {
    const comId = idDaUrl(params.id);
    const db = load();
    const i = db.comentarios.findIndex((c) => c.id === comId);
    if (i < 0) throw new ErroHttp(404, "Comentário não existe mais.", "nao_encontrado");
    const com = db.comentarios[i];
    const dono = db.posts.find((p) => p.id === com.postId);
    if (!(com.usuarioId === eu.id || (dono && dono.usuarioId === eu.id) || eu.papel === "admin")) {
      throw new ErroHttp(403, "Esse comentário não é seu.", "proibido");
    }
    db.comentarios.splice(i, 1);
    save();
    D.avisarStream({ tipo: "comentario-apagado", comentarioId: comId, postId: com.postId });
    return { ok: true };
  });

  rota("POST", "/api/seguir", { auth: true }, async ({ eu, corpo }) => {
    const b = await corpo();
    const alvo = Number(b.usuarioId);
    if (!Number.isSafeInteger(alvo) || alvo <= 0 || alvo === eu.id) throw invalido("usuarioId", "Não dá pra seguir essa conta.");
    const db = load();
    if (!db.usuarios.some((x) => x.id === alvo)) throw new ErroHttp(404, "Conta não existe.", "nao_encontrado");
    const i = db.seguindo.findIndex((s) => s.de === eu.id && s.para === alvo);
    let seguindo = false;
    if (i >= 0) db.seguindo.splice(i, 1);
    else {
      db.seguindo.push({ de: eu.id, para: alvo, em: new Date().toISOString() });
      seguindo = true;
    }
    save();
    return {
      seguindo,
      seguindoN: db.seguindo.filter((s) => s.de === eu.id).length,
      seguidores: db.seguindo.filter((s) => s.para === alvo).length
    };
  });

  // -------- administração
  rota("POST", "/api/sincronizar", { admin: true }, async () => {
    const db = await D.sincronizarPortal(true);
    D.sincronizarCalendario(db, true).catch(() => {});
    return { ok: true, meta: db.tabelaMeta, qtdTabela: (db.tabela || []).length, qtdNoticias: (db.noticias || []).length };
  });

  rota("GET", "/api/admin/status", { admin: true }, async () => {
    const ia = await D.checarIa();
    const db = load();
    const cal = D.lerCalendario();
    return {
      versao: VERSAO,
      uptimeSeg: Math.round(process.uptime()),
      memoriaMB: Math.round(process.memoryUsage().rss / 1048576),
      ia: { ligada: D.iaLigada(), groq: ia.groq, gemini: ia.gemini },
      apiFootball: { ligada: D.apiFootballLigada(), uso: D.usoApiFootball() },
      footballData: { ligada: D.footballDataLigada() },
      sportsDb: { ligada: D.sportsDbLigada(), chave: D.sportsDbKey() === "123" ? "free(123)" : "premium" },
      espn: { jogosNoCalendario: (cal.jogos || []).length, atualizadoEm: cal.atualizadoEm },
      tabela: { times: (db.tabela || []).length, meta: db.tabelaMeta || null },
      noticias: { total: (db.noticias || []).length, meta: db.noticiasMeta || null },
      contagens: {
        usuarios: db.usuarios.length,
        convidados: db.usuarios.filter((u) => u.convidado).length,
        posts: db.posts.length,
        comentarios: db.comentarios.length,
        curtidas: db.curtidas.length,
        jogosManuais: db.jogos.filter((j) => j.fonte === "admin").length,
        clubesCadastrados: (db.clubesExtra || []).length
      }
    };
  });

  const jogoManual = (j) => ({
    id: j.id, mandante: j.mandante, visitante: j.visitante, data: j.data, horario: j.horario, competicao: j.competicao,
    local: j.local || "", placarMandante: j.placarMandante, placarVisitante: j.placarVisitante, status: j.status
  });

  function lerJogo(b, atual) {
    const mandante = textoCurto(b.mandante !== undefined ? b.mandante : atual && atual.mandante, 80);
    const visitante = textoCurto(b.visitante !== undefined ? b.visitante : atual && atual.visitante, 80);
    const data = textoCurto(b.data !== undefined ? b.data : atual && atual.data, 10);
    const horario = textoCurto(b.horario !== undefined ? b.horario : atual && atual.horario, 5);
    if (!D.clubeOk(mandante)) throw invalido("mandante", "Time mandante não cadastrado.");
    if (!D.clubeOk(visitante)) throw invalido("visitante", "Time visitante não cadastrado.");
    if (mandante === visitante) throw invalido("visitante", "Mandante e visitante precisam ser times diferentes.");
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(data + "T12:00:00Z") : null;
    if (!dt || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== data) throw invalido("data", "Data inválida (use AAAA-MM-DD).");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) throw invalido("horario", "Horário inválido (use HH:MM).");
    const temPlacar = (v) => v !== undefined && v !== null && v !== "";
    const pm = b.placarMandante !== undefined ? b.placarMandante : atual && atual.placarMandante;
    const pv = b.placarVisitante !== undefined ? b.placarVisitante : atual && atual.placarVisitante;
    let placarMandante = null;
    let placarVisitante = null;
    if (temPlacar(pm) || temPlacar(pv)) {
      placarMandante = Number(pm);
      placarVisitante = Number(pv);
      if (!Number.isInteger(placarMandante) || !Number.isInteger(placarVisitante) || placarMandante < 0 || placarVisitante < 0 || placarMandante > 99 || placarVisitante > 99) {
        throw invalido("placarMandante", "Informe os dois placares (números inteiros).");
      }
    }
    const competicao = textoCurto(b.competicao !== undefined ? b.competicao : (atual && atual.competicao) || "Jogo cadastrado", 80) || "Jogo cadastrado";
    const local = textoCurto(b.local !== undefined ? b.local : (atual && atual.local) || "", 80);
    const status = placarMandante == null ? "agendado" : "encerrado";
    return { mandante, visitante, data, horario, placarMandante, placarVisitante, competicao, local, status };
  }

  rota("GET", "/api/admin/jogos", { admin: true }, () => ({
    jogos: load().jogos.filter((j) => j.fonte === "admin").sort((a, b) => String(b.data).localeCompare(String(a.data))).map(jogoManual)
  }));

  // RF28: o administrador cadastra jogos (hoje o painel alimenta o resumo e o chatbot mesmo sem internet).
  rota("POST", "/api/jogos", { admin: true }, async ({ corpo }) => {
    const campos = lerJogo(await corpo());
    const db = load();
    if (db.jogos.some((j) => j.fonte === "admin" && j.data === campos.data && j.mandante === campos.mandante && j.visitante === campos.visitante)) {
      throw new ErroHttp(409, "Esse jogo já está cadastrado.", "duplicado");
    }
    const jogo = { id: novoId(), ...campos, fonte: "admin", criadoEm: new Date().toISOString() };
    db.jogos.push(jogo);
    save();
    return { __status: 201, corpo: { jogo: jogoManual(jogo) } };
  });

  rota("PUT", "/api/jogos/:id", { admin: true }, async ({ params, corpo }) => {
    const db = load();
    const jogo = db.jogos.find((j) => j.fonte === "admin" && j.id === idDaUrl(params.id));
    if (!jogo) throw new ErroHttp(404, "Jogo cadastrado não encontrado.", "nao_encontrado");
    Object.assign(jogo, lerJogo(await corpo(), jogo));
    save();
    return { jogo: jogoManual(jogo) };
  });

  rota("DELETE", "/api/jogos/:id", { admin: true }, ({ params }) => {
    const db = load();
    const i = db.jogos.findIndex((j) => j.fonte === "admin" && j.id === idDaUrl(params.id));
    if (i < 0) throw new ErroHttp(404, "Jogo cadastrado não encontrado.", "nao_encontrado");
    db.jogos.splice(i, 1);
    save();
    return { ok: true };
  });

  // RF27: o administrador cadastra times (nome e sigla) que passam a aparecer na escolha do cadastro.
  rota("POST", "/api/times", { admin: true }, async ({ corpo }) => {
    const b = await corpo();
    const nome = textoCurto(b.nome, 60);
    const sigla = textoCurto(b.sigla, 6).toUpperCase();
    const pais = textoCurto(b.pais || "Brasil", 60);
    const liga = textoCurto(b.liga || "Cadastro manual", 60);
    if (nome.length < 2) throw invalido("nome", "Informe o nome do time.");
    if (!/^[A-Z0-9]{2,6}$/.test(sigla)) throw invalido("sigla", "A sigla precisa ter de 2 a 6 letras ou números.");
    if (!pais) throw invalido("pais", "Informe o país.");
    if (D.clubeOk(nome)) throw new ErroHttp(409, "Já existe um time com esse nome.", "duplicado", { campo: "nome" });
    const db = load();
    db.clubesExtra.push({ nome, sigla, pais, liga, criadoEm: new Date().toISOString() });
    definirExtras(db.clubesExtra);
    save();
    return { __status: 201, corpo: { time: { nome, sigla, pais, liga } } };
  });

  rota("DELETE", "/api/times/:nome", { admin: true }, ({ params }) => {
    const db = load();
    const i = db.clubesExtra.findIndex((c) => c.nome === params.nome);
    if (i < 0) throw new ErroHttp(404, "Time cadastrado não encontrado.", "nao_encontrado");
    if (db.usuarios.some((u) => u.time === params.nome || u.feedTime === params.nome)) {
      throw new ErroHttp(409, "Há torcedores neste time; não dá para remover.", "em_uso");
    }
    db.clubesExtra.splice(i, 1);
    definirExtras(db.clubesExtra);
    save();
    return { ok: true };
  });

  // -------- imagens
  rota("GET", "/img/avatar", ({ query, res, req }) => {
    const tipo = textoCurto(query.tipo || "iniciais", 12);
    const svg = D.svgAvatar(tipo, textoCurto(query.nome || "T", 40), textoCurto(query.time, 80));
    enviar(req, res, 200, "image/svg+xml; charset=utf-8", Buffer.from(svg), { "Cache-Control": "public, max-age=86400" });
  });

  rota("GET", "/img/escudo", async ({ query, res, req }) => {
    const nome = textoCurto(query.time || "time", 80);
    let pack = null;
    try { pack = await D.escudoEmDisco(nome); } catch { /* usa o desenho padrão */ }
    if (pack) {
      res.writeHead(200, { "Content-Type": pack.tipo, "Cache-Control": "public, max-age=604800" });
      return res.end(pack.buf);
    }
    enviar(req, res, 200, "image/svg+xml; charset=utf-8", Buffer.from(D.svgDoClube(nome)), { "Cache-Control": "public, max-age=600" });
  });

  rota("GET", "/img/midia", async ({ query, res }) => {
    if (!D.midiaAssinadaValida(query.u, query.s)) throw new ErroHttp(404, "Imagem não encontrada.", "nao_encontrado");
    let pack = null;
    try { pack = await D.midiaEmDisco(query.u); } catch { /* 404 abaixo */ }
    if (!pack) throw new ErroHttp(404, "Imagem indisponível.", "nao_encontrado");
    res.writeHead(200, { "Content-Type": pack.tipo, "Cache-Control": "public, max-age=86400" });
    res.end(pack.buf);
  });

  rota("GET", "/fotos/:nome", ({ params, res }) => {
    const nome = path.basename(params.nome);
    const full = path.join(DIR_FOTOS, nome);
    const tipos = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
    const tipo = tipos[path.extname(nome).toLowerCase()];
    if (!tipo || !full.startsWith(DIR_FOTOS) || !fs.existsSync(full)) throw new ErroHttp(404, "Foto não encontrada.", "nao_encontrado");
    res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "public, max-age=604800, immutable" });
    res.end(fs.readFileSync(full));
  });
}

module.exports = { registrar };
