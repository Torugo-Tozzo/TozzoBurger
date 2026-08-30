# Fase 2 — Sub-item: Tiers de precificação (free / pago / enterprise) — Design

Data: 2026-08-30
Status: aprovado pelo usuário via brainstorm, pronto para plano de implementação.

## Objetivo

Sair do preço único de hoje (R$6,90/mês pra todo estabelecimento, sem
nenhuma trava técnica de uso) para uma estrutura de 3 tiers com quota por
funcionalidade, motivado por 2 achados da sessão de 2026-08-30 (documentados
no artifact "Quanto cobrar, hoje e daqui a 1000 clientes", não versionado
neste repo — publicado como Claude Artifact):

1. **Risco de cliente-baleia**: hoje não existe limite nenhum de
   produto/pedido/venda/dispositivo — 1 estabelecimento fora da curva
   consome recurso compartilhado (VM Oracle, 2 OCPU/12GB) sem pagar
   proporcional.
2. **Preço muito abaixo de mercado**: pesquisa de concorrente direto (Kyte,
   PDV simples sem fiscal) mostrou plano de entrada pago em R$49,90/mês —
   R$6,90 está ~7x abaixo mesmo do comparável mais parecido.

Este é um dos 3 sub-itens que agora compõem a Fase 2 do `plano.md`
(recuperação de senha + 2FA + Brevo | **tiers de precificação [esta spec]**
| Google Sign-In). Os outros dois têm brainstorm/spec próprios, feitos
separadamente — Google Sign-In foi explicitamente cortado desta spec por
pedido do usuário (assunto de autenticação, não de precificação/quota).

## Contexto confirmado no código antes do brainstorm

- `Establishment` (`api/api-tozzo.uk/prisma/schema.prisma`) não tem nenhum
  campo de plano/tier hoje — qualquer estabelecimento ativo tem acesso
  igual, sem limite de `Product`, `Order`, `Sale`, `Device`.
- `Product` não tem campo de foto (`photoUrl`) — decisão consciente da Fase
  3.7 de deixar de fora por enquanto. Risco de armazenamento de foto por
  cliente-baleia é, portanto, **futuro**, não atual.
- Fechar um pedido (`modules/orders/orders.controller.ts:190-223`) cria uma
  `Sale` nova (copiando cada `OrderItem` pra `SaleItem` novo) e mantém o
  `Order` original pra sempre, só com `isOpen: false` — duplicação real de
  dado, achado nesta sessão, mas **fora de escopo desta spec** (mexe em
  paginação da Fase 3 e retenção local da Fase 5 sub-item 4B — merece
  investigação própria).
- Impressão de recibo é feita via Bluetooth direto do app mobile pra
  impressora térmica (`useBLE.ts`), **sem passar pela API hoje** — não existe
  nenhum registro server-side de "quantos recibos foram impressos". App é
  offline-first (`database/syncGuard.ts`), impressão funciona hoje sem
  internet nenhuma — restrição real que molda o design da quota de
  impressão abaixo.
- `ChartsPage` (front) e `relatorioModal` (mobile) já sempre chamam a API
  pra buscar dado agregado — não há cálculo local, gate de quota nesse caso
  não tem a mesma restrição de offline que a impressão.
- RBAC por `role` (`DONO`/`GERENTE`/`FUNCIONARIO`/`CLIENTE`) já existe e é
  validado no servidor (`users.rules.ts`, ex-`usuarios.rules.ts`) — regra
  do projeto (`CLAUDE.md`) é nunca confiar em checagem só no front/app.
- Checkout Stripe hoje (`modules/payments/payments.controller.ts`) usa
  `price_data` inline (`MONTHLY_PRICE = 6.90`, `ANNUAL_PIX_PRICE = 60.91`),
  não `Price` pré-cadastrado no Stripe Dashboard — 2 funções quase-duplicadas
  (`createStripeMonthlyCheckout`/`createStripeAnnualCheckout`).
- Pesquisa de mercado (concorrente direto por nome, feita nesta sessão):
  **Kyte** — free trava por *feature* (1 usuário, 1 foto/produto, sem
  impressão, sem relatório, sem web), não por quantidade de produto/venda
  (checado em 3 buscas diferentes, inclusive a página oficial de planos);
  pago a partir de R$49,90 (PRO, hoje). **Saipos** — a partir de
  R$240,79/mês, já inclui fiscal (não comparável ainda, TozzoUk só chega lá
  na Fase 9). **iFood** — não tem PDV próprio.

## Decisões do brainstorm

### Matriz de tiers

