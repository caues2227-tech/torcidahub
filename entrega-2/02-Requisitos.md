# Artefato 2 — Requisitos

**Projeto:** Torcida  
**Disciplina:** Análise e Projeto de Sistemas II  
**Professor:** Silvio Rogerio de Lucia  
**Grupo:** Cauê Souza Marinho, Bruno Souza, Erick, Kaique Souza, Guilherme Sousa  
**Data:** 25/08/2026

---

## 1. Introdução

Este artefato especifica os requisitos do MVP do Torcida. Os requisitos funcionais descrevem o que o sistema deve fazer. Os requisitos não funcionais descrevem restrições de qualidade, segurança e operação.

Prioridade:

- **Alta:** obrigatório no MVP
- **Média:** desejável se o prazo permitir
- **Baixa:** versão 2

---

## 2. Requisitos funcionais

### 2.1 Autenticação e perfil

| ID | Requisito | Prioridade |
|---|---|---|
| RF01 | O sistema deverá permitir o cadastro de usuário com nome, e-mail, senha e time de coração. | Alta |
| RF02 | O sistema deverá exigir o time de coração como campo obrigatório no cadastro. | Alta |
| RF03 | O sistema deverá validar e-mail único, senha com mínimo de 6 caracteres e preenchimento dos campos obrigatórios. | Alta |
| RF04 | O sistema deverá permitir o login com e-mail e senha. | Alta |
| RF05 | O sistema deverá recusar o login quando o e-mail ou a senha estiverem incorretos. | Alta |
| RF06 | O sistema deverá permitir o logout. | Alta |
| RF07 | O sistema deverá impedir o acesso ao feed, ao ranking e ao resumo do dia sem autenticação. | Alta |

### 2.2 Posts e feed

| ID | Requisito | Prioridade |
|---|---|---|
| RF08 | O sistema deverá permitir que o usuário autenticado crie um post em texto. | Alta |
| RF09 | O sistema deverá associar automaticamente a etiqueta do time de coração ao post. | Alta |
| RF10 | O sistema deverá permitir imagem no post de forma opcional. | Média |
| RF11 | O sistema deverá listar o feed de posts em ordem cronológica inversa (mais recente primeiro). | Alta |
| RF12 | O sistema deverá exibir, em cada post, autor, time, texto, data, quantidade de curtidas e comentários. | Alta |
| RF13 | O sistema deverá limitar o texto do post a 280 caracteres. | Alta |

### 2.3 Interações

| ID | Requisito | Prioridade |
|---|---|---|
| RF14 | O sistema deverá permitir curtir um post. | Alta |
| RF15 | O sistema deverá permitir remover a própria curtida. | Alta |
| RF16 | O sistema deverá impedir mais de uma curtida do mesmo usuário no mesmo post. | Alta |
| RF17 | O sistema deverá permitir comentar um post. | Alta |
| RF18 | O sistema deverá listar os comentários de um post com autor e data. | Alta |

### 2.4 Ranking de torcida

| ID | Requisito | Prioridade |
|---|---|---|
| RF19 | O sistema deverá exibir o ranking de torcida, ordenado pela quantidade de usuários cadastrados em cada time. | Alta |
| RF20 | O sistema deverá mostrar posição, nome do time e número de torcedores. | Alta |
| RF21 | O sistema deverá atualizar o ranking automaticamente quando um novo usuário se cadastrar. | Alta |

### 2.5 Resumo do dia e chatbot

| ID | Requisito | Prioridade |
|---|---|---|
| RF22 | O sistema deverá exibir um card fixo “Resumo do dia” com texto referente ao time de coração do usuário logado. | Alta |
| RF23 | O sistema deverá montar o resumo do dia a partir dos jogos cadastrados no banco e, quando houver, de posts recentes daquele time. | Alta |
| RF24 | O sistema deverá oferecer um chatbot para o usuário perguntar quais jogos há no dia. | Alta |
| RF25 | O sistema deverá permitir que o chatbot informe o resumo do time de coração do usuário. | Alta |
| RF26 | O sistema deverá responder com mensagem clara quando não houver jogos cadastrados para a data. | Alta |

### 2.6 Administração de dados de futebol

| ID | Requisito | Prioridade |
|---|---|---|
| RF27 | O sistema deverá permitir que o administrador cadastre times (nome e sigla). | Alta |
| RF28 | O sistema deverá permitir que o administrador cadastre jogos do dia (mandante, visitante, data, horário e, se houver, placar). | Alta |
| RF29 | O sistema deverá listar os times disponíveis para escolha no cadastro do torcedor. | Alta |

---

## 3. Requisitos não funcionais

| ID | Requisito | Categoria |
|---|---|---|
| RNF01 | O sistema deverá possuir autenticação de usuários. | Segurança |
| RNF02 | O sistema deverá funcionar em navegador web (Chrome, Edge ou Firefox). | Compatibilidade |
| RNF03 | O sistema deverá realizar validação dos campos obrigatórios no cadastro, no login e na publicação. | Usabilidade |
| RNF04 | As senhas deverão ser armazenadas de forma criptografada (hash), nunca em texto puro. | Segurança |
| RNF05 | As telas principais deverão estar em português. | Usabilidade |
| RNF06 | O sistema deverá ser utilizável em resolução de desktop (mínimo 1280×720). | Interface |
| RNF07 | As operações principais (login, publicar, listar feed, ranking) deverão responder em até 3 segundos em ambiente local. | Desempenho |
| RNF08 | O MVP deverá funcionar na apresentação **sem API externa de jogos**. | Disponibilidade |
| RNF09 | O código deverá ser versionado no GitHub, com histórico de commits do grupo. | Manutenibilidade |
| RNF10 | O acesso às rotas autenticadas deverá exigir token/sessão válido. | Segurança |

---

## 4. Regras de negócio

| ID | Regra |
|---|---|
| RN01 | Cada usuário possui exatamente um time de coração nesta versão. |
| RN02 | A etiqueta do post é sempre o time de coração do autor; o usuário não escolhe outro time na hora de postar. |
| RN03 | O ranking conta usuários ativos cadastrados por time, não o número de posts. |
| RN04 | Jogos do dia são os registros cuja data é a data atual do sistema. |
| RN05 | Apenas o administrador cadastra times e jogos. |
| RN06 | Post sem texto não pode ser publicado. |
| RN07 | Comentário vazio não pode ser enviado. |

---

## 5. Rastreabilidade (resumo)

| Funcionalidade | Requisitos | Casos de uso |
|---|---|---|
| Cadastro / login | RF01–RF07 | UC01, UC02, UC03 |
| Post e feed | RF08–RF13 | UC04, UC05 |
| Like e comentário | RF14–RF18 | UC06, UC07 |
| Ranking | RF19–RF21 | UC08 |
| Resumo e chatbot | RF22–RF26 | UC09, UC10 |
| Administração | RF27–RF29 | UC11, UC12 |
