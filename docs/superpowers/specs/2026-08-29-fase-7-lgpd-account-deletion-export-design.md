# Fase 7 — Sub-parte LGPD/cybersegurança — Bloco 2: direitos LGPD (exclusão/exportação) — Design

Data: 2026-08-29
Status: aprovado pelo usuário via brainstorm, pronto para plano de implementação.

## Objetivo

Dar ao dono (`OWNER`) de um estabelecimento um jeito self-service de exercer
os direitos de exclusão e portabilidade de dado pessoal previstos na LGPD
(art. 18), cobrindo também a exigência da Play Store de que apps com
criação de conta ofereçam exclusão de conta in-app.

Este é o segundo dos 3 blocos independentes da sub-parte LGPD/cybersegurança
da Fase 7 (ver `plano.md`). O Bloco 1 (legal/consentimento) já foi
implementado e aprovado, aguardando merge junto com este bloco. O Bloco 3
(segurança básica) tem spec própria, feita depois.

## Contexto confirmado no código antes do brainstorm

- Único fluxo de auto-cadastro é `POST /auth/register`, sempre cria
  `role: OWNER` + um `Establishment` novo
  (`api/api-tozzo.uk/modules/auth/auth.controller.ts:148`).
- Hoje só existe `DELETE /users/:id` — hard delete de verdade
  (`prisma.user.delete`), usado por um admin pra remover OUTRO usuário;
  self-delete é bloqueado de propósito
  (`modules/users/users.controller.ts:189-206`).
- **`User` não tem soft-delete hoje** — sem campo `deletedAt`, ao contrário
  do resto do sistema (`Product`/`Order`/`Sale` já usam `deletedAt`).
- **`Establishment` também não tem `deletedAt`** — só tem `status`
  (`EstablishmentStatus`: `ACTIVE` / `PENDING_PAYMENT` / `SUSPENDED`,
  `prisma/schema.prisma:12,49-53`).
- `Establishment` tem `stripeCustomerId`/`subscriptionExpiresAt`
  (`prisma/schema.prisma:15-16`) — pode ter assinatura Stripe ativa.
- `activeGuard` (`middlewares/elysiaAuth.ts:111-120`) já bloqueia rotas de
  negócio quando `establishment.status !== ACTIVE`, respondendo 402
  `"Pagamento necessário..."` — hoje usado pra `PENDING_PAYMENT`/`SUSPENDED`,
  precisa diferenciar um estabelecimento excluído (mensagem errada senão).
- `authenticateBearer` (`middlewares/elysiaAuth.ts:49-59`) já re-busca o
  `User` no banco a cada request (não confia só no JWT) — uma vez que a
  senha do usuário for anonimizada, ele não consegue mais logar de novo,
  mas um token já emitido (JWT válido por até 30 dias) continua achando a
  linha do `User` (ela não é apagada, só anonimizada) até o `activeGuard`
  barrar pelo status do estabelecimento.

## Decisões do brainstorm

1. **Escopo da exclusão**: pedido do `OWNER` exclui o `Establishment`
   inteiro (todos os funcionários vinculados também têm o dado pessoal
   anonimizado) — coerente com o dado já ser todo escopado por
   estabelecimento hoje.
2. **Quem pode pedir**: só `OWNER`, mesmo padrão do Bloco 1 (só quem
   se auto-cadastra tem fluxo self-service). Pedido de
   `GERENTE`/`FUNCIONARIO` sobre o próprio dado fica como pedido manual
   fora deste bloco, tratado pela tela de gestão de funcionários que já
   existe (o `OWNER` edita/remove).
3. **Mecanismo**: soft-delete + anonimização, não hard delete. Novo valor
   `DELETED` no enum `EstablishmentStatus` (não campo `deletedAt` novo) —
   reaproveita o mecanismo de gate que `SUSPENDED` já sinaliza, com
   semântica própria (não confunde com suspensão por falta de pagamento).
   Todo `User` do estabelecimento tem `name`/`email`/`phone`/`passwordHash`
   sobrescritos com valor anônimo — a linha permanece (não quebra FK de
   `Sale.usuarioVendedorId`/`Order.usuarioId` nem histórico), mas o dado
   pessoal de verdade some.
4. **Cancelamento de assinatura Stripe**: sim, o endpoint de exclusão
   cancela a assinatura ativa no Stripe (se `stripeCustomerId` existir)
   como parte do mesmo fluxo — evita cobrar um estabelecimento que não
   existe mais.
5. **Fluxo**: self-service dentro do dashboard (não pedido manual por
   e-mail) — botão em Configurações, atende a exigência de exclusão in-app
   da Play Store diretamente.
6. **Confirmação**: modal (reaproveita `ConfirmContext`/`useConfirm` já
   existente, Fase 4) + campo de senha atual — confirma que é o dono de
   verdade antes de uma ação irreversível.
7. **Exportação**: mesmo padrão self-service, botão separado em
   Configurações, baixa um JSON (estabelecimento + usuários + produtos +
   pedidos + vendas do tenant) — LGPD não exige formato específico, JSON é
   simples e máquina-legível.

