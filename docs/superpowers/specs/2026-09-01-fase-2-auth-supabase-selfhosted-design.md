# Fase 2 — Auth via Supabase Auth (GoTrue) self-hosted — Design

Data: 2026-09-01
Status: aprovado pelo usuário via brainstorm, pronto para plano de implementação.

## Objetivo

Substituir a implementação custom de autenticação por **GoTrue** (o serviço de auth do
Supabase, também disponível standalone self-hosted) rodando num container próprio na mesma VM
Oracle, apontando pro Postgres que a api já usa.

Este design **substitui por completo** os sub-itens 1 e 3 da Fase 2 do `plano.md`:

- Sub-item 1 — recuperação de senha + 2FA TOTP + verificação de email
  (`2026-08-31-fase-2-auth-senha-2fa-email-design.md`, **superseded por este documento**).
- Sub-item 3 — Google Sign-In (`2026-08-31-fase-2-google-signin-design.md`, **superseded por
  este documento**) — decisão do brainstorm de dobrar os dois juntos, já que GoTrue faz OAuth
  Google nativo, sem precisar de lib própria por repositório.

O sub-item 2 (tiers de precificação) **não é afetado** — spec e implementação próprias, sem
relação com auth.

**Motivação da troca**: código de auth custom (refresh token rotation, TOTP na mão, Google
Sign-In client-side em 3 repos) é superfície grande de bug de segurança pra escrever do zero.
GoTrue é testado em produção por um ecossistema grande, cobre os 3 requisitos (senha+2FA+email,
Google) com configuração, não código novo — ver comparação completa na conversa de brainstorm
(TOTP self-hosted habilitado por padrão, Google OAuth via env var, SMTP custom via env var).

## Contexto confirmado no código antes do brainstorm

- `model User` (`prisma/schema.prisma:30-47`, tabela `TB_USERS`) — `passwordHash` é hoje
  `NOT NULL` (linha 35), `role` é `String` livre (`OWNER`/`MANAGER`/`EMPLOYEE`/`CUSTOMER` via
  `normalizeUserRole`/`toLegacyUserRole`), `establishmentId` é FK obrigatória.
- `modules/auth/auth.controller.ts:60-74` — `tokenForUser()` emite 1 único JWT (`expiresIn:
  '30d'`) com `role`/`estabelecimentoId`/`establishmentId` como claims.
- `register()` (linha 76+) e `login()` (linha ~194+) são os 2 únicos fluxos de emissão de token
  hoje — nenhum refresh token, nenhuma revogação.
- `middlewares/elysiaAuth.ts:27-69` (`authenticateBearer`) — **correção feita durante o
  planejamento**: apesar do JWT carregar `role`/`establishmentId`, o middleware **já consulta o
  banco em toda request** (`prisma.user.findUnique`, linha 49) pra pegar `establishment.status`
  fresco — o gate de pagamento (`activeGuard`, linha 111-128) não pode esperar o token expirar
  pra refletir suspensão/exclusão de conta. Não dá pra economizar essa query trocando de emissor
  de JWT; ver Decisão nº6 revisada.
- `modules/users/users.controller.ts` `criarUsuario()` — endpoint que o DONO usa pra criar
  funcionário (senha escolhida pelo dono no corpo da requisição).
- Front (`front-tozzo.uk/src/services/api.ts:5,17,19,41`) — `baseURL` via `VITE_API_URL`, token
  em `localStorage.getItem('tozzo_token')`, interceptor de 401 limpa o token e redireciona.
- Mobile (`TozzoBurger/context/AuthContext.tsx`) — token via `expo-secure-store`
  (`TOKEN_KEY = 'tozzo_token_v1'`), reidrata na abertura do app, só limpa token em erro
  401/402/403 explícito (network error mantém token salvo, funciona offline).
