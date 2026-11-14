/* Nação — rede social completa (mock + localStorage). */
(function () {
  "use strict";
  var T = window.Torcida;
  var esc = T.esc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "torcida.nacao.social.v6";
  var Live = window.TorcidaNacaoLive || null;
  var Data = window.TorcidaData || null;
  var noticiasLive = null;

  function feedEl() {
    return document.getElementById("feed-noticias") || document.getElementById("feedLista");
  }
  var REACTS = [
    { id: "fogo", emoji: "🔥", nome: "Fogo", cor: "#ff6b35" },
    { id: "gol", emoji: "⚽", nome: "Gol", cor: "#00c853" },
    { id: "raiva", emoji: "😤", nome: "Raiva", cor: "#e0442f" },
    { id: "fe", emoji: "🙏", nome: "Fé", cor: "#ffd600" },
    { id: "amor", emoji: "💚", nome: "Amor", cor: "#69f0ae" }
  ];
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var filtro = "todas";
  var estado = null;
  var pressTimer = null;
  var menuAberto = null;

  function euSocial() {
    var e = T.eu();
    var local = window.AUTH && AUTH.getUser && AUTH.getUser();
    var visitante = window.AUTH ? AUTH.estaVisitante() : !e.autenticado;
    var nome = e.autenticado ? e.nome : (local && local.nome) || (visitante ? "Visitante" : "Caue Souza Marinho");
    return {
      id: "me",
      nome: nome,
      handle: e.autenticado ? ("@" + (e.usuario || "caue")) : (visitante ? "@visitante" : "@caue"),
      time: e.time || "Santos",
      inicial: String(nome || "V").charAt(0).toUpperCase(),
      posts: 12,
      seguindo: 348,
      seguidores: 1247,
      desde: 2024,
      visitante: visitante
    };
  }

  var IMGS = [
    "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?auto=format&fm=webp&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fm=webp&fit=crop&w=800&q=60"
  ];

  function noticia(id, o) {
    var h = Math.max(1, o.h || 1);
    return {
      id: id, tipo: "noticia", fonte: o.fonte || "ge", nome: o.nome, verificado: true,
      time: o.time, quando: o.quando || ("há " + h + "h"), ts: Date.now() - h * 36e5,
      tag: o.tag || "jogo", tagLabel: o.tagLabel || "JOGO",
      titulo: o.titulo, resumo: o.resumo, texto: o.titulo,
      imagem: o.imagem || IMGS[id.length % IMGS.length],
      url: "#", comentarios: o.c || 40, reposts: o.r || 20, likes: o.l || 80,
      secao: o.secao || (o.tag === "mercado" || o.tag === "rebaixamento" ? "mercado" : "jogo"),
      comentariosLista: [], minhaReacao: null, reatores: ["A", "B"], reatoresN: o.l || 80
    };
  }

  function torcedor(id, o) {
    return {
      id: id, tipo: "torcedor", nome: o.nome, handle: o.handle, eu: !!o.eu, time: o.time,
      quando: o.quando || "há 3h", ts: Date.now() - (o.h || 3) * 36e5,
      texto: o.texto, comentarios: o.c || 20, reposts: o.r || 8, likes: o.l || 50,
      secao: o.secao || "clube", comentariosLista: o.cmts || [],
      minhaReacao: null, reatores: ["P", "N"], reatoresN: o.l || 50,
      imagem: o.imagem || null
    };
  }

  function buildPosts(me) {
    var n = [
      noticia("n1", { nome: "Globo Esporte", time: "Santos", h: 1, tag: "mercado", tagLabel: "MERCADO", titulo: "Santos acerta contratação de atacante argentino por empréstimo até dezembro", resumo: "Peixe fecha com jogador de 24 anos. Contrato até o fim do ano, com opção de compra.", c: 45, r: 23, l: 118 }),
      noticia("n2", { nome: "ESPN Brasil", time: "Flamengo", h: 2, tag: "jogo", tagLabel: "JOGO", titulo: "Flamengo x Bahia: Rubro-Negro quer voltar ao G4 com vitória no Maracanã", resumo: "Time carioca precisa vencer para encostar no G4. Bahia luta contra o rebaixamento.", c: 89, r: 45, l: 234 }),
      noticia("n3", { nome: "Lance!", time: "Coritiba", h: 3, tag: "rebaixamento", tagLabel: "REBAIXAMENTO", titulo: "Zona da degola: Coritiba, Juventude e Cuiabá brigam pra não cair", resumo: "Um ponto separa o 16º do 18º. Rodada decisiva nesta semana.", c: 156, r: 78, l: 345 }),
      noticia("n4", { nome: "UOL Futebol", time: "Palmeiras", h: 4, tag: "classico", tagLabel: "CLÁSSICO", titulo: "Palmeiras x Cruzeiro: Verdão recebe a Raposa em jogo direto", resumo: "Vitória garante vaga na Sul-Americana. Cruzeiro vem de três jogos sem perder.", c: 56, r: 28, l: 89 }),
      noticia("n5", { nome: "BBC Sport", time: "Real Madrid", h: 2, tag: "mercado", tagLabel: "MERCADO", titulo: "Real Madrid confirma contratação de jovem do RB Leipzig por €80 milhões", resumo: "Atacante de 19 anos assina até 2031. Maior transferência da janela europeia.", c: 312, r: 156, l: 890 }),
      noticia("n6", { nome: "Sky Sports", time: "Manchester City", h: 3, tag: "jogo", tagLabel: "JOGO", titulo: "Manchester City x Liverpool: título da Premier League em jogo no Etihad", resumo: "City lidera com 2 pontos. Liverpool precisa vencer e torcer por tropeço rival.", c: 445, r: 203, l: 1200 }),
      noticia("n7", { nome: "Marca", time: "Barcelona", h: 5, tag: "classico", tagLabel: "EL CLÁSICO", titulo: "Barcelona x Real Madrid: El Clásico decide o topo da La Liga", resumo: "Ambos invictos nos últimos 10 jogos. Camp Nou promete ser épico.", c: 789, r: 345, l: 2340 }),
      noticia("n8", { nome: "L'Équipe", time: "PSG", h: 6, tag: "mercado", tagLabel: "MERCADO", titulo: "PSG anuncia renovação de contrato com atacante até 2029", resumo: "Cláusula de rescisão sobe para €500 milhões.", c: 234, r: 112, l: 678 }),
      noticia("n9", { nome: "ESPN", time: "Inter Miami", h: 4, tag: "jogo", tagLabel: "MLS", titulo: "Inter Miami vence com hat-trick de Messi na MLS", resumo: "Argentino faz 3 gols na vitória por 4x1. Miami se aproxima do topo.", c: 567, r: 289, l: 1890 }),
      noticia("n10", { nome: "Goal.com", time: "Al-Hilal", h: 7, tag: "mercado", tagLabel: "MERCADO", titulo: "Al-Hilal oferece €120 milhões por meia do Arsenal", resumo: "Clube saudista quer reforçar elenco. Arsenal resiste, mas negocia.", c: 189, r: 78, l: 456 }),
      noticia("n11", { nome: "Sporting News", time: "Vissel Kobe", h: 8, tag: "jogo", tagLabel: "JAPÃO", titulo: "Vissel Kobe vence clássico japonês com gol de pênalti no último minuto", resumo: "Jogo tenso termina 2x1. Torcida lotou o Estádio de Kobe.", c: 34, r: 12, l: 67 }),
      noticia("n12", { nome: "CAF", time: "Al Ahly", h: 9, tag: "jogo", tagLabel: "ÁFRICA", titulo: "Al Ahly vence Champions Africana e é campeão continental", resumo: "Time egípcio conquista o título pela 5ª vez. Festa no Cairo.", c: 234, r: 112, l: 567 }),
      noticia("n13", { nome: "ge.globo", time: "Botafogo", h: 5, tag: "jogo", tagLabel: "JOGO", titulo: "Botafogo segura pressão e vence fora de casa por 1 a 0", resumo: "Gol no fim do primeiro tempo. Fogão segue na briga pelo G6.", c: 98, r: 41, l: 210 }),
      noticia("n14", { nome: "Terra", time: "São Paulo", h: 6, tag: "mercado", tagLabel: "MERCADO", titulo: "São Paulo monitora volante europeu para a próxima janela", resumo: "Negociação avançada. Clube quer fechar antes de dezembro.", c: 72, r: 33, l: 145 }),
      noticia("n15", { nome: "Gazeta Esportiva", time: "Corinthians", h: 7, tag: "jogo", tagLabel: "JOGO", titulo: "Corinthians testa reserva e empata em clássico paulista", resumo: "Jogo truncado. Técnico avalia mudanças para a próxima rodada.", c: 201, r: 88, l: 390 }),
      noticia("n16", { nome: "UOL Esporte", time: "Grêmio", h: 8, tag: "jogo", tagLabel: "JOGO", titulo: "Grêmio busca sequência positiva após vitória no Gre-Nal", resumo: "Tricolor soma 7 pontos nos últimos 3 jogos e respira na tabela.", c: 143, r: 55, l: 276 }),
      noticia("n17", { nome: "The Athletic", time: "Arsenal", h: 4, tag: "jogo", tagLabel: "JOGO", titulo: "Arsenal goleia e assume a liderança temporária da Premier League", resumo: "Hat-trick do camisa 9. Próximo teste: derby londrino.", c: 388, r: 167, l: 980 }),
      noticia("n18", { nome: "Sky Sports", time: "Chelsea", h: 5, tag: "mercado", tagLabel: "MERCADO", titulo: "Chelsea negocia saída de zagueiro para clube da Serie A", resumo: "Proposta italiana chega a €45 milhões. Jogador quer jogar mais.", c: 176, r: 64, l: 412 }),
      noticia("n19", { nome: "Marca", time: "Atlético Madrid", h: 6, tag: "jogo", tagLabel: "JOGO", titulo: "Atlético de Madrid vence e cola no G4 da La Liga", resumo: "Vitória sofrida em casa. Simeone elogia a intensidade do time.", c: 154, r: 61, l: 330 }),
      noticia("n20", { nome: "L'Équipe", time: "Marseille", h: 9, tag: "jogo", tagLabel: "JOGO", titulo: "Olympique de Marseille vence clássico e sobe na Ligue 1", resumo: "Gol nos acréscimos. Torcida invade o campo em festa.", c: 210, r: 95, l: 520 }),
      noticia("n21", { nome: "ESPN FC", time: "Bayern", h: 3, tag: "mercado", tagLabel: "MERCADO", titulo: "Bayern Munich mira lateral brasileiro da Seleção", resumo: "Olheiros alemães assistiram a 3 jogos seguidos. Conversa inicial já ocorreu.", c: 267, r: 119, l: 640 }),
      noticia("n22", { nome: "Goal.com", time: "Juventus", h: 10, tag: "jogo", tagLabel: "JOGO", titulo: "Juventus empatam e perdem chance de assumir a ponta da Serie A", resumo: "Jogo truncado em Turim. Técnico pede mais profundidade no ataque.", c: 188, r: 72, l: 401 }),
      noticia("n23", { nome: "Fox Sports", time: "River Plate", h: 11, tag: "jogo", tagLabel: "JOGO", titulo: "River Plate goleia e dispara na liderança do Argentino", resumo: "4 a 0 no Monumental. Próximo confronto: Libertadores.", c: 122, r: 48, l: 290 }),
      noticia("n24", { nome: "Olé", time: "Boca Juniors", h: 12, tag: "classico", tagLabel: "CLÁSSICO", titulo: "Boca Juniors prepara reforços para o Superclássico", resumo: "Dois titulares recuperados. Estádio esgotado com 3 dias de antecedência.", c: 301, r: 140, l: 720 })
    ];

    var t = [
      torcedor("p1", { nome: me.nome, handle: me.handle, eu: true, time: me.time, h: 2, texto: "Rony de volta é outra história. Peixe volta a assustar. 🔥", c: 89, r: 34, l: 203, cmts: [{ id: "c1", nome: "@nação_peixeira", texto: "Bora Santos! 🔥", quando: "há 5 min", likes: 4 }] }),
      torcedor("p2", { nome: "@peixeira_oficial", handle: "@peixeira_oficial", time: "Santos", h: 3, texto: "Alguém aí foi pro treino aberto hoje? O clima na Vila tá elétrico ⚡", c: 134, r: 67, l: 412 }),
      torcedor("p3", { nome: "@nação_peixeira", handle: "@nação_peixeira", time: "Santos", h: 4, texto: "Clássico domingo. Quem mais tá ansioso? 😤", c: 245, r: 89, l: 567 }),
      torcedor("p4", { nome: "@mengao_eterno", handle: "@mengao_eterno", time: "Flamengo", h: 5, texto: "Maracanã lotado. Esse é o tamanho do Flamengo. 🔴⚫", c: 178, r: 92, l: 640 }),
      torcedor("p5", { nome: "@verdaco_sp", handle: "@verdaco_sp", time: "Palmeiras", h: 6, texto: "Quando o Verdão joga assim, não tem pra ninguém. Porco acima de tudo!", c: 99, r: 40, l: 310 }),
      torcedor("p6", { nome: "@timao_raiz", handle: "@timao_raiz", time: "Corinthians", h: 7, texto: "Futebol ruim, mas a Fiel não abandona. É isso que o rival não entende.", c: 220, r: 110, l: 480 }),
      torcedor("p7", { nome: "@tricolor_sp", handle: "@tricolor_sp", time: "São Paulo", h: 8, texto: "Base + paciência. O Soberano volta. Confia no processo.", c: 66, r: 21, l: 155 }),
      torcedor("p8", { nome: "@fogao_1907", handle: "@fogao_1907", time: "Botafogo", h: 5, texto: "Estrela solitária brilhando de novo. Bota pra frente!", c: 81, r: 29, l: 198 }),
      torcedor("p9", { nome: "@gremio_nacao", handle: "@gremio_nacao", time: "Grêmio", h: 9, texto: "Gre-Nal é religião. Que venha o próximo.", c: 150, r: 70, l: 360 }),
      torcedor("p10", { nome: "@inter_colorado", handle: "@inter_colorado", time: "Internacional", h: 10, texto: "Beira-Rio é outro nível. Vamos Inter!", c: 112, r: 45, l: 275 }),
      torcedor("p11", { nome: "@madridista_br", handle: "@madridista_br", time: "Real Madrid", h: 3, texto: "Hala Madrid. Esse time não sabe perder final.", c: 340, r: 160, l: 890 }),
      torcedor("p12", { nome: "@cule_brasil", handle: "@cule_brasil", time: "Barcelona", h: 4, texto: "Visca Barça. El Clásico vai ser nosso.", c: 290, r: 130, l: 710 }),
      torcedor("p13", { nome: "@cityzen_br", handle: "@cityzen_br", time: "Manchester City", h: 5, texto: "Guardiola chess. City go again.", c: 180, r: 75, l: 420 }),
      torcedor("p14", { nome: "@ynwa_brasil", handle: "@ynwa_brasil", time: "Liverpool", h: 6, texto: "You'll Never Walk Alone. Domingo é dia de vermelho.", c: 260, r: 120, l: 650 }),
      torcedor("p15", { nome: "@psg_latino", handle: "@psg_latino", time: "PSG", h: 8, texto: "Ici c'est Paris. Título francês é o mínimo.", c: 95, r: 38, l: 240 })
    ];

    var bot = {
      id: "bot1", tipo: "bot", nome: "Bot TORCIDA.", time: me.time,
      quando: "há 8h", ts: Date.now() - 8.5 * 36e5,
      texto: "Baseado em forma recente, mando de campo e histórico. Vai ter que ser assim. ⚽",
      dial: 64, dialLbl: "PROBABILIDADE DE VITÓRIA · SANTOS x CORITIBA · QUA 18/11 19:30",
      comentarios: 67, reposts: 34, likes: 123, secao: "clube",
      comentariosLista: [], minhaReacao: null, reatores: ["B", "O", "T"], reatoresN: 100
    };

    /* Posts sociais mock NÃO entram no feed central — só GNews. Mantidos só se precisar no futuro. */
    return [];
  }

  function seed() {
    var me = euSocial();
    return {
      postsCount: me.posts,
      following: {},
      posts: [],
      notifs: [
        { id: "n1", emoji: "🔥", texto: "@peixeira_oficial reagiu FOGO ao seu post", quando: "há 2 min", lida: false },
        { id: "n2", emoji: "💬", texto: '@nação_peixeira comentou: "Bora Santos! 🔥"', quando: "há 5 min", lida: false },
        { id: "n3", emoji: "✓", texto: "Terra começou a seguir você", quando: "há 1 h", lida: false },
        { id: "n4", emoji: "🔁", texto: "@peixeira_oficial repostou seu post", quando: "há 3 h", lida: true },
        { id: "n5", emoji: "💬", texto: 'Lance! respondeu seu comentário: "Confirmação prevista pra segunda"', quando: "há 5 h", lida: true }
      ],
      sugeridos: [
        { id: "s1", handle: "@peixeira_oficial", time: "Santos", seguidores: "12.4k" },
        { id: "s2", handle: "@nação_peixeira", time: "Santos", seguidores: "8.2k" },
        { id: "s3", handle: "@terracruzeirense", time: "Cruzeiro", seguidores: "5.1k" },
        { id: "s4", handle: "@mengao_eterno", time: "Flamengo", seguidores: "22.1k" },
        { id: "s5", handle: "@madridista_br", time: "Real Madrid", seguidores: "41.0k" }
      ],
      topics: [
        { tag: "#Clássico", n: 452 },
        { tag: "#MercadoDaBola", n: 234 },
        { tag: "#PremierLeague", n: 198 },
        { tag: "#ElClasico", n: 512 },
        { tag: "#RetornoDoRony", n: 189 }
      ],
      jogos: [
        { m: "Santos", v: "Coritiba", h: "19:30" },
        { m: "Flamengo", v: "Bahia", h: "16:00" },
        { m: "Palmeiras", v: "Cruzeiro", h: "18:30" },
        { m: "City", v: "Liverpool", h: "13:00" },
        { m: "Barcelona", v: "Real Madrid", h: "17:00" }
      ]
    };
  }

  function carregar() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.posts && d.posts.length >= 30) return d;
      }
    } catch (err) { /* seed */ }
    return seed();
  }

  function salvar() {
    try { localStorage.setItem(KEY, JSON.stringify(estado)); } catch (err) { /* quota */ }
  }

  function mono(nome) {
    return esc((nome || "?").replace("@", "").charAt(0).toUpperCase());
  }

  function badgeEscudo(time, size) {
    size = size || 22;
    if (Live && Live.badgeImg) {
      return Live.badgeImg("/img/escudo?time=" + encodeURIComponent(time || ""), time || "?", size);
    }
    return '<img class="team-badge" src="/img/escudo?time=' + encodeURIComponent(time || "") +
      '" alt="' + esc(time || "") + '" width="' + size + '" height="' + size +
      '" data-size="' + size + '" data-fallback-mono loading="lazy" decoding="async">';
  }

  function aplicarTilt(container) {
    if (!container || reduced) return;
    container.querySelectorAll(".card-holo").forEach(function (card) {
      if (card._tiltBound) return;
      card._tiltBound = true;
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mouse-x", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--mouse-y", (y * 100).toFixed(1) + "%");
        card.style.transform =
          "perspective(800px) rotateX(" + ((y - 0.5) * -5).toFixed(2) +
          "deg) rotateY(" + ((x - 0.5) * 5).toFixed(2) + "deg) translateY(-3px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  function mostrarSkeletonNoticias(qtd) {
    qtd = qtd || 4;
    var feed = feedEl();
    if (!feed) return;
    var html = "";
    for (var i = 0; i < qtd; i++) {
      html +=
        '<div class="news-skeleton">' +
        '<div class="sk-line" style="width:40%"></div>' +
        '<div class="sk-line" style="width:90%"></div>' +
        '<div class="sk-line" style="width:75%"></div>' +
        '<div class="sk-block"></div>' +
        '<div class="sk-line" style="width:60%"></div></div>';
    }
    feed.innerHTML = html;
  }

  function mostrarErroNoticias() {
    var feed = feedEl();
    if (!feed) return;
    feed.innerHTML =
      '<div class="feed-erro">' +
      '<span class="fe-icon" aria-hidden="true">📡</span>' +
      "<p>Não consegui carregar as notícias agora.</p>" +
      '<button type="button" class="btn-retry" id="retryNoticias">Tentar de novo</button></div>';
    var btn = document.getElementById("retryNoticias");
    if (btn) {
      btn.addEventListener("click", function () {
        try {
          Object.keys(localStorage).forEach(function (k) {
            if (k.indexOf("torcida_noticias") === 0) localStorage.removeItem(k);
          });
        } catch (e) { /* */ }
        bootNoticias();
      });
    }
  }

  function reactMeta(id) {
    for (var i = 0; i < REACTS.length; i++) if (REACTS[i].id === id) return REACTS[i];
    return null;
  }

  function pintarEsq() {
    var me = euSocial();
    var html = '<div class="perfil-resumo">' +
      '<div class="perfil-resumo-top"><div class="av">' + esc(me.inicial) + "</div><div>" +
      "<strong>" + esc(me.nome) + "</strong>" +
      '<div class="clube-linha">' + badgeEscudo(me.time, 22) + "<span>" + esc(me.time) + "</span></div>" +
      "</div></div>" +
      '<p class="perfil-desde">Torcedor desde ' + me.desde + "</p>" +
      '<p class="perfil-metas" id="perfilMetas">' + estado.postsCount + " posts · " + me.seguindo + " seguindo · " + me.seguidores.toLocaleString("pt-BR") + " seguidores</p>" +
      '<button type="button" class="btn-editar-perfil" id="btnEditar">Editar perfil</button></div>' +
      '<div class="sugeridos" id="sugestoes-seguir"><h3>Sugeridos pra seguir</h3>' +
      estado.sugeridos.map(function (s) {
        var on = !!estado.following[s.handle];
        var av = s.badge
          ? (Live && Live.badgeImg ? Live.badgeImg(s.badge, s.time, 36) : badgeEscudo(s.time, 36))
          : '<div class="av">' + mono(s.handle) + "</div>";
        return '<div class="sugerido-card sugestao-row card-holo" data-handle="' + esc(s.handle) + '">' +
          av +
          '<div class="info sugestao-info"><strong class="sugestao-name">' + esc(s.handle) + "</strong>" +
          '<span class="sugestao-clube">' + esc(s.time) + (s.seguidores ? " · " + esc(s.seguidores) : "") + "</span></div>" +
          '<button type="button" class="btn-seguir' + (on ? " on seguindo" : "") + '" data-seguir="' + esc(s.handle) + '">' +
          (on ? "Seguindo" : "Seguir") + "</button></div>";
      }).join("") + "</div>";
    $("colEsq").innerHTML = html;
  }

  function pintarDir() {
    var html =
      '<div class="dir-card"><h2>Clima da nação hoje</h2>' +
      '<div class="clima-barra"><i style="width:72%"></i></div>' +
      '<p class="clima-meta">72% · 1.247 posts hoje</p></div>' +
      '<div class="dir-card"><h2>Em alta na nação</h2><div class="topic-lista">' +
      estado.topics.map(function (t) {
        return '<button type="button" data-topic="' + esc(t.tag) + '">' + esc(t.tag) + "<span>" + t.n + "</span></button>";
      }).join("") +
      "</div></div>" +
      '<div class="dir-card"><h2>Jogos de hoje</h2>' +
      '<div id="jogos-hoje-wrap">' +
      (estado.jogosHtml || '<div class="news-skeleton" style="margin:0"><div class="sk-line" style="width:70%"></div><div class="sk-line" style="width:90%"></div></div>') +
      "</div></div>" +
      '<div class="dir-card bot-dial-card"><h2>Probabilidade de vitória</h2>' +
      '<div class="bot-dial"><svg viewBox="0 0 180 100" aria-hidden="true">' +
      '<path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="251" stroke-dashoffset="90"/>' +
      '</svg><div class="bot-pct">64%</div></div>' +
      "<small>Santos × Coritiba · qua 18/11</small>" +
      '<p style="margin-top:12px"><a class="btn-pill cheio" href="/chatbot.html" style="display:inline-flex">Abrir Bot</a></p></div>';
    $("colDir").innerHTML = html;
  }

  function pintarFiltros() {
    var bases = [
      { id: "todas", nome: "Todas" },
      { id: "clube", nome: "Meu clube" },
      { id: "jogo", nome: "Jogos" },
      { id: "mercado", nome: "Mercado" },
      { id: "ge", nome: "ge" },
      { id: "terra", nome: "Terra" },
      { id: "lance", nome: "Lance!" }
    ];
    $("filtros").innerHTML = bases.map(function (f) {
      return '<button type="button" class="chip-n' + (filtro === f.id ? " on" : "") + '" data-filtro="' + esc(f.id) + '">' + esc(f.nome) + "</button>";
    }).join("");
  }

  function listaFiltrada() {
    var lista = (noticiasLive || []).slice();
    lista.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return lista.filter(function (p) {
      var fonte = String(p.fonte || p.nome || "").toLowerCase();
      if (filtro === "todas") return true;
      if (filtro === "clube") {
        var me = euSocial();
        var blob = ((p.titulo || "") + " " + (p.resumo || "")).toLowerCase();
        return blob.indexOf(String(me.time || "").toLowerCase()) >= 0;
      }
      if (filtro === "jogo") return p.tag === "jogo" || p.secao === "jogo";
      if (filtro === "mercado") return p.tag === "mercado" || p.secao === "mercado";
      if (filtro === "ge") return fonte.indexOf("ge") >= 0 || fonte.indexOf("globo") >= 0;
      if (filtro === "terra") return fonte.indexOf("terra") >= 0;
      if (filtro === "lance") return fonte.indexOf("lance") >= 0;
      if (filtro.indexOf("#") === 0) {
        var txt = ((p.titulo || "") + " " + (p.resumo || "")).toLowerCase();
        return txt.indexOf(filtro.slice(1).toLowerCase()) >= 0;
      }
      return true;
    });
  }

  function pintarComposer(quote) {
    var me = euSocial();
    var visitante = me.visitante;
    $("composer").innerHTML =
      '<div class="av">' + esc(me.inicial) + "</div>" +
      '<div class="composer-body">' +
      '<textarea id="composerTxt" rows="1" placeholder="' +
      (visitante ? "Crie uma conta pra postar na nação…" : (quote ? "Citar post…" : "No ar, nação? Conta aqui…")) +
      '" maxlength="500"' + (visitante ? " readonly" : "") + ">" + esc(quote || "") + "</textarea>" +
      '<div class="composer-acoes">' +
      '<button type="button" class="ico" title="Foto" aria-label="Foto">📷</button>' +
      '<button type="button" class="ico" title="Tag de jogo" aria-label="Jogo">⚽</button>' +
      '<button type="button" class="ico" title="Estatística" aria-label="Estatística">📊</button>' +
      '<button type="button" class="btn-postar" id="btnPostar" disabled data-exige-conta>Postar</button>' +
      "</div></div>";
    var ta = $("composerTxt");
    var btn = $("btnPostar");
    if (visitante) {
      ta.addEventListener("focus", function () { precisaConta("postar"); ta.blur(); });
      btn.addEventListener("click", function () { precisaConta("postar"); });
      return;
    }
    ta.addEventListener("input", function () {
      btn.disabled = !ta.value.trim();
      ta.style.height = "auto";
      ta.style.height = Math.min(120, ta.scrollHeight) + "px";
    });
    if (quote) {
      btn.disabled = false;
      ta.focus();
    }
  }

  function newsCardHtml(p) {
    var r = reactMeta(p.minhaReacao);
    var icoLike = r ? r.emoji : "❤️";
    var corLike = r ? r.cor : "";
    var tag = p.tag || "jogo";
    var fonte = (p.nome || p.fonte || "FONTE").toUpperCase();
    var icone = (Live && Live.ICONE_TAG && Live.ICONE_TAG[tag]) || "⚽";
    var labelTag = p.tagLabel || (Live && Live.LABEL_TAG && Live.LABEL_TAG[tag]) || tag.toUpperCase();
    var url = p.url && p.url !== "#" ? p.url : "#";
    var externa = url.indexOf("http") === 0;
    return '<article class="news-card post-card card-holo" id="post-' + p.id + '" data-id="' + p.id + '">' +
      '<div class="news-top">' +
      '<div class="news-source">' +
      '<span class="source-avatar source-icon" aria-hidden="true">' + mono(p.nome || p.fonte) + "</span>" +
      '<span class="source-name">' + esc(fonte) + "</span>" +
      '<span class="news-time">' + esc(p.quando || "") + "</span>" +
      "</div>" +
      '<span class="news-tag tag-' + esc(tag) + '">' + esc(labelTag) + "</span>" +
      "</div>" +
      '<h3 class="news-title">' + esc(p.titulo || p.texto || "") + "</h3>" +
      (p.resumo ? '<p class="news-excerpt">' + esc(p.resumo) + "</p>" : "") +
      '<div class="news-media-wrap">' +
      '<div class="news-media-fallback" data-tag="' + esc(tag) + '">' +
      '<span class="fb-icon" aria-hidden="true">' + icone + "</span>" +
      '<span class="fb-label">' + esc(labelTag) + "</span></div>" +
      (p.imagem
        ? '<img class="news-media-img" src="' + esc(p.imagem) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
        : "") +
      '<span class="media-tag">FOTO: ' + esc(fonte) + "</span></div>" +
      '<div class="news-actions news-footer post-acoes">' +
      '<button type="button" class="action-btn news-action acao" data-comentar="' + p.id + '">💬 ' + p.comentarios + "</button>" +
      '<button type="button" class="action-btn news-action acao" data-repost="' + p.id + '">🔄 ' + p.reposts + "</button>" +
      '<button type="button" class="action-btn news-action acao' + (r ? " on" : "") + '" data-reagir="' + p.id + '" style="' + (corLike ? "--react-color:" + corLike : "") + '"><span class="ico-acao">' + icoLike + "</span> " + p.likes + "</button>" +
      '<button type="button" class="action-btn news-action acao" data-share="' + p.id + '">↗</button>' +
      '<a class="read-more news-read-more" href="' + esc(url) + '"' +
      (externa ? ' target="_blank" rel="noopener"' : "") + ">Ler matéria →</a>" +
      "</div>" +
      '<div class="thread" id="thread-' + p.id + '" hidden>' +
      '<div class="thread-composer">' +
      '<div class="av">' + esc(euSocial().inicial) + "</div>" +
      '<input type="text" data-cmt-input="' + p.id + '" placeholder="Comentar…" maxlength="280">' +
      '<button type="button" data-cmt-enviar="' + p.id + '" disabled>Enviar</button></div>' +
      '<div class="cmts" id="cmts-' + p.id + '"></div></div></article>';
  }

  function cardHtml(p) {
    if (p.tipo === "noticia") return newsCardHtml(p);

    var me = euSocial();
    var handle = p.handle || p.nome;
    var seguindo = !!estado.following[handle];
    var r = reactMeta(p.minhaReacao);
    var icoLike = r ? r.emoji : "❤️";
    var corLike = r ? r.cor : "";
    var stack = (p.reatores || []).slice(0, 3).map(function (x) {
      return "<span>" + esc(x) + "</span>";
    }).join("");

    var corpoExtra = "";
    if (p.imagem) {
      corpoExtra += '<div class="post-foto"><img src="' + esc(p.imagem) + '" alt="" loading="lazy" decoding="async"></div>';
    }
    if (p.stat) {
      corpoExtra += '<div class="post-stat-tag"><div class="barras">' +
        p.stat.map(function (v) { return "<i style=\"height:" + v + '%"></i>'; }).join("") +
        "</div></div>";
    }
    if (p.dial != null) {
      corpoExtra +=
        '<div class="post-bot-dial">' +
        '<svg viewBox="0 0 180 100" width="180" aria-hidden="true">' +
        '<path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10" stroke-linecap="round"/>' +
        '<path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="251" stroke-dashoffset="' +
        Math.round(251 * (1 - p.dial / 100)) + '"/>' +
        '</svg><div class="pct">' + p.dial + '%</div><div class="lbl">' + esc(p.dialLbl || "") + "</div></div>";
    }

    var cmts = p.comentariosLista || [];
    var cmtsVis = p.cmtsAbertos ? cmts : cmts.slice(0, 5);
    var thread =
      '<div class="thread" id="thread-' + p.id + '" hidden>' +
      '<div class="thread-composer">' +
      '<div class="av">' + esc(me.inicial) + "</div>" +
      '<input type="text" data-cmt-input="' + p.id + '" placeholder="Comentar como ' + esc(me.nome.split(" ")[0]) + '…" maxlength="280">' +
      '<button type="button" data-cmt-enviar="' + p.id + '" disabled>Enviar</button></div>' +
      '<div class="cmts" id="cmts-' + p.id + '">' +
      cmtsVis.map(function (c) {
        return '<div class="comentario' + (c.resposta ? " resposta" : "") + '">' +
          '<div class="av">' + mono(c.nome) + '</div><div class="corpo"><strong>' + esc(c.nome) + "</strong>" +
          "<p>" + esc(c.texto) + '</p><div class="meta-c"><span>' + esc(c.quando || "agora") + "</span>" +
          '<button type="button" data-cmt-like="' + c.id + '">Curtir</button>' +
          '<button type="button" data-cmt-resp="' + p.id + '" data-para="' + esc(c.nome) + '">Responder</button></div></div></div>';
      }).join("") +
      (cmts.length > 5 && !p.cmtsAbertos
        ? '<button type="button" class="ver-mais-cmts" data-ver-cmts="' + p.id + '">Ver todos os ' + cmts.length + " comentários</button>"
        : "") +
      "</div></div>";

    return '<article class="post-card card-holo" id="post-' + p.id + '" data-id="' + p.id + '">' +
      '<header class="post-cab">' +
      '<div class="av">' + (p.tipo === "bot" ? "T" : mono(p.nome)) + "</div>" +
      '<div class="quem"><div class="linha1"><strong>' + esc(p.nome) + "</strong>" +
      (p.verificado ? '<span class="verificado" title="Verificado">✓</span>' : "") +
      (seguindo ? '<span class="verificado" title="Seguindo">✓</span>' : "") +
      (p.tipo === "fonte" ? '<span class="badge-fonte">FONTE</span>' : "") +
      (!p.eu && !seguindo && p.tipo !== "bot"
        ? '<button type="button" class="btn-seguir-mini" data-seguir="' + esc(handle) + '">Seguir</button>'
        : (seguindo && !p.eu
          ? '<button type="button" class="btn-seguir-mini on" data-seguir="' + esc(handle) + '">Seguindo</button>'
          : "")) +
      '</div><div class="meta">' +
      (p.time && p.time !== "Mercado" && p.time !== "Jogos"
        ? badgeEscudo(p.time, 18) + "<span>" + esc(p.time) + "</span>·"
        : "<span>" + esc(p.time || "") + "</span>·") +
      "<span>" + esc(p.quando) + "</span></div></div>" +
      '<button type="button" class="post-menu" data-menu="' + p.id + '" aria-label="Opções">⋯</button>' +
      "</header>" +
      (p.reatoresN
        ? '<div class="reacoes-stack"><div class="avs">' + stack + '</div><span class="mais">+' + (p.reatoresN || 0) + "</span></div>"
        : "") +
      '<p class="post-texto">' + esc(p.texto) + "</p>" +
      corpoExtra +
      '<div class="post-acoes">' +
      '<button type="button" class="acao" data-comentar="' + p.id + '"><span class="ico-acao">💬</span><span data-cnt="cmt">' + p.comentarios + "</span></button>" +
      '<button type="button" class="acao" data-repost="' + p.id + '"><span class="ico-acao">🔁</span><span data-cnt="rp">' + p.reposts + "</span></button>" +
      '<button type="button" class="acao' + (r ? " on" : "") + '" data-reagir="' + p.id + '" style="' + (corLike ? "--react-color:" + corLike : "") + '"><span class="ico-acao' + (r ? " pop-react" : "") + '">' + icoLike + '</span><span data-cnt="lk" style="' + (corLike ? "color:" + corLike : "") + '">' + p.likes + "</span></button>" +
      '<button type="button" class="acao" data-share="' + p.id + '"><span class="ico-acao">↗</span><span>Share</span></button>' +
      "</div>" + thread + "</article>";
  }

  function pintarFeed(animId) {
    var feed = feedEl();
    if (!feed) return;

    if (noticiasLive === null) {
      mostrarErroNoticias();
      return;
    }

    var lista = listaFiltrada();
    if (!lista.length) {
      feed.innerHTML = T.vazio
        ? T.vazio("Nada nesse filtro", "Troque o chip acima pra ver outra cobertura.")
        : '<p class="nj-next" style="padding:24px;text-align:center">Nada nesse filtro.</p>';
      return;
    }

    /* Feed central = só cards de notícia GNews (nunca posts fake) */
    feed.innerHTML = lista.map(function (p) {
      return newsCardHtml(p);
    }).join("");

    if (animId) {
      var el = document.getElementById("post-" + animId);
      if (el) el.classList.add("entrada");
    }
    aplicarTilt(feed);
    if (window.gsap && !reduced) {
      var cards = feed.querySelectorAll(".news-card");
      gsap.from(cards, {
        opacity: 0,
        y: 24,
        duration: 0.5,
        stagger: 0.07,
        ease: "power2.out",
        clearProps: "transform,opacity"
      });
    }
  }

  function pintarMarquee() {
    var base = (noticiasLive && noticiasLive.length) ? noticiasLive : [];
    var textos = base.slice(0, 10).map(function (p) {
      return (p.fonte || p.nome || "nação") + ": " + (p.titulo || p.texto || "").slice(0, 60) +
        " · " + (p.quando || "");
    });
    if (!textos.length) textos = ["Torcida. · notícias ao vivo ·"];
    var linha = textos.join(" · ") + " · ";
    $("marquee").innerHTML = '<span data-marquee-dup>' + esc(linha) + esc(linha) + "</span>";
  }

  function syncNotifSino() {
    if (!window.TorcidaNotif || !TorcidaNotif.setNotifs) return;
    TorcidaNotif.setNotifs((estado.notifs || []).map(function (n) {
      return { id: n.id, emoji: n.emoji || "🔔", texto: n.texto, tempo: n.quando, lida: !!n.lida };
    }));
  }

  function pintarNotifs() {
    syncNotifSino();
  }

  function injetarSino() {
    if (window.TorcidaNotif && TorcidaNotif.boot) TorcidaNotif.boot();
    syncNotifSino();
  }

  function abrirNotif(on) {
    /* drawer legado desativado — usa dropdown do sino */
    var drawer = $("notifDrawer");
    var back = $("notifBackdrop");
    if (drawer) drawer.hidden = true;
    if (back) back.hidden = true;
    if (on) syncNotifSino();
  }

  function seguir(handle) {
    if (precisaConta("seguir torcedores")) return;
    if (estado.following[handle]) {
      delete estado.following[handle];
      T.toast("Deixou de seguir " + handle);
    } else {
      estado.following[handle] = true;
      T.toast("Agora você segue " + handle + " ✓");
    }
    salvar();
    pintarEsq();
    pintarFeed();
  }

  function acharPost(id) {
    var i;
    if (noticiasLive) {
      for (i = 0; i < noticiasLive.length; i++) if (String(noticiasLive[i].id) === String(id)) return noticiasLive[i];
    }
    for (i = 0; i < estado.posts.length; i++) if (String(estado.posts[i].id) === String(id)) return estado.posts[i];
    return null;
  }

  function fecharMenus() {
    document.querySelectorAll(".react-menu, .repost-menu, .post-menu-drop").forEach(function (el) { el.remove(); });
    menuAberto = null;
  }

  function abrirReactMenu(btn, postId) {
    fecharMenus();
    var menu = document.createElement("div");
    menu.className = "react-menu";
    menu.innerHTML = REACTS.map(function (r) {
      return '<button type="button" title="' + r.nome + '" data-react-pick="' + r.id + '" data-pid="' + postId + '">' + r.emoji + "</button>";
    }).join("");
    btn.appendChild(menu);
    menuAberto = menu;
  }

  function setReacao(postId, reactId) {
    var p = acharPost(postId);
    if (!p) return;
    if (p.minhaReacao === reactId || (!reactId && p.minhaReacao)) {
      p.minhaReacao = null;
      p.likes = Math.max(0, (p.likes || 0) - 1);
    } else {
      if (!p.minhaReacao) p.likes = (p.likes || 0) + 1;
      p.minhaReacao = reactId;
    }
    salvar();
    pintarFeed();
  }

  function countUp(el, to) {
    if (!el || reduced) { if (el) el.textContent = String(to); return; }
    var from = parseInt(el.textContent, 10) || 0;
    if (from === to) return;
    var t0 = performance.now();
    function tick(now) {
      var k = Math.min(1, (now - t0) / 300);
      el.textContent = String(Math.round(from + (to - from) * k));
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function precisaConta(acao) {
    if (window.AUTH && typeof AUTH.bloquearSeVisitante === "function") {
      return AUTH.bloquearSeVisitante(acao || "participar");
    }
    var e = T.eu();
    if (e.autenticado) return false;
    if (typeof T.exigirConta === "function") T.exigirConta(acao || "isso");
    else T.toast("Crie uma conta pra " + (acao || "interagir") + " na nação");
    return true;
  }

  /* Eventos */
  document.addEventListener("click", function (ev) {
    var t = ev.target;

    var chip = t.closest("[data-filtro]");
    if (chip) {
      filtro = chip.getAttribute("data-filtro");
      pintarFiltros();
      pintarFeed();
      return;
    }

    var topic = t.closest("[data-topic]");
    if (topic) {
      filtro = topic.getAttribute("data-topic");
      pintarFiltros();
      pintarFeed();
      return;
    }

    var seg = t.closest("[data-seguir]");
    if (seg) {
      seguir(seg.getAttribute("data-seguir"));
      return;
    }

    if (t.closest("#btnEditar")) {
      if (precisaConta("editar o perfil")) return;
      T.toast("Perfil em breve — por enquanto troque o clube no onboarding.");
      return;
    }

    var menuBtn = t.closest("[data-menu]");
    if (menuBtn) {
      var pid = menuBtn.getAttribute("data-menu");
      fecharMenus();
      var drop = document.createElement("div");
      drop.className = "post-menu-drop";
      drop.innerHTML =
        '<button type="button" data-seguir-menu="' + pid + '">Seguir</button>' +
        '<button type="button" data-silenciar="' + pid + '">Silenciar</button>' +
        '<button type="button" data-share="' + pid + '">Compartilhar</button>' +
        '<button type="button" data-denunciar="' + pid + '">Denunciar</button>';
      menuBtn.parentElement.style.position = "relative";
      menuBtn.parentElement.appendChild(drop);
      menuAberto = drop;
      return;
    }

    var segMenu = t.closest("[data-seguir-menu]");
    if (segMenu) {
      var pp = acharPost(segMenu.getAttribute("data-seguir-menu"));
      if (pp) seguir(pp.handle || pp.nome);
      fecharMenus();
      return;
    }

    if (t.closest("[data-silenciar], [data-denunciar]")) {
      T.toast("Registrado. Obrigado pelo feedback.");
      fecharMenus();
      return;
    }

    var cmtBtn = t.closest("[data-comentar]");
    if (cmtBtn) {
      var id = cmtBtn.getAttribute("data-comentar");
      var th = document.getElementById("thread-" + id);
      if (th) th.hidden = !th.hidden;
      return;
    }

    var verCmts = t.closest("[data-ver-cmts]");
    if (verCmts) {
      var vp = acharPost(verCmts.getAttribute("data-ver-cmts"));
      if (vp) { vp.cmtsAbertos = true; pintarFeed(); var th2 = document.getElementById("thread-" + vp.id); if (th2) th2.hidden = false; }
      return;
    }

    var env = t.closest("[data-cmt-enviar]");
    if (env) {
    if (precisaConta("comentar")) return;
      var cid = env.getAttribute("data-cmt-enviar");
      var inp = document.querySelector('[data-cmt-input="' + cid + '"]');
      var txt = (inp && inp.value || "").trim();
      if (!txt) return;
      var post = acharPost(cid);
      if (!post) return;
      post.comentariosLista = post.comentariosLista || [];
      post.comentariosLista.unshift({
        id: "c" + Date.now(),
        nome: euSocial().nome.split(" ")[0],
        texto: txt,
        quando: "agora",
        likes: 0
      });
      post.comentarios = (post.comentarios || 0) + 1;
      inp.value = "";
      salvar();
      pintarFeed();
      var th3 = document.getElementById("thread-" + cid);
      if (th3) th3.hidden = false;
      T.toast("Comentário publicado");
      return;
    }

    var resp = t.closest("[data-cmt-resp]");
    if (resp) {
      var rid = resp.getAttribute("data-cmt-resp");
      var para = resp.getAttribute("data-para") || "";
      var rin = document.querySelector('[data-cmt-input="' + rid + '"]');
      if (rin) { rin.value = para + " "; rin.focus(); }
      return;
    }

    var pick = t.closest("[data-react-pick]");
    if (pick) {
      if (precisaConta("reagir")) { fecharMenus(); return; }
      setReacao(pick.getAttribute("data-pid"), pick.getAttribute("data-react-pick"));
      fecharMenus();
      return;
    }

    var reagir = t.closest("[data-reagir]");
    if (reagir && !t.closest(".react-menu")) {
      if (precisaConta("reagir")) return;
      var rid2 = reagir.getAttribute("data-reagir");
      var post2 = acharPost(rid2);
      if (post2 && post2.minhaReacao) setReacao(rid2, null);
      else setReacao(rid2, "amor");
      return;
    }

    var rp = t.closest("[data-repost]");
    if (rp && !t.closest(".repost-menu")) {
      if (precisaConta("repostar")) return;
      fecharMenus();
      var menu = document.createElement("div");
      menu.className = "repost-menu";
      var rpid = rp.getAttribute("data-repost");
      menu.innerHTML =
        '<button type="button" data-rp-do="' + rpid + '">Repostar</button>' +
        '<button type="button" data-rp-citar="' + rpid + '">Citar</button>';
      rp.appendChild(menu);
      menuAberto = menu;
      return;
    }

    var rpDo = t.closest("[data-rp-do]");
    if (rpDo) {
      if (precisaConta("repostar")) { fecharMenus(); return; }
      var pdo = acharPost(rpDo.getAttribute("data-rp-do"));
      if (pdo) {
        pdo.reposts = (pdo.reposts || 0) + 1;
        salvar();
        pintarFeed();
        T.toast("Repostado pra nação");
      }
      fecharMenus();
      return;
    }

    var rpCitar = t.closest("[data-rp-citar]");
    if (rpCitar) {
      if (precisaConta("citar um post")) { fecharMenus(); return; }
      var pc = acharPost(rpCitar.getAttribute("data-rp-citar"));
      if (pc) pintarComposer("🔁 " + (pc.nome || "") + ": " + (pc.texto || "").slice(0, 120));
      fecharMenus();
      return;
    }

    var share = t.closest("[data-share]");
    if (share) {
      var sid = share.getAttribute("data-share");
      var url = location.origin + "/feed.html#post-" + sid;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { T.toast("Link copiado"); }).catch(function () { T.toast(url); });
      } else T.toast(url);
      fecharMenus();
      return;
    }

    if (t.closest("#btnPostar")) {
      if (precisaConta("postar")) return;
      var ta = $("composerTxt");
      var texto = (ta && ta.value || "").trim();
      if (!texto) return;
      var me = euSocial();
      var novo = {
        id: "p" + Date.now(),
        tipo: "torcedor",
        nome: me.nome.split(" ")[0],
        handle: me.handle,
        eu: true,
        time: me.time,
        quando: "agora",
        ts: Date.now(),
        texto: texto,
        comentarios: 0,
        reposts: 0,
        likes: 0,
        secao: "clube",
        comentariosLista: [],
        minhaReacao: null,
        reatores: [me.inicial],
        reatoresN: 1
      };
      estado.posts.unshift(novo);
      estado.postsCount = (estado.postsCount || 12) + 1;
      salvar();
      pintarComposer();
      pintarEsq();
      pintarMarquee();
      pintarFeed(novo.id);
      T.toast("No ar pra nação ⚽");
      return;
    }

    if (t.closest("#notifFechar") || t.closest("#notifBackdrop")) {
      if (window.TorcidaNotif) TorcidaNotif.fechar();
      abrirNotif(false);
      return;
    }

    if (t.closest("#markRead") || t.closest("#notifLerTodas")) {
      estado.notifs.forEach(function (n) { n.lida = true; });
      salvar();
      syncNotifSino();
      return;
    }

    var ni = t.closest(".notif-item[data-nid], [data-nid]");
    if (ni && ni.closest("#notifList, #notifLista, .notif-dropdown")) {
      var nn = estado.notifs.find(function (x) { return String(x.id) === String(ni.getAttribute("data-nid")); });
      if (nn) { nn.lida = true; salvar(); syncNotifSino(); }
      return;
    }

    if (!t.closest(".react-menu") && !t.closest(".repost-menu") && !t.closest(".post-menu-drop") && !t.closest("[data-menu]") && !t.closest("[data-repost]")) {
      fecharMenus();
    }
  });

  document.addEventListener("input", function (ev) {
    var inp = ev.target.closest("[data-cmt-input]");
    if (!inp) return;
    clearTimeout(inp._deb);
    inp._deb = setTimeout(function () {
      var btn = document.querySelector('[data-cmt-enviar="' + inp.getAttribute("data-cmt-input") + '"]');
      if (btn) btn.disabled = !inp.value.trim();
    }, 300);
  });

  /* Long-press reações */
  document.addEventListener("pointerdown", function (ev) {
    var btn = ev.target.closest("[data-reagir]");
    if (!btn) return;
    pressTimer = setTimeout(function () {
      if (precisaConta("reagir")) return;
      abrirReactMenu(btn, btn.getAttribute("data-reagir"));
    }, 500);
  });
  document.addEventListener("pointerup", function () { clearTimeout(pressTimer); });
  document.addEventListener("pointerleave", function () { clearTimeout(pressTimer); });
  document.addEventListener("pointercancel", function () { clearTimeout(pressTimer); });

  /* Boot */
  estado = carregar();
  pintarEsq();
  pintarDir();
  pintarFiltros();
  pintarComposer();
  pintarMarquee();
  mostrarSkeletonNoticias(4);
  setTimeout(injetarSino, 50);
  setTimeout(injetarSino, 400);

  async function bootNoticias() {
    mostrarSkeletonNoticias(4);
    try {
      if (!Live || !Live.getNoticias) {
        noticiasLive = null;
        mostrarErroNoticias();
        return;
      }
      var noticias = await Live.getNoticias();
      noticiasLive = noticias;
      if (!noticias || !noticias.length) {
        mostrarErroNoticias();
        return;
      }
      pintarFeed();
      pintarMarquee();
    } catch (e) {
      console.error("Falha total em notícias:", e && e.message ? e.message : e);
      noticiasLive = null;
      mostrarErroNoticias();
    }
  }

  async function carregarJogosLive() {
    if (!Live) return;
    try {
      var jogos = await Live.getJogosHoje();
      var proximo = (!jogos || !jogos.length) ? await Live.buscarProximoJogo() : null;
      estado.jogosHtml = Live.htmlJogosHoje(jogos, proximo);
      estado.jogos = (jogos || []).map(function (j) {
        return { m: j.casa, v: j.fora, h: j.hora };
      });
      var wrap = document.getElementById("jogos-hoje-wrap");
      if (wrap) wrap.innerHTML = estado.jogosHtml;
      else pintarDir();
    } catch (e) {
      console.warn("Jogos live falhou:", e && e.message ? e.message : e);
      var wrap2 = document.getElementById("jogos-hoje-wrap");
      if (wrap2) {
        wrap2.innerHTML = '<div class="no-jogos"><p class="nj-title">SEM JOGOS HOJE</p><p class="nj-next">Não deu pra carregar agora</p></div>';
      }
    }
  }

  async function carregarSugestoesLive() {
    if (!Live || !Live.carregarSugestoes) return;
    try {
      var sug = await Live.carregarSugestoes();
      if (sug && sug.length) {
        estado.sugeridos = sug;
        salvar();
        pintarEsq();
      }
    } catch (e) {
      console.warn("Sugestões live falhou:", e && e.message ? e.message : e);
    }
  }

  bootNoticias();
  Promise.all([carregarJogosLive(), carregarSugestoesLive()]);
  setInterval(carregarJogosLive, 5 * 60 * 1000);

  if (location.hash && location.hash.indexOf("#post-") === 0) {
    setTimeout(function () {
      var el = document.querySelector(location.hash);
      if (el) el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }, 800);
  }
})();
