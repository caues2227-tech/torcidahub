# Artefato 1 — Documento de Visão

**Projeto:** Torcida  
**Disciplina:** Análise e Projeto de Sistemas II  
**Professor:** Silvio Rogerio de Lucia  
**Grupo:** Cauê Souza Marinho, Bruno Souza, Erick, Kaique Souza, Guilherme Sousa  
**Data:** 25/08/2026

---

## 1. Introdução

Este documento apresenta a visão do sistema **Torcida**, uma aplicação web no estilo Twitter/Threads voltada exclusivamente ao futebol. O objetivo é alinhar o grupo, o professor e os demais interessados quanto ao problema, à solução proposta, ao escopo do MVP e às restrições do projeto.

---

## 2. Problema

O torcedor brasileiro acompanha o time de coração principalmente em redes sociais genéricas (X/Twitter, Instagram, Threads). Nesses ambientes, o conteúdo de futebol se mistura a outros assuntos, o feed não é organizado pelo time e não existe uma visão coletiva de qual clube tem mais torcida dentro da própria comunidade.

Na prática, isso gera três dificuldades:

1. **Falta de contexto:** o usuário não declara o time de coração como parte da identidade na plataforma, então o sistema não consegue priorizar o que importa para ele.
2. **Dispersão:** comentários sobre jogos e times se perdem no meio de outros temas.
3. **Ausência de indicador comunitário:** não há um ranking simples que mostre, na plataforma, qual time reúne mais torcedores.

---

## 3. Oportunidade

Há espaço para uma rede social **especializada em futebol**, com regra clara de identidade (time de coração no cadastro), feed com etiqueta do time, ranking de torcida e um resumo inteligente do dia.

O diferencial do Torcida não é copiar o Twitter. É usar o time de coração como eixo da experiência:

- o post já nasce ligado a um clube;
- o ranking mostra a força da torcida na plataforma;
- o resumo do dia e o chatbot concentram jogos e movimentação do time do usuário, com dados armazenados no próprio sistema.

Essa combinação é viável como MVP acadêmico: autenticação, publicação, consulta/relatório (ranking) e um módulo de resumo/chatbot, todos testáveis.

---

## 4. Objetivos

### 4.1 Objetivo geral

Desenvolver uma plataforma web no estilo Twitter/Threads exclusiva para futebol, na qual cada usuário informa o time de coração no cadastro e passa a publicar, acompanhar o feed, visualizar o ranking de torcida e receber um resumo do dia relacionado ao seu time.

### 4.2 Objetivos específicos

- Permitir cadastro, login e logout, com escolha obrigatória do time de coração.
- Permitir a publicação de posts em texto com etiqueta do time (imagem opcional).
- Disponibilizar feed com curtida e comentário.
- Exibir ranking de torcida (quantidade de usuários por time).
- Gerar o resumo do dia do time do usuário.
- Oferecer um chatbot simples para perguntas sobre os jogos do dia.
- Manter jogos, times, usuários e posts no banco de dados do próprio sistema, sem depender de API externa no momento da apresentação.

---

## 5. Público-alvo

Torcedores de futebol que já usam redes sociais para comentar jogos, escalação, contratações e resultados, com foco inicial no **público brasileiro**.

Perfil principal: jovem ou adulto com acesso a navegador web, que torce para um clube e quer um espaço só de futebol, ligado ao seu time.

Fora do público inicial: imprensa profissional, scouts, apostadores e uso corporativo.

---

## 6. Stakeholders

| Stakeholder | Papel | Interesse |
|---|---|---|
| Torcedor (usuário) | Ator principal | Cadastrar-se com o time, postar, ver o feed, ranking e resumo do dia |
| Administrador da plataforma | Ator interno | Cadastrar times e jogos do dia para alimentar ranking, resumo e chatbot |
| Equipe de desenvolvimento | Grupo da disciplina | Entregar o MVP, a documentação e os testes no prazo |
| Professor / banca | Avaliador | Verificar se o sistema atende ao ciclo da disciplina (análise, projeto, MVP, testes) |

