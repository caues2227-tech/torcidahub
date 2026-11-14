# Torcida

Rede social e portal de futebol. Cada pessoa escolhe o clube do coração e o site ganha as cores dele,
com placares ao vivo, tabela do Brasileirão, notícias, ranking de torcidas, uma linha do tempo de posts
(com foto, curtida e comentário) e um chatbot que responde com os dados do próprio site.

Trabalho da disciplina de Análise e Projeto de Sistemas II. Grupo: Cauê Souza Marinho, Bruno Souza, Erick,
Kaique Souza e Guilherme Sousa. Professor: Silvio Rogerio de Lucia.

> **Sobre os documentos das entregas 1 a 6:** eles descrevem uma arquitetura com React, Express, PostgreSQL
> e JWT. O que está implementado aqui é **Node.js puro, sem nenhuma dependência**, com um arquivo JSON como
> banco de dados. As regras de negócio (RN), requisitos (RF) e casos de uso foram mantidos; a tecnologia é que mudou.

## Como rodar

Precisa só do [Node.js](https://nodejs.org) 20 ou mais novo. Não há `npm install`.

```bash
cd sistema
node server.js        # ou: npm start
```

Abra <http://localhost:3000>. No Windows PowerShell, se o `npm` for bloqueado, use `npm.cmd start` ou `node server.js`.

Para outras pessoas da mesma rede acessarem, use o IP do computador (`http://192.168.x.x:3000`). O servidor
escuta em todas as interfaces por padrão. Para aceitar só este computador, defina `HOST=127.0.0.1`.

### Configuração (opcional)

Tudo funciona sem configurar nada. Para mudar algo, copie `.env.example` para `.env` e preencha só o que quiser.
O `.env` nunca vai para o Git. As principais variáveis:

| Variável | Para que serve |
| --- | --- |
| `ADMIN_CHAVE` | Liga o painel `/admin.html?k=SUA_CHAVE`. Vazia = painel desativado. |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | O chatbot passa a reescrever as respostas com IA. Sem chave, responde só com os dados do site. |
| `API_FOOTBALL_KEY` | Dados extras de jogos (plano grátis de 100 chamadas por dia; o servidor se limita a 80). |
| `FOOTBALL_DATA_KEY` | Agenda extra via [football-data.org](https://www.football-data.org/) (Premier, La Liga, Brasileirão…). |
| `SPORTSDB_KEY` | [TheSportsDB](https://www.thesportsdb.com/documentation) — padrão `123` (free). Premium no perfil do site. |
| `TORCIDA_SECRET` | Segredo das sessões (16+ caracteres). Vazio = o servidor gera um e guarda em `data/.segredo`. |
| `PORT`, `HOST`, `TRUST_PROXY` | Porta, endereço de escuta e confiança em proxy reverso. |
| `LOGIN_OBRIGATORIO=1` | Exige conta para ver qualquer página. |
| `DEMO_LOGIN=1` | Libera o login das contas de demonstração antigas (`@torcida.local`). |
| `TORCIDA_DATA` | Usa outra pasta de dados (bom para testar sem mexer nos dados reais). |

A lista completa, com comentários, está em [`.env.example`](.env.example).

## O que o site faz

- **Portal**: manchete, resumo do dia do seu clube, jogos de hoje, próximos jogos, últimos 5 resultados, tabela do Brasileirão e notícias de ge, Gazeta Esportiva e Terra.
- **Jogos**: agenda dos próximos dias com filtros (hoje, meu clube, por competição). Cada jogo tem uma página com chances, forma dos dois times, estádio e notícias do confronto.
- **Nação**: perfil, grade de fotos, linha do tempo, quem você segue, publicar com texto e foto, curtir (também com duplo clique), comentar, seguir outros torcedores.
- **Ranking**: clubes com mais torcedores cadastrados (desempate por posts).
- **Chatbot**: pergunta sobre tabela, jogos de hoje, próximo jogo, último resultado, desfalques, técnico, estádio, quem ganha o confronto.
- **Tema do clube**: as cores do site mudam conforme o clube escolhido, com contraste calculado para o texto continuar legível mesmo em clubes de cor clara.
- **Administração**: cadastrar jogos (com resultado) e times que não estão na lista, ver o estado das integrações, forçar a atualização da cobertura.

### Entrar sem cadastro, ou criar conta

O visitante que não escolheu clube só **lê**. Para participar, há dois caminhos:

1. **Perfil rápido** (`/onboarding.html`): nome + clube em dois toques. Cria um perfil só daquele navegador, que já pode postar, curtir e comentar.
2. **Conta** (`/cadastro.html`): nome, usuário, e-mail e senha. Se a pessoa já tinha um perfil rápido, ele é promovido a conta mantendo o mesmo id e todos os posts.

> Isto diverge do RF07 dos documentos (que exige login para qualquer ação) de propósito: numa apresentação, ninguém espera cadastrar para ver o site funcionando. Para voltar ao comportamento estrito, use `LOGIN_OBRIGATORIO=1`.

## Arquitetura

```
sistema/
├── server.js          ponto de entrada: HTTP, despacho das rotas, limites de uso, erros
├── clubes.js          lista de clubes por país e liga (inclui os cadastrados no painel)
├── marcas.js          cores, escudos e identidade visual de cada clube
├── lib/
│   ├── config.js      lê o .env e expõe constantes
│   ├── db.js          banco em memória, gravado em data/db.json de forma atômica e adiada
│   ├── auth.js        sessões assinadas (HS256), senhas (PBKDF2), segredo e chave do admin
│   ├── http.js        respostas padronizadas, roteador, limites de uso, arquivos estáticos
│   ├── net.js         chamadas externas e download seguro de imagens (barra SSRF)
│   ├── rotas.js       todas as rotas da API
│   ├── servicos.js    respostas maiores (portal, jogo, chatbot) e rotinas de fundo
│   └── dominio.js     regras de negócio, coleta ESPN/RSS, análise de jogos, chatbot
├── public/            páginas HTML, CSS e JavaScript do navegador (sem framework)
└── data/              banco de dados, escudos, fotos enviadas, cache de imagens
```

Decisões que valem saber:

- **Banco em memória + gravação adiada.** O JSON é lido uma vez e mantido em memória; as alterações são gravadas em lote por um arquivo temporário que substitui o anterior de uma vez. Isso evita perder dados quando várias requisições escrevem ao mesmo tempo (o código antigo relia e regravava o arquivo inteiro a cada requisição).
- **A tela nunca espera a internet.** As páginas respondem com o que já está guardado e a atualização (ESPN, notícias, ficha dos clubes) acontece em segundo plano. As páginas voltam a perguntar sozinhas de tempos em tempos e recebem o dado novo.
- **Placar ao vivo.** Com jogo rolando o servidor consulta a ESPN a cada 20 segundos e avisa os navegadores por `/api/stream` (SSE); sem jogo, a cada 5 minutos.
- **Segurança.** Sessões HS256 com expiração e segredo próprio; papel e time do usuário vêm sempre do banco, nunca de cabeçalhos do cliente; senhas com PBKDF2 (310 mil iterações); limite de tentativas de login por IP e por e-mail; imagens externas passam por um proxy com endereço **assinado** que bloqueia endereços privados (SSRF) e confere os bytes do arquivo; CSP sem script inline; cabeçalhos `nosniff`, `X-Frame-Options` e afins; upload de foto validado pelos bytes, não pela extensão.
- **Fontes de dados.** ESPN (placares, calendário, classificação, resultados de cada clube), RSS de ge/Gazeta/Terra (notícias), TheSportsDB e API-Football (opcionais, para complementar). Se alguma fonte cair, o site mostra o último dado guardado.
- **Funciona sem internet.** O documento de visão exige que a demonstração final não dependa de APIs de futebol de terceiros. O servidor guarda tudo que coleta (jogos, tabela, notícias, imagens), e o administrador cadastra jogos e times à mão, que alimentam o resumo do dia e o chatbot mesmo offline.
- **Imagens que a origem recusa.** Se um site de notícias bloqueia o nosso servidor (por exemplo, a Gazeta Esportiva devolve 403 para as fotos), o servidor lembra disso por algumas horas e deixa de oferecer aquela imagem, em vez de mostrar uma foto quebrada. Ele não tenta burlar a proteção.

## API

Respostas em JSON. Erros têm sempre o formato `{ "erro": "texto", "codigo": "...", "campo": "..." }`.
A autenticação é `Authorization: Bearer <token>` (o token vem do cadastro, do login ou do onboarding).

**Leitura (sem login)**

| Rota | O que devolve |
| --- | --- |
| `GET /api/saude` | Estado do servidor |
| `GET /api/portal` | Tudo da página inicial para o clube do visitante |
| `GET /api/hoje`, `/api/agenda` | Jogos de hoje; agenda dos próximos dias |
| `GET /api/jogo?id=` | Análise de um jogo |
| `GET /api/coracao?time=` | Análise do próximo jogo de um clube |
| `GET /api/tabela`, `/api/noticias`, `/api/fontes` | Classificação, notícias, fontes |
| `GET /api/busca?q=` | Clubes, jogos e notícias |
| `GET /api/ranking`, `/api/resumo` | Ranking de torcidas; resumo do dia |
| `GET /api/feed`, `/api/posts/:id`, `/api/nacao` | Linha do tempo e perfil |
| `GET /api/clubes`, `/api/times`, `/api/paises`, `/api/tema`, `/api/avatares` | Dados de clubes e tema |
| `GET /api/stream` | Eventos ao vivo (SSE): gols, posts, curtidas, comentários |
| `POST /api/chatbot` | `{ pergunta }` → `{ resposta }` |

**Conta**

| Rota | O que faz |
| --- | --- |
| `POST /api/onboarding` | `{ nome, time, feedTime }` → cria o perfil rápido |
| `POST /api/cadastro` | `{ nome, usuario, email, senha, time, feedTime }` → cria a conta (ou promove o perfil rápido) |
| `POST /api/login` | `{ email, senha }` → token |
| `POST /api/logout`, `GET /api/me`, `POST /api/perfil` | Sair, ver a sessão, editar perfil |

**Comunidade (exige sessão)**

`POST /api/posts` · `DELETE /api/posts/:id` · `POST /api/posts/:id/curtir` · `POST /api/posts/:id/comentar` ·
`DELETE /api/comentarios/:id` · `POST /api/seguir`

**Administração (cabeçalho `X-Admin-Key: <ADMIN_CHAVE>`)**

`GET /api/admin/status` · `POST /api/sincronizar` · `GET /api/admin/jogos` · `POST /api/jogos` ·
`PUT|DELETE /api/jogos/:id` · `POST /api/times` · `DELETE /api/times/:nome`

**Imagens**: `/img/escudo?time=`, `/img/avatar`, `/img/midia?u=&s=` (proxy assinado), `/fotos/:arquivo`.

## Dados e cópia de segurança

Tudo que o site guarda fica em `data/`: `db.json` (usuários, posts, curtidas, comentários, notícias, jogos),
`calendario.json`, `chats.json`, `fotos/` (fotos enviadas), `escudos/` e `midia/` (cache de imagens) e
`.segredo` (segredo das sessões). **Para fazer backup, copie a pasta `data/`.** Para zerar, pare o servidor e apague
`db.json`.

A pasta `data/_backup-antes-das-melhorias/` guarda o estado de antes da reestruturação: os três arquivos de dados e
uma cópia completa do código original em `codigo/` (inclusive o `server.js` monolítico antigo). Para voltar atrás, copie
`db.json`, `calendario.json` e `chats.json` de volta para `data/`. O backup não é lido nem usado pelo servidor e pode
ser apagado quando não for mais preciso.

## Contas de demonstração antigas

O banco original tinha contas de exemplo com e-mail `@torcida.local` e senha conhecida. Por segurança, elas não
entram por login (os posts delas continuam aparecendo). Para liberar o login, inicie com `DEMO_LOGIN=1`.