| Dimensão | Free | Pago (novo) | Pago (legado) | Enterprise |
|---|---|---|---|---|
| Preço | R$0 | R$14,90/mês | R$6,90/mês (preservado) | R$79,90/mês + R$8/dispositivo extra |
| Produtos/tipos de produto | ilimitado | ilimitado | ilimitado | ilimitado |
| Dispositivos simultâneos | 3 | 8 | 8 | 15 inclusos |
| Impressão de recibo | 30/dia | ilimitado | ilimitado | ilimitado |
| Geração de relatório | 5/mês | ilimitado | ilimitado | ilimitado |
| Acesso web — DONO | sim | sim | sim | sim |
| Acesso web — GERENTE | não (mobile só) | sim | sim | sim |
| Acesso web — FUNCIONÁRIO | nunca (mobile só, todo tier) | nunca | nunca | nunca |

1. **Sem limite de produto/tipo de produto** — decisão consciente de
   competir de igual pra igual com o Kyte (que também não limita
   quantidade), mesmo abrindo mão de uma trava de cobrança fácil.
   Justificado tecnicamente: produto/pedido/venda em texto não ameaça o
   disco da VM (linha de banco pesa centenas de bytes, headroom atual de
   158GB aguentaria dezenas de milhões de linhas).
2. **Números de quota (30 impressões/dia, 5 relatórios/mês, 3/8/15
   dispositivos) são hipótese de ponto de partida, não medição** — não
   existe telemetria real de uso hoje (1 cliente real, amostra não
   generalizável) nem teste de carga rodado (Fase 21, pendente). Calibrar
   com uso real depois de lançar, ajustar se necessário.
3. **Dispositivo é o proxy real de carga de servidor** identificado nesta
   sessão (throughput de sync, não volume de dado histórico) — por isso é
   o único eixo que também vira cobrança incremental no Enterprise
   (R$8/dispositivo extra), diferente de produto/venda que ficam sempre
   ilimitados em todo tier.
4. **Preço do Pago sobe de R$6,90 pra R$14,90** pra assinante novo — ainda
   ~3x mais barato que o Kyte (posicionamento de vantagem competitiva
   deliberada), mas corrige a defasagem de mercado achada na pesquisa.
   **Cliente que já assina hoje mantém R$6,90** (`PAGO_LEGADO`) — sem
   aumento retroativo. Se cancelar e assinar de novo no futuro, entra no
   `PAGO` novo — sem lógica especial de "readquirir preço legado".
5. **Enterprise R$79,90 inclui 15 dispositivos** (quase o dobro do Pago) —
   salto de capacidade real, não só remoção de teto, justificando o pulo de
   preço.

### Gate de impressão — offline-first (decisão de arquitetura)

3 abordagens avaliadas:

- **A — servidor decide, síncrono**: app pergunta à API antes de imprimir.
  Rejeitada — quebra impressão 100% offline que existe hoje (regressão real
  num POS que já opera sem internet em parte do fluxo).
- **B — contagem local otimista + reconciliação (escolhida)**: cada
  impressão gera um evento `PrintLog` local, decisão de liberar/bloquear é
  tomada com o dado que o dispositivo já tem (do último sync + o que ele
  mesmo imprimiu depois), sincroniza como qualquer outra tabela
  (`sincronizacao`, push/pull por `checkpoint`). Aceita overshoot pequeno em
  cenário raro (múltiplos dispositivos offline simultâneos perto do limite)
  como trade-off consciente — servidor não rejeita retroativamente (recibo
  físico já saiu, não tem como "desimprimir").
- **C — sem gate técnico, só aviso visual**: rejeitada por não ser
  enforcement de verdade, só nudge ignorável.

### Gate de relatório — servidor, sem restrição de offline

`ChartsPage`/`relatorioModal` já sempre dependem de rede — quota conta e
decide 100% no endpoint da API, sem a complexidade de sync do gate de
impressão. **"1 geração" = 1 carregamento da tela/modal**, não cada troca
de filtro dentro da tela já aberta (evita punir ajuste de data como se
fosse nova geração).

### Gate de acesso web (GERENTE) — via endpoint, não via "tipo de cliente"

Rejeitada a ideia de distinguir "é o app web" vs "é o mobile" por header —
falsificável, e violaria a regra do projeto de sempre validar RBAC no
servidor. Design escolhido: os endpoints que só o dashboard web usa
(relatório/gráfico completo, gestão de funcionário, filtros avançados de
histórico) checam `role === GERENTE && plan === FREE` e retornam
`403 PLAN_UPGRADE_REQUIRED`. Mobile nunca chama esses endpoints pra GERENTE
mesmo (não tem essas telas), então não há regressão — front interpreta o
403 e mostra parede de upgrade em vez do dashboard.

