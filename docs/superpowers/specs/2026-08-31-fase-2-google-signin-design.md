# Fase 2 — Sub-item: Google Sign-In — Design

Data: 2026-08-31
Status: aprovado pelo usuário via brainstorm, pronto para plano de implementação.

## Objetivo

Deixar cadastro/login via conta Google, gratuito (sem custo do Google), como alternativa ao
fluxo por email/senha — achado/pedido do usuário em 2026-08-30, cortado explicitamente da spec
de tiers por ser assunto de autenticação, não precificação. É o 3º e último sub-item da Fase 2
do `plano.md` (recuperação de senha + 2FA + email, spec própria já feita | tiers de
precificação, spec própria já feita | **Google Sign-In [esta spec]**).

**Depende do sub-item de auth** (`2026-08-31-fase-2-auth-senha-2fa-email-design.md`) — reaproveita
por completo o modelo de sessão access+refresh, o desafio de 2FA TOTP (`challengeToken`) e o
conceito de `emailVerifiedAt` definidos lá. Não faz sentido implementar antes do sub-item de auth.

## Contexto confirmado no código antes do brainstorm

- Nenhuma integração Google existe hoje em nenhum dos 3 repos (`package.json` de api/front/mobile
  sem nenhuma dependência relacionada).
- `model User` — `passwordHash` é hoje `NOT NULL` (`prisma/schema.prisma:35`), precisa virar
  opcional pra suportar conta que nasce só via Google, sem senha nenhuma.
- Mobile já builda nativo (`npx expo run:android`), não usa Expo Go — sem restrição pra usar um
  módulo nativo (`@react-native-google-signin/google-signin`) em vez de um fluxo web genérico.

## Decisões do brainstorm

1. **Login via Google pula a checagem de `emailVerifiedAt`** (o Google já garante que o email é
   real) **mas ainda respeita 2FA TOTP** se a conta já tiver 2FA ativado — 2FA é da conta, não do
   método de entrada.
2. **Email novo (nunca visto) cria estabelecimento novo automaticamente**, mesmo fluxo de
   `/auth/register` — usuário Google vira `DONO` de estabelecimento novo, `FREE`, sem pagamento
   ainda.
3. **Email que já existe numa conta criada por senha linka automaticamente** na primeira vez que
   logar via Google — Google já provou a posse do email via OAuth, não precisa de passo extra de
   confirmação.