---

## 7. Visão geral da solução

O Torcida é uma **aplicação web**. Após o login, o usuário vê:

1. **Cabeçalho** com identificação da plataforma.
2. **Campo de post** para publicar texto (imagem opcional) já associado ao time de coração.
3. **Card fixo “Resumo do dia”**, gerado a partir dos jogos e da movimentação do time no banco.
4. **Feed** de posts de outros torcedores, cada um com etiqueta do time, curtida e comentários.
5. **Aba Ranking**, com a classificação dos times segundo o número de torcedores cadastrados.
6. **Chatbot**, para perguntas como “quais jogos tem hoje?” e “resumo do meu time”.

A inteligência do resumo **não depende de API externa na banca**. Jogos e resultados ficam cadastrados no banco; o módulo de resumo/chatbot lê esses dados e, quando couber, os posts recentes do time.

---

## 8. Escopo (MVP)

Inclui:

- Cadastro, login e logout.
- Time de coração obrigatório no cadastro.
- Criar, listar e visualizar posts em texto com etiqueta do time.
- Imagem no post **opcional**.
- Feed.
- Curtir e comentar.
- Ranking de torcida.
- Card de resumo do dia.
- Chatbot simples sobre jogos do dia e resumo do time.
- Cadastro interno de times e de jogos (necessário para o resumo/chatbot).
- Banco de dados próprio para usuário, time, post, comentário e jogo.

---

## 9. Fora do escopo

Não fará parte desta versão:

- Stories.
- Chat privado entre usuários.
- Aplicativo mobile nativo.
- Transmissão ao vivo.
- Apostas, fantasy, marketplace ou venda de ingressos.
- Dependência obrigatória de API externa de jogos na apresentação.
- Recuperação de senha por e-mail (pode ficar para versão 2).
- Notificações push em tempo real.

---

## 10. Restrições

- O sistema deve funcionar em **navegador web**.
- O prazo segue o cronograma da disciplina, com MVP previsto para o fim de setembro e apresentação em novembro de 2026.
- A equipe é composta por cinco integrantes, com avaliação 360° em três etapas.
- A demonstração final precisa funcionar **offline de APIs de futebol de terceiros**.
- Linguagens e ferramentas devem ser as registradas neste documento e no Trello, salvo decisão formal do grupo.

---

## 11. Premissas

- Cada usuário torce para **um** time de coração nesta versão.
- Os times disponíveis no cadastro serão pré-cadastrados (ex.: clubes de Série A, ou lista definida pelo grupo).
- Haverá pelo menos um perfil de administrador para incluir jogos do dia.
- O ranking considera a quantidade de usuários cadastrados em cada time.
- O resumo do dia usa os jogos cadastrados no banco e, se houver, posts recentes daquele time.
- Imagens em posts não são obrigatórias para o MVP ser considerado completo.

---

## 12. Tecnologias pretendidas

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend | React | Interface de feed próxima ao Twitter/Threads, componentes reutilizáveis |
| Backend | Node.js + Express | API REST simples de integrar ao React e ao JWT |
| Banco de dados | PostgreSQL | Modelo relacional claro (usuário, time, post, comentário, jogo) |
| Autenticação | JWT | Sessão de usuário para as rotas protegidas |
| Versionamento | Git / GitHub | Exigência da disciplina e trabalho em grupo |
| Resumo / chatbot | Módulo interno + IA opcional | Lê dados do próprio banco; a IA apenas redige o texto |

---

## 13. Critério de sucesso do MVP

O MVP estará pronto quando um usuário conseguir:

1. criar conta informando o time de coração;
2. entrar no sistema;
3. publicar um post;
4. curtir e comentar;
5. ver o ranking de torcida;
6. ver o resumo do dia e perguntar ao chatbot quais jogos há no dia.

Esses fluxos deverão ter evidência de teste na Entrega 6.