## Escopo técnico

### API (`api/api-tozzo.uk`)

**Schema (Prisma, migration aditiva)**:

```prisma
enum EstablishmentPlan {
  FREE
  PAGO
  PAGO_LEGADO
  ENTERPRISE
}

model Establishment {
  // ...campos existentes
  plan               EstablishmentPlan @default(FREE)
  extraDevices       Int               @default(0)
  reportCount        Int               @default(0)
  reportCountResetAt DateTime          @default(now())
}

model PrintLog {
  id              String        @id @default(uuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  deviceId        String
  printedAt       DateTime      @default(now())

  @@index([establishmentId, printedAt])
  @@map("TB_PRINT_LOGS")
}
```

- Migration de dado: todo `Establishment` já `ACTIVE` com `stripeCustomerId`
  preenchido vira `PAGO_LEGADO` (preço R$6,90 real já está na assinatura
  Stripe existente, migration só marca o enum).
- `reportCount`/`reportCountResetAt` direto no `Establishment` — reset lazy
  (checa se `resetAt` já passou do mês na hora de validar, zera e atualiza
  ali mesmo, sem cron/job agendado).
- `PrintLog` sincroniza pelo mesmo mecanismo de `sincronizacao` (push/pull
  por `checkpoint`) que `Order`/`Sale` já usam — não é tabela nova de
  infraestrutura, é mais uma entidade sincronizável.
- Contagem de dispositivo usa a tabela `Device` já existente
  (`count()` por `establishmentId`) — sem campo novo pra isso.

**Endpoints**:

- `POST /orders/:id/print-log` (ou rota equivalente dentro de `sync`) —
  recebe o evento de impressão do mobile (fire-and-forget, mesmo padrão de
  push de outras entidades), grava `PrintLog`. Não rejeita mesmo se
  acima da quota (ver decisão de arquitetura acima).
- `GET /sync` (endpoint existente de `sincronizacao`) passa a incluir
  `PrintLog` no payload de pull, filtrado por `establishmentId` e por
  período recente (hoje/ontem, suficiente pra reconciliar o contador
  diário — não precisa histórico completo).
- Endpoint de relatório existente (`modules/charts` ou equivalente) ganha
  checagem de quota antes de servir: se `plan === FREE`, valida/incrementa
  `reportCount`; no limite, retorna `402/403 REPORT_QUOTA_EXCEEDED`.
- Endpoints só-dashboard-web (relatório completo, gestão de funcionário,
  filtro avançado de histórico) ganham checagem
  `role === GERENTE && plan === FREE` → `403 PLAN_UPGRADE_REQUIRED`, dentro
  do mesmo guard de RBAC que já existe (`users.rules.ts`).
- Endpoint de criação de `Device` (registro de novo dispositivo) valida
  contagem atual (`Device.count()` por `establishmentId`) contra o limite
  do `plan` (3/8/15) antes de permitir novo registro — retorna
  `403 DEVICE_LIMIT_REACHED` se estourado. Endpoint novo pra **remover**
  dispositivo (`DELETE /devices/:id`), acessível só por `DONO`, libera vaga.

**Stripe** (`modules/payments/payments.controller.ts`):

- Novas constantes: `PAGO_MONTHLY_PRICE = 14.90`,
  `ENTERPRISE_BASE_PRICE = 79.90`, `ENTERPRISE_EXTRA_DEVICE_PRICE = 8.00`.
- `createCheckout(tier, interval)` genérico substitui as 2 funções
  quase-duplicadas atuais (`createStripeMonthlyCheckout`/
  `createStripeAnnualCheckout`).
- Dispositivo extra do Enterprise: `Price` recorrente próprio no Stripe
  ("Dispositivo extra", R$8), como segundo item (`quantity` = extra acima
  de 15) na mesma assinatura. Mudança de `extraDevices` no `Establishment`
  dispara `stripe.subscriptionItems.update` ajustando a quantidade — Stripe
  proraeia automaticamente.
- Troca de tier (ex: Pago→Enterprise): cancela assinatura atual
  (`cancelSubscription`, já existe) + novo checkout do tier novo. Sem swap
  de item na mesma assinatura — mais simples, troca de tier deve ser rara.
- Cliente `PAGO_LEGADO` não tem checkout de "renovar no preço legado" — se
  cancelar, resubscreve no `PAGO` novo.