4. **`passwordHash` vira opcional** no schema — conta Google-only não tem senha até o usuário
   definir uma (via fluxo de reset de senha do sub-item de auth, que passa a servir de "definir
   senha pela 1ª vez" também, sem lógica especial extra).
5. **Disponível pra todo mundo, nos 2 apps** — DONO/GERENTE (web+mobile) e FUNCIONÁRIO (mobile).
   Funcionário continua sendo criado pelo dono primeiro (com email) — Google só entra como método
   de login alternativo depois, linkando pelo email já cadastrado.
6. **Lib mobile: `@react-native-google-signin/google-signin`** (nativo, seletor de conta Google
   direto) — recomendada e escolhida em vez de `expo-auth-session` (fluxo via browser), já que o
   projeto não usa Expo Go mesmo.

## Escopo técnico

### API (`api/api-tozzo.uk`)

**Schema (Prisma, migration aditiva)**:

```prisma
model User {
  // ...campos existentes...
  passwordHash String? // era NOT NULL, agora opcional
  googleId     String? @unique
}
```

- Migration é puramente de relaxamento de constraint (`NOT NULL` → nullable) + coluna nova — sem
  necessidade de backfill de dado (usuário existente já tem `passwordHash` preenchido).

**Novas variáveis de ambiente**: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` (só client ID
público — a verificação de ID token no servidor não precisa de client secret).

**`lib/googleAuth.ts`** — novo, usa `google-auth-library` (`OAuth2Client.verifyIdToken`) com
`audience: [GOOGLE_WEB_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID]` (aceita token de qualquer um dos 2
clients). Devolve `{ sub, email, emailVerified, name }` extraído do payload verificado, ou lança
se o token for inválido/expirado/audience errado.

**`POST /auth/google`** (público, corpo `{ idToken: string }`):
1. Verifica o token via `lib/googleAuth.ts`. Token inválido → `401 AUTH_GOOGLE_TOKEN_INVALID`.
2. Se `emailVerified !== true` no payload do Google → `403 AUTH_GOOGLE_EMAIL_NOT_VERIFIED`
   (caso raro, mas o campo existe no payload do Google e deve ser respeitado).
3. Busca `User` por `googleId`. Se achar → segue pro passo 5.
4. Não achou por `googleId` → busca por `email`.
   - Achou (conta existente criada por senha, nunca linkada) → faz `UPDATE` setando `googleId` e,
     se `emailVerifiedAt` ainda for `null`, marca como verificado agora (Google já provou).
   - Não achou → cria `Establishment` (`status: PENDING_PAYMENT`, `plan: FREE`) + `User`
     (`role: OWNER`, `passwordHash: null`, `googleId`, `emailVerifiedAt: now()`, `name` do
     payload do Google) na mesma transação — mesmo padrão do `register()` do sub-item de auth.
5. Se `user.totpEnabled` → mesmo desafio já existente: responde `{ code: 'TOTP_REQUIRED',
   challengeToken }` (reaproveita a função já criada no sub-item de auth, sem duplicar lógica).
6. Senão → `completeLogin(user, set)` (mesma função já criada no sub-item de auth — emite
   `accessToken`/`refreshToken` iguais ao login por senha).

**Login por senha numa conta sem `passwordHash`**: `login()` (já modificado pelo sub-item de
auth) ganha 1 checagem a mais, antes do `bcrypt.compare` — se `user.passwordHash` for `null`,
retorna `400 AUTH_NO_PASSWORD_SET` (mensagem clara: "esta conta usa login por Google; entre por
Google ou defina uma senha em 'esqueci minha senha'").

### Front (`front-tozzo.uk`)

- `@react-oauth/google` (Google Identity Services) — botão "Entrar com Google" na `LoginPage`,
  abaixo do form de login E do form de cadastro (mesmo botão cobre os 2 casos — o backend decide
  se cria conta nova ou loga numa existente). `GoogleOAuthProvider` com `clientId` novo
  (`VITE_GOOGLE_CLIENT_ID`) envolvendo a página (ou o app inteiro, em `App.tsx`).
- `onSuccess` do botão manda o `credential` (ID token) pro `POST /auth/google`, mesmo tratamento
  de resposta que login por senha já tem (branch `TOTP_REQUIRED`, sucesso normal).
- Erro `AUTH_NO_PASSWORD_SET` no login por senha mostra mensagem específica com link direto pro
  botão Google/esqueci-senha.

### Mobile (`TozzoBurger`)

- `@react-native-google-signin/google-signin` — configurado com `webClientId` (necessário mesmo
  no Android pra pedir o ID token, não só o `androidClientId`) em `app.json`/plugin config.
- Botão "Entrar com Google" em `login.tsx`, abaixo do form — `GoogleSignin.signIn()` devolve o ID
  token, mandado pro mesmo `POST /auth/google`. Mesma árvore de resultado (`ok`/`TOTP_REQUIRED`)
  já usada pelo login por senha do sub-item de auth (`completeSession` reaproveitado).

## Testes

- API: `lib/googleAuth.ts` (token válido, inválido, audience errada — mock do `OAuth2Client`),
  `/auth/google` (conta nova cria estabelecimento, conta existente por email linka `googleId`,
  conta já linkada só loga, `TOTP_REQUIRED` quando aplicável, `login()` por senha rejeita conta
  sem `passwordHash` com o código certo).
- Front: teste do botão Google (mock do SDK, verifica chamada ao endpoint e os 2 branches de
  resposta).
- Mobile: mesmo teste, mockando `@react-native-google-signin/google-signin`.

## Fora de escopo

- **Login social além de Google** (Apple/Facebook) — não pedido, não faz parte desta spec.
- **Desvincular conta Google** (voltar a ser só-senha) — não pedido; usuário Google-linked sempre
  pode logar pelos 2 métodos se tiver senha definida, não há necessidade de "desconectar".
- **Import de foto de perfil do Google** — irrelevante, o projeto não tem campo de foto de
  usuário ainda (mesma decisão já tomada na spec de tiers).
