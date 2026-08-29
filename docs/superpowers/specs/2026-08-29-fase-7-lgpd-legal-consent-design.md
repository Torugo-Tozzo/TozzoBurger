# Fase 7 — Sub-parte LGPD/cybersegurança — Bloco 1: Legal/consentimento — Design

Data: 2026-08-29
Status: aprovado pelo usuário via brainstorm, pronto para plano de implementação.

## Objetivo

Publicar política de privacidade e termos de uso, e coletar consentimento
explícito no único fluxo de auto-cadastro do sistema, reduzindo exposição
legal (LGPD) e satisfazendo o requisito de "política de privacidade
publicada" da Play Store (ver `distribuicao-mobile.md`).

Este é o primeiro dos 3 blocos independentes da sub-parte LGPD/cybersegurança
da Fase 7 (ver `plano.md`, "Sub-parte — Cybersegurança básica (LGPD/compliance)").
Os outros dois — direitos LGPD (exclusão/exportação de dado pessoal) e
varredura de segurança básica — têm spec própria, feita depois.

## Contexto confirmado no código antes do brainstorm

- `POST /auth/register` é o único endpoint de auto-cadastro público do
  sistema e sempre cria o usuário com `role: OWNER` junto de um novo
  `Establishment` (`api/api-tozzo.uk/modules/auth/auth.controller.ts:148`).
- Contas de `MANAGER`/`EMPLOYEE` são criadas por um usuário já autenticado
  (dono/gerente) via `modules/users/`, nunca por auto-cadastro — não passam
  por nenhuma tela pública de "criar conta".
- Só o front (`front-tozzo.uk`) tem tela de cadastro
  (`src/pages/LoginPage.tsx`, toggle login/registro). O mobile
  (`TozzoBurger`) não tem tela de cadastro — login apenas.
- Sistema não usa cookies de tracking/analytics de terceiro hoje (sessão via
  JWT em `localStorage`/`expo-secure-store`) — banner de cookie fica fora de
  escopo.

## Decisões do brainstorm

1. **Onde publicar**: páginas estáticas públicas no front
   (`/privacidade`, `/termos`), sem duplicar conteúdo no app mobile (mobile
   não tem cadastro, não precisa da página).
2. **Consentimento**: aceite explícito obrigatório no cadastro (checkbox),
   não só publicação passiva — evidência real de consentimento exigida na
   prática pela LGPD para tratamento de dado pessoal.
3. **Usuários existentes**: **não** precisam re-aceitar retroativamente.
   Fica valendo só para cadastro novo daqui pra frente. Poucos usuários
   reais hoje (fase pré-Play-Store), risco legal de não re-pedir é baixo.
4. **Autoria do texto**: rascunho gerado nesta fase, adaptado ao negócio
   real (dados coletados, finalidade, direitos do titular), marcado
   explicitamente como pendente de revisão jurídica antes de valer como
   termo de produção real — não é aconselhamento jurídico.
5. **Modelo de dados**: campo simples `termsAcceptedAt DateTime?` no
   `User` existente, sem tabela de versionamento à parte (YAGNI — sem
   necessidade concreta hoje de rastrear múltiplas versões aceitas).
6. **Cookies/analytics**: fora de escopo, sistema não usa hoje.

## Escopo técnico

### API (`api/api-tozzo.uk`)

- Migration Prisma aditiva: `User.termsAcceptedAt DateTime?` (nullable, sem
  backfill, sem operação destrutiva).
- `POST /auth/register`: payload passa a exigir `termsAccepted: true`
  (boolean). Se ausente ou `false`, responde 400 com erro claro
  (ex: `TERMS_NOT_ACCEPTED`). O timestamp gravado em `termsAcceptedAt` é
  gerado no servidor (`new Date()` no momento do registro), nunca confiando
  em timestamp enviado pelo cliente.
- Nenhuma outra rota muda. `users.controller.ts` (criação de
  funcionário/gerente por admin autenticado) não ganha esse campo — fora do
  escopo definido (essas contas não passam por consentimento público).

### Front (`front-tozzo.uk`)

- 2 rotas públicas novas, sem autenticação: `/privacidade` e `/termos`,
  cada uma renderizando o texto estático (componente próprio ou markdown
  renderizado — decisão de implementação, sem preferência forte do design).
- `LoginPage.tsx` (modo registro): checkbox obrigatório "Li e aceito a
  [Política de Privacidade](/privacidade) e os
  [Termos de Uso](/termos)" (links abrem em nova aba). Botão de submit do
  cadastro fica desabilitado até o checkbox ser marcado. Envia
  `termsAccepted: true` no payload de `POST /auth/register`.
- Sem mudança em nenhuma outra tela do dashboard.

### Mobile (`TozzoBurger`)

- Nenhuma mudança. Não tem tela de cadastro, não há fluxo de consentimento
  a implementar aqui.

## Conteúdo das páginas (rascunho a produzir na implementação)

O texto deve cobrir, no mínimo, adaptado à realidade do TozzoBurger (PDV de
hamburgueria, dados de estabelecimento/pedido/venda/usuário, pagamento via
Stripe):

- Quem é o controlador de dados (o estabelecimento/dono, operando via
  plataforma TozzoBurger).
- Quais dados são coletados: nome, e-mail, telefone (se aplicável),
  credenciais de acesso, dados de pedido/venda/histórico, dados de
  estabelecimento.
- Finalidade do tratamento: operação do PDV, histórico de vendas,
  autenticação, comunicação transacional.
- Compartilhamento com terceiros: Stripe (processamento de pagamento),
  Cloudflare (infraestrutura/CDN) — sem venda de dado a terceiro.
- Direitos do titular (LGPD art. 18): confirmação de tratamento, acesso,
  correção, anonimização/eliminação, portabilidade, revogação de
  consentimento — com um canal de contato para exercer esses direitos
  (e-mail, a definir na implementação).
- Retenção: dados mantidos enquanto a conta/estabelecimento estiver ativo,
  soft-delete já usado no sistema (`deletedAt`) como mecanismo técnico
  existente.
- Aviso de que o texto é um modelo/rascunho e recomenda-se revisão por
  profissional jurídico antes de uso como termo de produção vinculante.

## Testes

- API: teste de `POST /auth/register` rejeitando payload sem
  `termsAccepted`/com `termsAccepted: false` (400), e aceitando com
  `termsAccepted: true` (grava `termsAcceptedAt` real, não confia em valor
  do cliente). Migration testada em Postgres efêmero antes de aplicar,
  mesmo padrão já usado no projeto.
- Front: teste do fluxo de registro cobrindo checkbox desmarcado bloqueando
  submit, checkbox marcado permitindo submit e enviando `termsAccepted: true`;
  smoke test das 2 rotas públicas novas renderizando sem crash.

## Fora de escopo

- Revisão jurídica real do texto (fica marcado como pendência explícita no
  próprio conteúdo publicado).
- Re-aceite retroativo de usuários existentes.
- Banner de cookies/consentimento de analytics.
- Tabela de versionamento de termos aceitos.
- Qualquer mudança em contas criadas por admin (`MANAGER`/`EMPLOYEE`).
- Blocos 2 (direitos LGPD: exclusão/exportação) e 3 (segurança básica) da
  mesma sub-parte — specs próprias, feitas em sequência depois deste.