### Front (`front-tozzo.uk`)

- `PlanSelectionPage` ganha o tier Enterprise (hoje só tem
  mensal/anual do plano único) e reflete o novo preço do Pago (R$14,90).
- Componente de paywall reutilizável: quando a API retorna
  `PLAN_UPGRADE_REQUIRED`/`REPORT_QUOTA_EXCEEDED`/`DEVICE_LIMIT_REACHED`,
  mostra tela apropriada em vez do erro cru (mensagem diferente pra
  GERENTE — "peça pro dono" — vs DONO — "fazer upgrade").
- Tela/aba nova "Dispositivos" (dentro de Funcionários ou nav própria) —
  lista `Device` por estabelecimento, mostra uso atual vs limite do tier,
  botão remover (só visível pra `DONO`).
- Configurações/perfil mostra tier atual e uso (impressão do dia,
  relatório do mês) pro `DONO`.

### Mobile (`TozzoBurger`)

- `configs.tsx` ganha seção "Plano": tier atual, contadores de uso
  (`27/30 impressões hoje`, `3/5 relatórios este mês` — só aparecem se
  `plan === FREE`, tiers pagos mostram "ilimitado"), link "fazer upgrade"
  abrindo o checkout web no navegador (`WebBrowser.openBrowserAsync`, mesmo
  padrão já usado nos links de `/privacidade`/`/termos`).
- Fluxo de impressão: antes de chamar a impressora BLE, checa `PrintLog`
  local (hoje) contra o limite; se estourado, mostra modal de upgrade em
  vez de imprimir (venda continua fechando normal — só a impressão trava).
  Gate implementado localmente, sem chamada de rede na hora da decisão
  (ver design de arquitetura acima).
- Fluxo de relatório (`relatorioModal`): chamada à API já existe, só passa
  a tratar o novo erro `REPORT_QUOTA_EXCEEDED` mostrando upgrade em vez do
  gráfico.
- Sem gestão de dispositivo no mobile (fica só no web) — no máximo mostra
  contagem read-only (`3/3 dispositivos usados`).

## Testes

- API: migration testada em Postgres efêmero (mesmo padrão já usado no
  projeto). Testes de quota (`reportCount` reset lazy mensal, incremento,
  bloqueio no limite), testes de RBAC+plano (`GERENTE`+`FREE` bloqueado nos
  endpoints certos, `DONO` sempre passa, `FUNCIONARIO` nunca acessa
  endpoint web-only independente de plano), teste de limite de dispositivo
  (registro bloqueado no teto, liberado após remoção), teste de migration
  de dado (`Establishment` ativo vira `PAGO_LEGADO`).
- Front: teste do componente de paywall (mensagem certa por role), teste
  de `PlanSelectionPage` com o tier Enterprise novo.
- Mobile: teste do gate local de impressão (decisão com `PrintLog` local,
  incluindo cenário offline simulado), teste do tratamento do erro
  `REPORT_QUOTA_EXCEEDED` no `relatorioModal`.

## Fora de escopo

- **Google Sign-In** — cortado explicitamente pelo usuário desta spec,
  vira sub-item próprio da Fase 2 com brainstorm separado.
- **Deduplicação Order/Sale** (achado técnico desta sessão, pedido fechado
  fica em dobro no banco) — não é a causa do problema de escala modelado
  aqui (disco não é o gargalo), mexe em Fase 3/5.4B, investigação própria.
- **Foto de produto e cobrança por armazenamento** — campo `photoUrl` nem
  existe ainda (Fase 3.7 deixou de fora); custo de R2 calculado nesta
  sessão é irrelevante financeiramente mesmo em milhares de estabelecimentos
  — decisão de não criar tier/cobrança de foto.
- **Contagem de dispositivo por atividade recente** (ex: expira sozinho
  após 30 dias sem sync) — rejeitada em favor de registro permanente +
  remoção manual pelo dono, mais simples de implementar.
- **Stripe metered billing de verdade** (usage records diários) pro
  dispositivo extra do Enterprise — usa `quantity` em subscription item
  fixo, atualizado por evento (adicionar/remover dispositivo), não
  contagem de uso reportada continuamente.
- **Calibração dos números de quota com dado real** — planejado como
  trabalho pós-lançamento (instrumentar uso + rodar Fase 21, teste de
  carga), não bloqueia esta implementação.
- **Catálogo público compartilhável e importação de produto em massa** —
  achados relacionados da mesma sessão, registrados no backlog do
  `plano.md`, não são parte desta spec (features de produto, não de
  precificação/quota).
