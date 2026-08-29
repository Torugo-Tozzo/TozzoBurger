# Fase 7 — Sub-parte LGPD/cybersegurança — Bloco 3: segurança básica — Design

Data: 2026-08-29
Status: aprovado pelo usuário via brainstorm, pronto para plano de implementação.

## Objetivo

Varredura básica de segurança nos repos api e front: headers de resposta
ausentes, rate limiting concentrado só em login/registro, e dependências
desatualizadas/vulneráveis sem triagem.

Este é o terceiro e último bloco da sub-parte LGPD/cybersegurança da Fase 7
(ver `plano.md`). Blocos 1 (legal/consentimento) e 2 (exclusão/exportação)
já foram implementados e aprovados, aguardando merge junto com este bloco.

Diferente dos Blocos 1/2 (decisões de produto reais, specs separados), este
bloco é 3 mudanças técnicas pequenas e mecânicas — cabem num spec só.

## Contexto confirmado antes do brainstorm

- Rate limiting hoje só existe em `POST /auth/login` e `POST /auth/register`
  (`lib/rateLimit.ts` + `modules/auth/auth.routes.ts:14-24`). Nenhuma outra
  rota de negócio (pedidos/vendas/produtos/etc) tem limite.
- `lib/rateLimit.ts` já extrai a chave por `X-Forwarded-For`/`X-Real-IP`
  (`requestKey`, linha 21-24) — o nginx compartilhado já seta esses headers
  em todo `proxy_pass` (confirmado lendo `default.conf` via SSH), então um
  limiter novo funciona corretamente atrás do proxy sem mudança adicional.
- Nenhum plugin de security headers na api — só `@elysiajs/cors`
  (`app.ts:2,46-50`). Sem `X-Content-Type-Options`/`X-Frame-Options`/
  `Referrer-Policy`/`Strict-Transport-Security` aplicado pela aplicação.
- Nginx compartilhado (`/home/victor/nginx-proxy/default.conf` na VM
  Oracle, fora dos 3 repos git — acesso via SSH `victor@163.176.165.59`,
  autorizado pelo usuário nesta sessão) tem 4 `server` blocks reais
  (`dev.tozzo.uk`, `dev-api.tozzo.uk`, `tozzo.uk`/`www.tozzo.uk`,
  `api.tozzo.uk`) + 1 fallback — nenhum deles seta header de segurança
  hoje, só faz proxy reverso puro.
- `bun audit` na api: 76 vulnerabilidades (27 high). A maior parte é cadeia
  transitiva de ferramentas de dev (`prisma > @prisma/dev > ...`,
  `prisma > @prisma/config > ...`) que não roda no processo servido em
  produção. Cadeias que **são** runtime real: `exceljs` (usado no export de
  relatório do `ChartsPage`/backend), `stripe` (SDK de pagamento),
  `@elysiajs/swagger` (docs montada em `/api-docs`, ativa em produção),
  `@sentry/bun` (observabilidade, ativa em produção).
- `bun audit` no front: 60 vulnerabilidades (27 high), praticamente toda a
  cadeia é `vite`/`rollup` — ferramenta de build, não roda no browser do
  usuário final (o bundle final é HTML/JS/CSS estático).
- Fase 3.7 (Cloudflare R2) confirmado: hoje nenhuma rota da api serve ou
  faz proxy de imagem — infra só, sem endpoint ativo. Quando a feature de
  foto existir, imagem carrega direto do domínio do R2, não passa pela
  api/nginx tratados aqui — não compete pelo rate limit novo.
- Mobile é offline-first (WatermelonDB): listar dado já sincronizado não
  bate na api nenhuma vez (leitura local); a api só é chamada no ciclo de
  sync (`/sync/pull`/`/sync/push`), que já é batched (1 chamada trazendo
  todas as mudanças, não 1 por registro).

## Decisões do brainstorm

1. **Headers — quais**: só os de baixo risco de quebra nesta leva —
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: strict-origin-when-cross-origin`,
   `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
   `Content-Security-Policy` fica de fora — exige mapear toda origem de
   script/imagem/API que o front carrega, risco real de quebra, vira leva
   própria futura com tempo de testar direito.
2. **Headers — onde**: nginx nos 4 server blocks (front não tem
   middleware próprio, é build estático) **e** a api também seta os
   mesmos headers no próprio código (Elysia) — defesa em profundidade,
   testável dentro do repo, funciona mesmo se a topologia de proxy mudar
   no futuro.
3. **Rate limit — escopo**: limiter global novo (não substitui os
   específicos de login/registro, que continuam mais apertados e
   intocados) aplicado a **toda rota do app**, exceto `/events` (SSE —
   conexão longa, não é padrão de requests repetidos, não faz sentido
   contar contra o limite).
