# Fase 2 — Sub-item: Recuperação de senha + 2FA TOTP + verificação de email — Design

Data: 2026-08-31
Status: **SUPERSEDED em 2026-09-01** — substituído por
`2026-09-01-fase-2-auth-supabase-selfhosted-design.md` (pivot pra GoTrue self-hosted em vez de
implementação custom). Mantido só como histórico da decisão original.

## Objetivo

Fechar 3 lacunas reais de segurança de conta identificadas no projeto:

1. **Sem recuperação de senha** — hoje não existe `/auth/forgot-password`, usuário que esquece
   a senha fica travado sem jeito de recuperar a conta.
2. **Sem 2FA** — nenhuma camada extra de proteção pro login de quem acessa o dashboard web
   (DONO/GERENTE), onde dados sensíveis (vendas, funcionários, relatórios) ficam expostos.
3. **Sem verificação de email** — `POST /auth/register` cria a conta sem confirmar que o email
   é real/alcançável (só valida formato). Funcionário criado via `POST /usuarios` tem o mesmo
   problema.

Este é 1 dos 3 sub-itens que compõem a Fase 2 do `plano.md` (recuperação de senha + 2FA + email
**[esta spec]** | tiers de precificação, spec própria já implementada | Google Sign-In, spec
própria a fazer). Provedor de email já decidido em sessão anterior: **Brevo**
(free tier 300 emails/dia, sem cartão, sem cobrança automática ao bater limite).

**Atualização 2026-08-31 (mesmo dia, antes da execução)**: conta Brevo criada
(`suporte@tozzo.uk`) e domínio `tozzo.uk` já **autenticado** (DKIM via 2 CNAME,
`brevo-code` e DMARC via TXT, adicionados na Cloudflare e confirmados pela API do Brevo).
`BREVO_API_KEY`/`EMAIL_FROM` já estão no `.env` da api. Envio real de email já funciona —
não é mais um pré-requisito pendente pra Task 4 do plano da API.

## Contexto confirmado no código antes do brainstorm

- `modules/auth/auth.controller.ts` — `tokenForUser()` (linha 60-74) emite um único JWT com
  `expiresIn: '30d'`, sem refresh token, sem revogação. `login()` (linha 194-256) e `register()`
  (linha 76-192) são os 2 únicos fluxos de emissão de token hoje.
- `register()` já valida: nome/email obrigatórios, senha ≥6 chars, `termsAccepted === true`,
  email único, limite global de 100 estabelecimentos ativos / 200 pendentes — **nenhuma
  validação de email real**, só formato implícito (nenhuma checagem de formato nem).
- `modules/users/users.controller.ts` `criarUsuario()` (linha 48-93) — é o endpoint que o DONO
  usa pra criar funcionário (`EmployeesPage.tsx` do front manda `password` já escolhida pelo
  dono no corpo da requisição). Sem verificação de email hoje, igual ao register.
- `model User` (`prisma/schema.prisma:30-47`) — não tem nenhum campo de 2FA, verificação de
  email ou refresh token hoje. Único índice extra é `establishmentId`.
- Front (`front-tozzo.uk/src/services/api.ts`) guarda o token em `localStorage`
  (`tozzo_token`), interceptor de resposta já trata 401 (limpa token + `auth:logout` + redirect
  pra `/login`) e reconhece 402 como "pagamento pendente" sem deslogar.
- Mobile (`TozzoBurger/context/AuthContext.tsx`) guarda o token via `expo-secure-store`
  (`TOKEN_KEY = 'tozzo_token_v1'`), reidrata na abertura do app, só limpa o token guardado em
  erro 401/402/403 explícito (network error mantém o token salvo, pra funcionar offline).
- RBAC (`types/roles.ts`, `users.rules.ts`) já normaliza `role` em `OWNER | MANAGER | EMPLOYEE |
  CUSTOMER` — os campos/gates novos de 2FA reaproveitam esse mesmo enum, sem criar um novo.

## Decisões do brainstorm

1. **Sessão vira access token curto + refresh token rotativo** (não ficar em 30d fixo) — decisão
   consciente de que reset de senha/2FA "revogar sessão" não faz sentido de verdade com um JWT
   de 30d sem estado nenhum no servidor. Refresh token guardado no **mesmo storage** que o token
   de hoje (localStorage no front, `expo-secure-store` no mobile) — não migrar pra cookie
   httpOnly nesta leva (evita mexer em CORS/credentials da api, mantém os 2 clientes simétricos).