- Nenhuma integração Google existe hoje em nenhum dos 3 repos.
- Infra: Postgres self-hosted na VM Oracle (mesma que roda api+front+nginx), Cloudflare Full
  (strict) na frente, nginx já tem padrão de location dedicada com proxy (`/events` do SSE,
  Fase 3) — mesmo padrão reaproveitado pro GoTrue.
- Brevo já configurado (`BREVO_API_KEY`, domínio `tozzo.uk` autenticado DKIM/DMARC) — GoTrue usa
  via SMTP, não API — precisa gerar credencial SMTP separada no painel Brevo (API key da Brevo
  não serve pra SMTP direto).

## Decisões do brainstorm

1. **Só GoTrue**, não a stack completa do Supabase (Kong/PostgREST/Realtime/Storage/Studio) — os
   outros 4 componentes duplicariam Prisma+API, SSE (Fase 3) e R2 (Fase 3.7) que já existem.
   1 container novo na VM, não 6+.
2. **Docker**, não Podman — VM já é 100% Docker hoje (`dockerd` já rodando pros containers
   existentes, então rodar só o GoTrue em Podman não economiza nada, paga os dois overheads ao
   mesmo tempo). Migração de runtime é decisão separada, à parte deste pivot — seria a Fase 19
   do `plano.md` ("Podman — trocar Docker no servidor"), aplicada a tudo de uma vez quando
   chegar a vez dela na ordem, não só a este container.
3. **Sub-item 1 + sub-item 3 dobrados num pivot só** — GoTrue resolve os dois ao mesmo tempo
   (senha/2FA/email + Google OAuth nativo).
4. **`User.id` = `auth.users.id`** — usuário novo nasce com o mesmo uuid nas duas tabelas (join
   direto por id, sem coluna de FK extra, RBAC/estabelecimento continuam exatamente como hoje).
5. **Usuários existentes: forçar reset de senha no corte**, não importar hash bcrypt direto —
   zero risco de incompatibilidade de formato silenciosa; troca é 1 email "redefina sua senha"
   por conta ativa.
6. **Sem Custom Access Token Hook — revisado durante o planejamento**. Decisão original (hook
   embutindo claims no JWT) partia de uma premissa errada: que o middleware hoje só lê claim do
   JWT sem tocar o banco. Não é o caso — `authenticateBearer` já faz `prisma.user.findUnique` em
   toda request pra checar `establishment.status` (gate de pagamento precisa ser fresco, não pode
   esperar refresh de token). Como essa query já é obrigatória, buscar `role`/`establishmentId`
   na mesma query não custa nada a mais — o hook só adicionaria 1 função Postgres pra manter sem
   ganho real. Middleware novo: extrai `sub` (id do usuário) do JWT do GoTrue, busca `User` no
   Postgres por esse id — mesmo padrão de hoje, só troca a fonte da assinatura do token.

## Arquitetura

```
                    ┌─────────────────────────────┐
                    │        Oracle VM              │
                    │                               │
  Cliente ──HTTPS──▶│ nginx (Cloudflare Full strict)│
 (front/mobile)     │  ├─ /gotrue/* ──▶ gotrue:9999 │
                    │  ├─ /auth/*  ──▶ api (existente)│
                    │  ├─ /events  ──▶ api (SSE)    │
                    │  └─ /        ──▶ api / front  │
                    │                               │
                    │  gotrue (container novo) ─────┼──▶ Postgres (schema `auth`)
                    │  api (existente) ──────────────┼──▶ Postgres (schema `public`, Prisma)
                    └─────────────────────────────┘
```

- **`gotrue`**: serviço novo em `docker-compose.yml` (imagem `ghcr.io/supabase/gotrue`),
  variáveis principais: `GOTRUE_DB_DRIVER=postgres`, `GOTRUE_DB_DATABASE_URL` (mesmo Postgres),
  `GOTRUE_JWT_SECRET` = mesmo valor de `JWT_SECRET` que a api já usa (api valida token do GoTrue
  sem trocar de lib, `jsonwebtoken` continua), `GOTRUE_SITE_URL`, `GOTRUE_SMTP_*` (Brevo SMTP),
  `GOTRUE_EXTERNAL_GOOGLE_*` (OAuth). Sem `GOTRUE_HOOK_*` (hook descartado, ver Decisão nº6).