4. **Rate limit — número**: `1200 req / 15min` por IP. Calculado
   considerando que múltiplos dispositivos do mesmo estabelecimento
   (web + mobile) costumam sair pelo mesmo IP (mesma rede/wifi) — número
   generoso o bastante pra não travar uso real de um turno cheio, ainda
   assim barra abuso/scraping de verdade.
5. **Dependências — estratégia**: documentar a triagem (runtime real vs
   só dev-tooling) e rodar `bun audit fix` (sem `--latest`, só dentro do
   range atual — sem cruzar major version) nos 2 repos, validando suíte
   completa depois. Upgrade de major version (ex: stripe 20→22) fica pra
   decisão separada, fora desta leva.

## Escopo técnico

### API (`api/api-tozzo.uk`)

- **Rate limit global**: novo hook via `createRateLimit` (mesma factory já
  usada em `lib/rateLimit.ts`, sem mudança nela), `windowMs: 15 * 60 * 1000,
  limit: 1200`. Aplicado como um segundo `.onRequest` em `app.ts`, montado
  antes de qualquer `.use(...)` de módulo, verificando
  `new URL(request.url).pathname !== '/events'` antes de rodar o hook —
  assim cobre literalmente toda rota (incluindo `/health`, `/auth/*`,
  todas as rotas de negócio) numa única definição central, sem precisar
  tocar cada `*.routes.ts` individualmente.
- **Security headers**: novo `.onAfterHandle` em `app.ts` setando os 4
  headers da decisão 1 em toda resposta.
- **Dependências**: nota de triagem (novo arquivo em
  `docs/superpowers/sdd/`) listando cada cadeia vulnerável do `bun audit`
  como runtime-real ou dev-tooling-só, com a razão. `bun audit fix` (sem
  `--latest`) rodado depois, suíte completa validando que nada quebrou.

### Front (`front-tozzo.uk`)

- Sem mudança de código de produção — `bun audit` do front é
  majoritariamente `vite`/`rollup` (dev-tooling). Mesma nota de triagem
  (novo arquivo em `docs/superpowers/sdd/`) documentando isso, e
  `bun audit fix` (sem `--latest`) rodado mesmo assim pra pegar qualquer
  patch/minor disponível, com build+suíte completa validando depois.

### Mobile (`TozzoBurger`)

- Fora de escopo — sem rota HTTP própria pra headers/rate-limit, e o
  `bun audit`/triagem de dependência deste bloco cobre só os 2 repos com
  servidor HTTP real (api serve requisição, front é servido via nginx).
  Auditoria de dependência do mobile (`npm`, ecossistema Expo/RN
  diferente) fica fora desta leva.

### Infra — nginx compartilhado (executado direto pelo controller, fora do plano de implementação)

- **Não vira task do plano de implementação** (não é um repo git, não tem
  suíte de teste, é infraestrutura compartilhada de produção) — o
  controller aplica diretamente via SSH, seguindo o mesmo padrão já usado
  na Fase 3.6b (testar em dev primeiro, confirmar, replicar em prod),
  documentado aqui pra registro:
  - Adicionar aos 4 `server` blocks reais de
    `/home/victor/nginx-proxy/default.conf`:
    ```nginx
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    ```
  - Backup do arquivo antes de editar (mesmo padrão do backup
    `default.conf.bak.<timestamp>` já usado na Fase 3.6b).
  - Testar primeiro nos 2 blocks de `dev` (`dev.tozzo.uk`,
    `dev-api.tozzo.uk`), confirmar com `curl -I` que os headers aparecem e
    que nada quebrou (200 normal nos domínios), só depois replicar nos 2
    blocks de `prod`.
  - `nginx -t` antes de `reload`, mesmo padrão de segurança já usado.

## Testes

- API: teste do rate limit global confirmando 429 após exceder 1200 no
  período (usando o mesmo padrão de teste já existente pra
  `createRateLimit`/`registerLimiter` — ver `tests/lib/rateLimit.test.ts`
  e `tests/auth/auth.controller.test.ts` pro estilo), teste confirmando
  que `/events` não conta pro limite (ou pelo menos não é bloqueado pelo
  hook novo), teste dos 4 headers de segurança presentes em qualquer
  resposta (ex: `GET /health`).
- Front/api: nenhum teste novo específico pra `bun audit fix` além de
  rodar a suíte completa existente e confirmar que nada quebrou — o fix é
  só bump de patch/minor dentro do range já usado.

## Fora de escopo

- `Content-Security-Policy` — leva própria futura.
- Upgrade de major version de dependência (ex: stripe 20→22,
  `bun audit fix --latest`) — decisão separada.
- Headers/rate-limit no mobile (sem servidor HTTP próprio) ou auditoria de
  dependência do mobile (ecossistema npm/Expo separado).
- Qualquer mudança de UI/produto (este bloco é infra/segurança pura).
- Blocos 1 e 2 (já implementados) da mesma sub-parte.