2. **Verificação de email é bloqueante e vale pra todo mundo**, inclusive funcionário criado
   pelo DONO via dashboard — não só o cadastro self-service (`/auth/register`). Decisão do
   usuário, contra a recomendação inicial (que sugeria isentar funcionário criado por alguém já
   autenticado) — login fica bloqueado (`403 EMAIL_NOT_VERIFIED`) até o clique no link, pro
   DONO que se auto-cadastra E pro funcionário que o DONO cria.
3. **2FA (TOTP) só pra DONO/GERENTE** — `FUNCIONARIO`/`CLIENTE` nunca veem a opção de ativar
   (mobile em dispositivo compartilhado da loja não combina com 2FA por app autenticador).
4. **Refresh token revogado em 2 eventos**: reset de senha bem-sucedido e toggle de 2FA
   (ativar ou desativar) — invalida todo dispositivo logado, força novo login em todos.

## Escopo técnico

### API (`api/api-tozzo.uk`)

**Schema (Prisma, migration aditiva)**:

```prisma
model User {
  // ...campos existentes sem mudança...
  emailVerifiedAt    DateTime?
  totpSecret         String?
  totpEnabled        Boolean            @default(false)
  totpBackupCodes    String[]           @default([])

  refreshTokens         RefreshToken[]
  passwordResetTokens    PasswordResetToken[]
  emailVerificationTokens EmailVerificationToken[]
}

model RefreshToken {
  id                   String    @id @default(uuid())
  userId               String
  user                 User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash            String    @unique
  expiresAt            DateTime
  revokedAt            DateTime?
  replacedByTokenHash  String?
  createdAt            DateTime  @default(now())

  @@index([userId])
  @@map("TB_REFRESH_TOKENS")
}

model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@map("TB_PASSWORD_RESET_TOKENS")
}

model EmailVerificationToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@map("TB_EMAIL_VERIFICATION_TOKENS")
}
```

- Todos os 3 tokens são guardados **hasheados** (`tokenHash`, sha256) — o valor cru só existe no
  link/resposta enviada ao cliente, nunca persistido em texto puro (mesmo padrão que senha
  já usa via bcrypt, adaptado pra token de uso único).
- Migration de dado: usuários existentes recebem `emailVerifiedAt = createdAt` (contas já
  ativas hoje não ficam bloqueadas retroativamente por uma regra que não existia quando se
  cadastraram).
- `totpBackupCodes` guarda hash de cada código (mesmo padrão de `tokenHash`), não o valor cru.

**Endpoints novos**:

- `POST /auth/refresh` — recebe refresh token, valida (não revogado, não expirado), rotaciona
  (revoga o antigo, emite access+refresh novos).
- `POST /auth/logout` — revoga o refresh token do dispositivo atual (não todos).
- `POST /auth/forgot-password` — gera `PasswordResetToken` (expira 1h), dispara email via Brevo.
  Sempre responde 200 mesmo se o email não existir (não vaza quais emails têm conta).
- `POST /auth/reset-password` — valida token, troca a senha, marca `usedAt`, **revoga todos os
  refresh tokens do usuário**.
- `POST /auth/verify-email` — valida `EmailVerificationToken`, marca `usedAt` no token e
  `emailVerifiedAt` no usuário.
- `POST /auth/resend-verification` — gera token novo (invalida qualquer token de verificação
  anterior não usado do mesmo usuário), rate-limited (ex: 1 a cada 60s por usuário).
- `POST /auth/2fa/setup` — só DONO/GERENTE — gera `totpSecret` (não persiste ainda), devolve
  secret + QR code (otpauth URI).
- `POST /auth/2fa/verify` — confirma o setup (persiste `totpSecret`, `totpEnabled = true`, gera
  10 `totpBackupCodes`, devolve os códigos em texto puro **uma única vez**) OU valida o código
  durante login (quando `totpEnabled` já é true).
- `POST /auth/2fa/disable` — exige senha atual + código TOTP válido, zera os 3 campos, **revoga
  todos os refresh tokens**.

**Mudanças em endpoints existentes**:

- `register()` — cria usuário com `emailVerifiedAt: null`, dispara email de verificação em vez
  de devolver token de sessão completo; resposta passa a ser
  `{ code: 'AUTH_EMAIL_VERIFICATION_REQUIRED', message, userId }` (sem token) até confirmar.
- `login()` — depois de validar senha: se `emailVerifiedAt === null` →
  `403 EMAIL_NOT_VERIFIED`; se `totpEnabled === true` → não emite token ainda, responde
  `{ code: 'TOTP_REQUIRED', challengeToken }` (`challengeToken` de curta duração, 5min,
  `purpose: 'totp_challenge'`, análogo ao token de SSE já existente) — cliente reenvia esse
  `challengeToken` + código TOTP pro `/auth/2fa/verify` pra completar o login.