- **nginx**: novo bloco `location /gotrue/` (em `api.tozzo.uk` e `dev-api.tozzo.uk`, `proxy_pass
  http://gotrue:9999/;` com barra final pra remover o prefixo antes de chegar no GoTrue) —
  reaproveita domínio/cert existente, sem subdomínio novo. **Não** usa `/auth/*`: esse prefixo já
  é da API hoje (`/auth/sse-token`, `/auth/delete-account`, `/auth/export-data` continuam nela,
  ver seção API) — usar o mesmo prefixo pro GoTrue quebraria essas 3 rotas.
- **Postgres**: GoTrue cria e gerencia seu próprio schema `auth` no boot (não mexe no schema
  `public` do Prisma) — **nenhuma migration manual em SQL é necessária** (sem hook, sem trigger).
  `establishmentId` continua `NOT NULL` em `TB_USERS` (`prisma/schema.prisma:39`) sem mudança —
  a API cria a linha `TB_USERS` explicitamente nos 2 fluxos que hoje criam usuário (ver
  `/auth/complete-signup` e `criarUsuario()` na seção API), sempre com `establishmentId` já
  resolvido na hora do insert.

## Escopo técnico

### Banco de dados (compartilhado, migration Prisma)

**Prisma (`prisma/schema.prisma`)**:

```prisma
model User {
  // ...campos existentes sem mudança de nome/tipo...
  passwordHash String? // era NOT NULL — fica só de rastro histórico, não usado pra login
                        // depois do corte; dropar de vez numa migration futura após confirmar
                        // 100% dos logins via GoTrue.
}
```

Nenhum campo novo de 2FA/token entra no Prisma — tudo isso passa a viver dentro do schema `auth`
do GoTrue (`auth.mfa_factors`, `auth.refresh_tokens`, etc.), fora do controle do Prisma.

### API (`api/api-tozzo.uk`)

**Removido** (GoTrue assume por completo):

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.
- Qualquer endpoint de `forgot-password`/`reset-password`/`verify-email`/`2fa/*`/`google` que
  estivesse nos planos antigos (nunca chegaram a ser implementados de fato — worktrees dos
  sub-itens 1/3 foram descartadas antes de gerar código real).
- `tokenForUser()` e toda a lógica de assinatura de JWT em `auth.controller.ts` — API só passa a
  **validar** token (emitido pelo GoTrue), nunca mais emitir.
- `lib/email.ts`/integração Brevo API — GoTrue manda email direto via SMTP, API não manda mais
  email de auth (impressão/venda etc., se algum dia precisar de email, é outra decisão, fora de
  escopo aqui).

**Mantido/adaptado**:

- `middlewares/elysiaAuth.ts` (`authenticateBearer`) — troca de "verificar JWT assinado pela
  própria api" pra "verificar JWT assinado pelo GoTrue" — mesma lib (`jsonwebtoken`), mesmo
  `JWT_SECRET` (compartilhado via env var com o GoTrue). Único ajuste real: GoTrue usa `sub`
  (padrão JWT) pro id do usuário, não `id` como o token atual — troca `decoded.id` por
  `decoded.sub` na busca do `prisma.user.findUnique`. O resto do middleware (query completa,
  `establishment.status`, `activeGuard`) fica exatamente igual.
- `criarUsuario()` (`modules/users/users.controller.ts`) — DONO cria funcionário → API já sabe o
  `establishmentId` (é o do DONO autenticado fazendo a chamada). Chama a **Admin API do GoTrue**
  (`POST /admin/users`, autenticada com `service_role` key) passando email + senha temporária
  definida pelo dono; GoTrue cria `auth.users` e devolve o `id` gerado; API cria `TB_USERS`
  **na mesma requisição**, síncrono, com esse `id` + `establishmentId` já conhecido — mesmo
  padrão de hoje, só troca quem gera o hash de senha.