## Escopo técnico

### API (`api/api-tozzo.uk`)

- Migration Prisma aditiva: novo valor `DELETED` no enum
  `EstablishmentStatus` (`ALTER TYPE`, sem remover valor existente, sem
  operação destrutiva).
- `POST /auth/delete-account` (autenticado, só `role: OWNER`): payload
  `{ password: string }`. Fluxo, numa única transação Prisma:
  1. Valida a senha atual do usuário autenticado (`bcrypt.compare` contra
     `passwordHash`) — 401/403 se não bater.
  2. Se `establishment.stripeCustomerId` existir, cancela a assinatura
     ativa via API do Stripe antes de commitar a transação (se a chamada
     Stripe falhar, aborta o fluxo inteiro sem marcar nada como excluído —
     não deixar o banco excluído com cobrança ainda ativa no Stripe).
  3. `Establishment.status = DELETED`.
  4. Para cada `User` com `establishmentId` igual ao do estabelecimento:
     sobrescreve `name` (ex: `"Usuário removido"`), `email` (valor único
     anônimo, ex: `deleted-<uuid>@tozzo.uk`, pra não violar
     `@unique(email)`), `phone` (`null`), `passwordHash` (hash de um valor
     aleatório, não reutilizável).
  5. Retorna 200 confirmando a exclusão (sem token novo — front desloga o
     usuário no mesmo fluxo).
- `activeGuard`: passa a checar `status === DELETED` separado dos outros
  valores não-`ACTIVE`, respondendo com código/mensagem própria (ex:
  `410 Gone`, `{ code: 'ESTABLISHMENT_DELETED' }`) em vez do 402 de
  pagamento pendente.
- `GET /auth/export-data` (autenticado, só `role: OWNER`): monta e retorna
  um JSON com `establishment`, `users` (do tenant, sem `passwordHash`),
  `products`, `orders` (com itens), `sales` (com itens) — tudo filtrado por
  `establishmentId` do usuário autenticado, mesmo padrão de escopo por
  tenant já usado no resto da api.
- Nenhuma mudança em `DELETE /users/:id` (continua sendo o fluxo de admin
  removendo outro usuário, hard delete — fora do escopo deste bloco).

### Front (`front-tozzo.uk`)

- `SettingsPage.tsx`: nova seção (visível só quando `user.role === 'OWNER'`)
  com 2 botões:
  - **"Exportar meus dados"**: chama `GET /auth/export-data`, dispara
    download do JSON retornado (sem modal de confirmação — ação não
    destrutiva).
  - **"Excluir minha conta"**: abre modal via `ConfirmContext`/`useConfirm`
    com campo de senha; ao confirmar, chama `POST /auth/delete-account`
    com a senha digitada; em caso de sucesso, desloga (`logout()` do
    `AuthContext`) e redireciona pro `/login` com uma mensagem de
    confirmação (toast).

### Mobile (`TozzoBurger`)

- Nenhuma mudança de fluxo — funcionário não inicia exclusão. Se um token
  antigo de funcionário bater contra um estabelecimento já `DELETED`, cai
  no tratamento de erro genérico que a app já tem pra respostas de
  auth/status não-`ACTIVE` (mesmo caminho de erro que `SUSPENDED`/
  `PENDING_PAYMENT` hoje já provocam, sem tela nova dedicada).

## Testes

- API: teste de `POST /auth/delete-account` cobrindo — 401 sem token,
  403 se não for `OWNER`, 401/403 com senha errada, sucesso anonimizando
  todos os `User` do estabelecimento (não só o que pediu) preservando FKs
  de venda/pedido, `Establishment.status` virando `DELETED`, cancelamento
  de assinatura Stripe chamado quando `stripeCustomerId` existe (mock),
  transação abortada (nada muda no banco) se a chamada Stripe falhar. Teste
  de `activeGuard` distinguindo `DELETED` de `PENDING_PAYMENT`/`SUSPENDED`
  na resposta. Teste de `GET /auth/export-data` retornando só dado do
  tenant do usuário autenticado, sem `passwordHash` nos usuários, 403 se
  não for `OWNER`. Migration do enum testada em Postgres efêmero antes de
  aplicar, mesmo padrão já usado no projeto.
- Front: teste da seção nova em `SettingsPage` — botões só aparecem pra
  `OWNER`; exportar dispara o download; excluir abre o modal, bloqueia sem
  senha, chama o endpoint com a senha, e desloga+redireciona em caso de
  sucesso.

## Fora de escopo

- Exclusão/exportação self-service pra `GERENTE`/`FUNCIONARIO` (fica pedido
  manual, tratado pela tela de gestão de funcionários existente).
- Tabela de log/auditoria de quem excluiu o quê e quando (não pedido).
- Mudança em `DELETE /users/:id` (fluxo de admin removendo outro usuário
  continua como está, hard delete).
- Tela dedicada no mobile pra um estabelecimento `DELETED` (usa o
  tratamento de erro genérico já existente).
- Bloco 1 (legal/consentimento, já implementado) e Bloco 3 (segurança
  básica) da mesma sub-parte — specs próprias.