- `criarUsuario()` (`modules/users/users.controller.ts`) — mesmo tratamento de `register()`:
  cria com `emailVerifiedAt: null`, dispara email de verificação pro funcionário.
- `tokenForUser()` vira 2 funções: `accessTokenFor(user)` (15min) e
  `issueRefreshToken(userId)` (gera+persiste `RefreshToken`, expira em 30 dias — mesmo teto de
  hoje, só que agora revogável).

**Brevo**:

- `lib/email.ts` novo — client Brevo (`@getbrevo/brevo` ou chamada HTTP direta à API
  transacional), 2 templates: "confirme seu email" e "redefinir senha". `BREVO_API_KEY` novo no
  `.env`.
- Envio é fire-and-forget com log de erro (não trava a resposta do endpoint esperando o email
  sair) — mesmo princípio de "erro não trava a operação principal" já usado em sync/impressão.

### Front (`front-tozzo.uk`)

- `src/services/api.ts` — troca o modelo de token: guarda `{ accessToken, refreshToken }`,
  interceptor de 401 tenta `POST /auth/refresh` uma vez antes de deslogar de vez.
- Telas novas: `ForgotPasswordPage`, `ResetPasswordPage` (link do email cai aqui, token na URL),
  `VerifyEmailPage` (link do email cai aqui), `TwoFactorChallengePage` (prompt de código depois
  do login quando a API responde `TOTP_REQUIRED`).
- `SettingsPage` ganha seção "Segurança": setup de 2FA (QR code + lista de backup codes, só
  visível pra DONO/GERENTE), botão desativar (pede senha + código).
- Páginas de erro reaproveitam o `error-keys.ts`/`localizedError` já existente — códigos novos
  (`EMAIL_NOT_VERIFIED`, `TOTP_REQUIRED`, `TOTP_INVALID`, etc.) entram no mapa de contexto de
  `login`.

### Mobile (`TozzoBurger`)

- `context/AuthContext.tsx` — mesmo modelo access+refresh, guardado via `expo-secure-store`
  (2 chaves: `tozzo_access_token_v1`, `tozzo_refresh_token_v1`). Retry de refresh no fluxo de
  rehidratação (linha 53-97) e em qualquer 401 de chamada autenticada.
- Telas novas: esqueci-senha (mesmo fluxo por link de email — como o mobile não tem deep link
  configurado pra isso ainda, o link do email abre o front web `tozzo.uk/reset-password`, não
  uma tela nativa; mobile só tem a tela "esqueci minha senha" que dispara o pedido).
- 2FA: como só DONO/GERENTE usam (spec decisão nº3), e o app mobile é majoritariamente
  garçom/caixa (FUNCIONARIO), o setup de 2FA **não** ganha tela própria no mobile nesta leva —
  só o prompt de código no login, caso um DONO/GERENTE decida logar no app com 2FA ativo (setup
  em si só acontece pelo dashboard web). Documentado como decisão consciente, não esquecimento.
- `login.tsx` trata `EMAIL_NOT_VERIFIED`/`TOTP_REQUIRED` com telas/alertas dedicados, mesmo
  padrão de erro já usado (`Alert.alert` com título/mensagem traduzidos).

## Testes

- API: `RefreshToken` (emissão, rotação, revogação em cascata no reset de senha e no toggle de
  2FA), verificação de email (bloqueia login, token expira, reenvio invalida o anterior), TOTP
  (setup, verify, disable, backup code consumido uma vez só), migration de dado (`emailVerifiedAt`
  retroativo pra usuário existente).
- Front: `ForgotPasswordPage`/`ResetPasswordPage`/`VerifyEmailPage`/`TwoFactorChallengePage`,
  interceptor de refresh (401 → refresh → retry).
- Mobile: fluxo de refresh na rehidratação, tratamento de `EMAIL_NOT_VERIFIED`/`TOTP_REQUIRED`
  no login.

## Fora de escopo

- **Google Sign-In** — sub-item próprio da Fase 2, spec separada.
- **2FA por SMS/email** (só TOTP por app autenticador nesta leva).
- **Setup de 2FA pelo mobile** — só o prompt de código no login (ver seção Mobile acima).
- **Cookie httpOnly pro refresh token** — decisão consciente de manter o mesmo storage atual
  (ver Decisão nº1), revisitar só se um problema de XSS real for encontrado.
- **Rate limiting geral de login** (proteção contra força bruta em `/auth/login`) — achado
  relacionado mas não implementado nesta leva; `forgot-password`/`resend-verification` ganham
  rate limit pontual (ver Escopo técnico), mas não é uma revisão geral de rate limiting da api.