- **Novo**: `POST /auth/complete-signup` (chamado pelo front/mobile logo após o primeiro
  `signUp()`/OAuth Google bem-sucedido via GoTrue, autenticado com o token que o GoTrue acabou de
  emitir) — idempotente: se já existe `TB_USERS` pra esse `id`, só devolve os dados (usuário
  Google linkando conta já existente, ou retry). Se não existe, recebe `tradeName`/nome do
  estabelecimento do corpo da requisição, cria `Establishment` (`plan: FREE`) + `TB_USERS`
  (`role: OWNER`, `establishmentId` do `Establishment` recém-criado) na mesma transação. Front e
  mobile chamam esse endpoint sempre logo depois de qualquer signup (senha ou Google) antes de
  navegar pro resto do app — enquanto ele não roda, `authenticateBearer` não acha `User` nenhum
  pra esse id (`404`/`401`, mesmo comportamento de hoje pra usuário inexistente), então rotas
  autenticadas normais devem tratar essa ausência como "redirecionar pra completar cadastro", não
  como erro genérico.

### Front (`front-tozzo.uk`)

- Nova dependência: `@supabase/auth-js` (cliente só-de-auth, sem precisar de Kong/PostgREST —
  aponta direto pra `VITE_AUTH_URL=https://api.tozzo.uk/gotrue`, dev usa
  `https://dev-api.tozzo.uk/gotrue`).
- `src/services/api.ts` — interceptor troca `localStorage.getItem('tozzo_token')` por
  `authClient.getSession()` (auth-js já gerencia storage/refresh automático).
- `AuthContext` reescrito em cima de `authClient.onAuthStateChange` em vez de estado próprio de
  token.
- `LoginPage`/`RegisterPage` — chamam `authClient.signInWithPassword`/`signUp` em vez de
  `axios.post('/auth/login')`. Cadastro dispara `signUp()` (GoTrue) seguido de
  `POST /auth/complete-signup` (API, ver acima) pra criar o `Establishment`.
- Botão "Entrar com Google" — `authClient.signInWithOAuth({ provider: 'google' })`, GoTrue cuida
  do redirect/callback OAuth inteiro, sem `@react-oauth/google` nem client-side token handling.
- `SettingsPage` ganha seção "Segurança": `authClient.mfa.enroll()`/`challenge()`/`verify()` pro
  setup de TOTP (QR code vem pronto da resposta do GoTrue), botão desativar via
  `authClient.mfa.unenroll()`. Só visível pra DONO/GERENTE (gate de UI, mesma regra de hoje).
- Telas de esqueci-senha/reset via `authClient.resetPasswordForEmail()` +
  `authClient.updateUser({ password })` na página que o link do email abre.

### Mobile (`TozzoBurger`)

- Nova dependência: `@supabase/auth-js` (mesma lib do front, cliente RN-compatível — usa
  `expo-secure-store` como storage adapter customizado, não o `AsyncStorage` default, pra manter
  o padrão de segurança já usado hoje). Aponta pra `EXPO_PUBLIC_AUTH_URL` (novo, mesmo padrão de
  `EXPO_PUBLIC_API_URL` já existente em `.env`/`.env.example`) = `<EXPO_PUBLIC_API_URL>/gotrue`.
- `context/AuthContext.tsx` reescrito em cima do mesmo client, `onAuthStateChange` substitui a
  rehidratação manual (linha ~53-97 hoje).
- `login.tsx` — `authClient.signInWithPassword`, tratamento de erro `mfa_challenge` (prompt de
  código TOTP) via UI já existente (`Alert`/tela dedicada, mesmo padrão de hoje).
- Botão "Entrar com Google" — `authClient.signInWithOAuth({ provider: 'google', ... })` com
  redirect via deep link do app (`expo-web-browser` + scheme customizado) — GoTrue devolve a
  sessão pro app depois do OAuth no browser do sistema. **Sem** `@react-native-google-signin`
  (lib nativa do plano antigo, descartada — o fluxo web genérico do GoTrue cobre os 2 apps com o
  mesmo código, menos superfície pra manter).
- 2FA: sem tela de setup no mobile nesta leva (mesma decisão do design antigo — DONO/GERENTE
  configuram pelo dashboard web), só o desafio de código no login quando aplicável.
- Esqueci senha: link do email abre o fluxo web (`tozzo.uk/reset-password`), mobile só dispara o
  pedido (`authClient.resetPasswordForEmail()`).

## Migração de usuários existentes

Script 1x (`scripts/migrate-users-to-gotrue.ts` ou SQL direto), rodado manualmente no corte:

1. Pra cada `TB_USERS` existente: `INSERT INTO auth.users (id, email, email_confirmed_at, ...)`
   usando o mesmo `id` do `TB_USERS`, **sem senha utilizável** (`encrypted_password` vazio/hash
   inválido proposital), `email_confirmed_at = now()` (contas já ativas, não re-verificar email
   retroativamente).
2. Dispara `authClient.resetPasswordForEmail()` em lote pra todo email migrado — usuário recebe
   "defina sua nova senha" via Brevo.
3. Login por senha antiga (`passwordHash` bcrypt do Prisma) para de funcionar no momento do
   corte — comunicar isso como downtime programado de auth (janela curta, fora do horário de
   pico do restaurante).

## Deploy/infra

- `docker-compose.yml` (ou equivalente no servidor) ganha serviço `gotrue`.
- `deploy.yml` (CI) da api precisa saber restartar/atualizar esse container também, ou ele fica
  fora do pipeline de deploy atual (a confirmar durante o plano — provavelmente entra como job
  separado, já que não é "a api" em si).
- Novos secrets/env (dev+prod, valores diferentes): `GOTRUE_JWT_SECRET` (= `JWT_SECRET`
  existente, reaproveitado), `GOTRUE_SMTP_*` (credencial SMTP nova da Brevo, diferente da API
  key), `GOOGLE_WEB_CLIENT_ID`/`GOOGLE_ANDROID_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google Cloud
  Console, projeto novo ou reaproveitado — a criar).

## Testes

- **API**: `POST /auth/complete-signup` (cria `Establishment`, idempotência se chamado 2x),
  `criarUsuario()` chamando Admin API do GoTrue (mock), middleware validando JWT assinado pelo
  GoTrue via `sub` (fixture de token GoTrue-shaped, usuário achado/não achado no Postgres).
- **Front/Mobile**: `AuthContext`/`LoginPage`/`login.tsx` com `@supabase/auth-js` mockado
  (login sucesso, `mfa_challenge`, erro de credencial, fluxo Google mockado).
- Sem cobertura de GoTrue em si (é serviço de terceiro, testado upstream) — só a integração
  (middleware, complete-signup, clients).

## Fora de escopo

- Stack completa do Supabase (Kong/PostgREST/Realtime/Storage/Studio) — só GoTrue.
- Migração de runtime Docker→Podman — fica pra Fase 19 do `plano.md`, aplicada a tudo de uma vez.
- Login social além de Google (Apple/Facebook).
- Import direto de hash bcrypt na migração — forçado reset (ver seção Decisões, item 5).
- Cookie httpOnly pro token (auth-js gerencia storage próprio, mesmo princípio do design antigo
  de não mexer em CORS/credentials da api nesta leva).
- Rate limiting geral de login — GoTrue já tem rate limit próprio configurável
  (`GOTRUE_RATE_LIMIT_*`), suficiente pra esta leva sem trabalho adicional na api.
