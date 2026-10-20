# App Android em Kotlin — design

Data: 2026-10-20. Substitui, no que divergir, o plano de 2026-10-10 em `../api-tozzo.uk/docs/superpowers/plans/migracao-go/app-android.md` (que continua valendo para auth, impressão e atualização do APK, conforme indicado abaixo).

## Intenção

Trocar o app React Native (`TozzoBurger`, Expo) por um app Android nativo em Kotlin + Jetpack Compose que:

- fala só com o contrato `/v1` da API Go (`https://dev-api.tozzo.uk/v1` na homologação);
- funciona **offline-first**: toda tela lê e grava no banco local, e a rede só entra no sync;
- tem **todos os módulos** que o web Solid ganhou (cozinha, entregas, serviços, orçamentos, OS, agenda etc.), e não só os do app antigo;
- é **leve e rápido**: o usuário pediu foco total em performance.

O app RN ficou desatualizado em relação à API e ao web da `dev`. Ele serve só como referência de fluxos de balcão (vender, imprimir, fechar conta). A referência de regras, módulos e visual é o **web Solid** (`../front-tozzo.uk/src`).

## Metas

1. Login obrigatório no primeiro acesso, que vincula o aparelho a um estabelecimento. Depois disso, o app abre e funciona sem internet.
2. Paridade de módulos com o web, com a mesma regra de visibilidade por perfil do negócio e por papel (`resolveNavigationModules` em `front-tozzo.uk/src/domain/businessPreferences.ts`).
3. Módulos operacionais com leitura **e escrita** offline. Módulos de administração com leitura offline e escrita só online.
4. Navegação por barra lateral escondida (gaveta), no lugar das abas embaixo.
5. Impressão Bluetooth, atualização do APK e instalação por cima do app RN.

## Fora do escopo

- Criar conta, onboarding do perfil do negócio, escolha de plano e pagamento: ficam **só no web**. O app mostra um link para o site quando a conta não tem estabelecimento configurado ou quando o plano bloqueia algo.
- Papel CUSTOMER (cardápio): o web também não dá acesso a ele. O app mostra "sem acesso" e o botão sair.
- iOS.
- Produção (`main`): nada muda. A migração dos clientes de produção é um plano separado.
- Compatibilidade com o banco local do RN (WatermelonDB): o app novo não lê esses dados (ver "Instalação por cima do RN").

## Anti-metas (falhou mesmo se "funcionar")

- Tela que espera a rede para mostrar algo que já está no aparelho.
- Venda, pedido ou OS feita offline que some sem aviso. Toda recusa do servidor fica visível para o usuário.
- App pesado: abertura lenta, rolagem travando, serviço em segundo plano rodando sem parar.
- Visual diferente do web sem motivo.

## Restrições

- **Repo:** `TozzoBurger`, branch `dev`. O app Kotlin fica na pasta **`kotlin/`** (decisão do agente: `android/` já é o projeto nativo do RN e não pode ser regenerado nem misturado). O RN continua no repo até o corte. Push na `dev` só com pedido do usuário; `git add <arquivos>`, nunca `-A`.
- **Dependências:** só com licença MIT, BSD, ISC, Apache-2.0 ou MPL-2.0. Biblioteca fora da stack abaixo só perguntando antes. O PowerSync (serviço FSL, SDK MIT, core Apache-2.0) já foi aceito em 2026-10-10.
- **Aparelho alvo:** Android com **4 GB de RAM ou mais** (decisão do usuário). `minSdk 26` (Android 8), por custar pouco (decisão do agente). `targetSdk`/`compileSdk` no mínimo o que o SDK do PowerSync exige (o spike usou `compileSdk 37`, Kotlin 2.4, AGP 9.3).
- **Ambiente local:** `source ../dev-env.sh` (JDK 17 em `~/.local/share/tozzo/jdk17`, Android SDK em `~/Android/Sdk`). AVD `Pixel_7_Pro`. Se o AGP exigir um JDK mais novo, avisar o usuário antes de instalar.
- **API:** homologação em `https://dev-api.tozzo.uk/v1` (contrato em `https://dev-api.tozzo.uk/v1/docs`; `api-tozzo.uk/api/openapi.yaml`). PowerSync em `https://dev-api.tozzo.uk/sync`. A URL base é um `buildConfigField` por build type, nunca fixa no código.
- **Mudanças na API** seguem as regras do repo `api-tozzo.uk` (ler o `AGENTS.md` de lá); só na `dev`; só mudanças aditivas no schema enquanto o Bun existir na dev.
- Código em inglês, documentos em português, textos de interface via `strings.xml` nos 6 idiomas do web (`pt-BR`, `en`, `es`, `fr`, `hi`, `zh`).

## Stack (decidida no plano de 2026-10-10, mantida)

| Área | Escolha |
|---|---|
| UI | Kotlin, Jetpack Compose, Material 3 com tema próprio |
| Arquitetura | MVVM: `ViewModel` + `StateFlow`; um módulo Gradle `app` com pacotes por feature no início |
| DI | Hilt |
| Banco local e sync | PowerSync Kotlin SDK (Implementação A da fase 8), consultas reativas com `Flow` |
| HTTP | Retrofit + OkHttp + kotlinx.serialization |
| Segundo plano | WorkManager |
| Segredos | DataStore + Tink (chave no Android Keystore) |
| Imagens | Coil |
| Gráficos | Vico |
| Testes | JUnit 5, Turbine, MockWebServer, Compose UI Test, Robolectric |
| Qualidade | ktlint, detekt, Android Lint, Baseline Profile, Macrobenchmark |

Detalhes que o spike da fase 8 já descobriu e que valem aqui (`api-tozzo.uk/docs/superpowers/plans/migracao-go/fase-08-sync.md`, "Registro do spike"):
- o SDK não retenta o upload sozinho depois de reconectar: o app chama `connect()` no callback de rede do `ConnectivityManager`;
- `CrudEntry.opData` vem como texto: usar `opData.typed` e converter `is_*` (0/1) para booleano;
- **gravar a recusa em `sync_rejections` antes de completar o lote**, porque completar apaga a op;
- `opId` estável = UUID v3 de `deviceId:clientId`.

## Navegação e estrutura de telas

Escolhida pelo usuário no mockup (opção A):

- **Gaveta lateral escondida**, aberta pelo ☰ do topo ou deslizando da borda esquerda, por cima do conteúdo, com fundo escurecido. Fecha ao escolher um módulo ou tocar fora.
- Cabeçalho da gaveta: marca Tozzo, nome do estabelecimento e papel do usuário.
- Itens agrupados em **Operação**, **Cadastro** e **Gestão**, com **Configurações** no rodapé (e o botão sair dentro de Configurações). Ícones iguais aos do web (Lucide, no web em `DashboardLayout.tsx`; no app, os mesmos desenhos como vetores).
- Só aparecem os módulos de `resolveNavigationModules(role, establishment)`: portar essa função e as constantes de `businessPreferences.ts` para Kotlin, com os mesmos testes do web.
- COOK e DRIVER, que têm um módulo só, não veem a gaveta: entram direto na Cozinha ou nas Entregas, com um menu no topo só para sair e configurar a impressora (decisão do agente).
- COOK e DRIVER também são **offline** (decisão do usuário, 2026-10-20), com sync filtrado por papel: ver "Sync por papel" em "Dados e sync".
- **Selo de sync** no topo de toda tela: sincronizado, sincronizando, offline ou "N recusas" (abre a lista de recusas).
- **Tela inicial** após o login: o primeiro módulo de Operação do perfil; para FOOD, **Vender** (decisão do agente).

Agrupamento (decisão do agente; ajustar se o usuário preferir):

| Grupo | Módulos (quando visíveis) |
|---|---|
| Operação | Vender, Pedidos, Cozinha, Entregas, Vendas, Ordens de serviço, Orçamentos |
| Cadastro | Produtos, Serviços, Agenda |
| Gestão | Relatórios, Funcionários, Dispositivos |
| Rodapé | Configurações |

**Vender** é a tela de balcão do app atual (carrinho → venda + impressão), que no web fica dentro de Vendas/Pedidos. Ela aparece para quem vê o módulo SALES.

## Visual

- Tokens do web (`front-tozzo.uk/src/index.css`): preto e branco, **contorno preto de 1 px** em cards, painéis e campos, raio de 8 px (`--radius: 0.5rem`), `destructive` vermelho. Tema escuro com os valores do bloco `.dark`. Cores de estado do app atual (`constants/Colors.ts`): sucesso `#10b981`, aviso `#f59e0b`, perigo `#ef4444`, info `#3b82f6`.
- Os componentes de base do web (`button`, `card`, `dialog`, `input`, `select`, `tabs`, `table`, `badge`, `empty-state`, `skeleton`) viram composables próprios num pacote `ui/`. Uma tela de catálogo interna (só no build debug) mostra todas as variantes, como o `/__ui` do web.
- Cada tela segue o **conteúdo e os estados** da página equivalente do web, adaptados ao celular (listas em vez de tabelas, diálogos em tela cheia quando o formulário for longo). Não precisa ser cópia pixel a pixel nem do web nem do RN.
- Mockup aprovado: `TozzoBurger/.superpowers/brainstorm/` (arquivo `navegacao.html`, fora do Git).

## Primeiro acesso e sessão

1. Sem sessão salva, o app abre direto na tela de **login** (email/senha e Google via Credential Manager), com `client: "android"`. Links para "criar conta" e "esqueci a senha" abrem o site.
2. Depois do login: `GET /v1/me`. Sem estabelecimento ou sem onboarding feito → tela "termine a configuração no site", com link e botão sair.
3. **Vínculo do aparelho:** UUID do dispositivo gerado na primeira abertura e guardado cifrado; `POST /v1/devices`. Se o plano não permitir mais aparelhos, mostrar a mensagem da API e o link para o plano no web.
4. **Primeiro download:** `POST /v1/sync/token` → `connect()` do PowerSync; tela de progresso até o primeiro sync completo. Só então as telas liberam.
5. Daí em diante o app abre do banco local, sem esperar a rede.

O resto da sessão segue o plano de 2026-10-10, seção "Autenticação no app": access token só em memória, refresh cifrado, `Authenticator` com `Mutex` (um refresh por vez, salva o refresh novo antes de repetir), `SESSION_REVOKED` leva ao login **sem apagar o banco**. Trocar de usuário ou de estabelecimento só pelo "Desvincular este aparelho" (ver "Um aparelho, um funcionário").

## Dados e sync

### O que já existe na API

- Regras de sync (`api-tozzo.uk/deploy/powersync/sync-rules.yaml`), um bucket por estabelecimento: `product_types`, `products`, `orders`, `order_items`, `sales`, `sale_items`, `print_logs`, `users`.
- Upload (`POST /v1/sync/upload`, `internal/devicesync/ops.go`): `sales` PUT/PATCH, `orders` PUT/PATCH/DELETE, `order_items` PATCH, `product_types` e `products` PUT/PATCH/DELETE, `print_logs` PUT. Uma transação por op, idempotência por `sync_applied_ops`, recusa com código e `detail`.

### O que falta ampliar na API (decisão do usuário: todos os módulos operacionais offline)

| Módulo do app | Tabelas no Postgres | Download (sync rules) | Upload (ops novas) | Regras que o upload reaproveita |
|---|---|---|---|---|
| Entregas | `TB_ORDERS` (campos de entrega) | acrescentar em `orders` as colunas que faltam: `driverId`, `externalDriverName`, `externalDriverPhone` (endereço e início da entrega já descem) | `orders` PATCH com mudança de status de entrega | `PATCH /v1/delivery/orders/{id}` |
| Cozinha | `RL_ORDER_PRODUCT` | `order_items` (já desce; conferir colunas de status) | `order_items` PATCH (já existe; conferir se cobre o fluxo do `PATCH /v1/kitchen/orders/{id}/items`) | módulo kitchen |
| Serviços | `TB_SERVICE_OFFERINGS` | nova consulta `services` | `services` PUT/PATCH/DELETE | `/v1/services` |
| Orçamentos e OS | `TB_SERVICE_ORDERS`, `RL_SERVICE_ORDER_ITEM`, `TB_SERVICE_ORDER_EVENTS` | novas consultas `service_orders`, `service_order_items`, `service_order_events` | `service_orders` PUT/PATCH/DELETE e as transições (orçamento, suplementos, concluir) | `/v1/service-orders` e sub-rotas; o fechamento já é idempotente (fase 5) |
| Vendas de serviço | `RL_SALE_SERVICE_ITEM` | nova consulta `sale_service_items` | junto com `sales` PUT | `/v1/sales` |
| Agenda | `TB_CALENDAR_EVENTS`, `TB_CALENDAR_SHIFTS`, `TB_CALENDAR_SHIFT_ASSIGNMENTS` | novas consultas `calendar_events`, `calendar_shifts`, `calendar_shift_assignments` | `calendar_events` e `calendar_shifts` PUT/PATCH/DELETE | `/v1/calendar/*` |
| Estabelecimento, preferências e horário de funcionamento | `TB_ESTABLISHMENTS` (o horário fica na coluna `businessHours`) | nova consulta só com o próprio estabelecimento e os campos que o app usa (nome, perfis, módulos visíveis, plano, `businessHours`) | só online (administração) | — |

Regras para cada ampliação:
- **As transições** (concluir OS, aprovar orçamento etc.) viram ops com a mesma validação das rotas `/v1`, extraída para a camada de serviço e chamada pelos dois caminhos. Nada de regra de negócio duplicada no `ops.go`.
- **Conflito:** o servidor é a fonte da verdade. Edição sobre registro já fechado, cancelado ou apagado no servidor é **recusada** com código próprio, e o app mostra a recusa explicada.
- Testes de upload para cada op nova no padrão de `internal/devicesync/upload_test.go`, incluindo isolamento entre estabelecimentos e `duplicate`.
- O contrato do upload (tabelas e campos aceitos) entra no `openapi.yaml`.
- O que o builder descobrir no código e não estiver nesta tabela (outra coluna, outra tabela) segue o mesmo padrão; mudança de schema só aditiva.

### Sync por papel (decisão do usuário: COOK e DRIVER offline)

Hoje a API **não** deixa COOK e DRIVER sincronizarem nem registrarem o aparelho:
- `syncRoles` em `internal/devicesync/service.go` só aceita OWNER, MANAGER, EMPLOYEE e CUSTOMER;
- o `POST /v1/devices` usa uma política sem `Kitchen`/`Delivery`, e o `authz.Authorize` recusa esses papéis;
- o bucket atual é um só por estabelecimento e leva **todos** os pedidos e vendas, enquanto a API mostra ao DRIVER só os pedidos dele (`internal/order/delivery.go`).

O que muda na API (etapa 2):
- o token de sync passa a levar o papel e o id do usuário; as regras do PowerSync ganham **buckets por papel**:
  - **cozinha (COOK):** pedidos abertos e itens, produtos e tipos, nomes dos usuários. Sem vendas, sem relatórios;
  - **entregador (DRIVER):** só os pedidos de entrega atribuídos a ele (`driverId`) e os itens deles, mais produtos e tipos;
  - os outros papéis seguem com o bucket do estabelecimento;
- `syncRoles` e a política do `POST /v1/devices` passam a aceitar COOK e DRIVER;
- o upload aceita de COOK só as ops de item de pedido que a rota da cozinha aceita, e de DRIVER só as de status de entrega que a rota de entregas aceita. Qualquer outra op desses papéis é recusada;
- teste de isolamento: um COOK não recebe vendas, e um DRIVER não recebe pedido de outro entregador.

### Um aparelho, um funcionário (decisão do usuário)

O upload grava como autor quem está logado **na hora do envio** (`SellerID = p.UserID`). Para não atribuir a venda à pessoa errada, cada aparelho fica preso a **um** usuário:
- o primeiro login vincula o aparelho ao usuário (guardado localmente com o id do estabelecimento; a API já grava `lastUserId` em `TB_DEVICES`);
- o login de **outro usuário** no mesmo aparelho é recusado com uma explicação. Para trocar, a pessoa vinculada usa **"Desvincular este aparelho"** em Configurações, que só é liberado com a fila de envio vazia e online, apaga os dados locais e volta para o login;
- se a sessão for revogada, só o **mesmo** usuário entra de novo, e a fila sobe depois;
- conferir no servidor (etapa 1): se o `POST /v1/devices` vier de um usuário diferente do `lastUserId` de um aparelho já registrado, decidir com o usuário se a API também recusa. Até lá, a trava é só no app.

### Plano e status do estabelecimento

Decisão do usuário (2026-10-20): **não existe suspensão**. Pagamento que falha ou assinatura que acaba volta o estabelecimento para o **FREE**, ativo, e o FREE só limita (impressões, aparelhos, acesso de não donos).

- **Bug na API, a corrigir na etapa 1:** hoje o `invoice.payment_failed` chama `SuspendEstablishment` (`api-tozzo.uk/internal/billing/events.go`), e o `authz.Authorize` responde 402 a tudo, inclusive sync e upload. Correção: a falha de pagamento faz o mesmo que o fim da assinatura (FREE + ACTIVE, como o `EndSubscription`), nunca `SUSPENDED`. Se o Stripe cobrar de novo com sucesso, o `invoice.payment_succeeded` já devolve o plano pago. Teste no padrão dos testes de billing.
- **No app:**
  - FREE: aplicar os limites que a API devolve (cota de 30 impressões por dia; `PLAN_UPGRADE_REQUIRED` quando o FREE só permite o dono; `DEVICE_LIMIT_REACHED`), com a mensagem e o link do plano no web. O app continua vendendo offline;
  - `410 ESTABLISHMENT_DELETED`: o estabelecimento foi excluído. Mostrar o aviso, apagar os dados locais e voltar para o login;
  - `402` (só dado antigo com status diferente de ACTIVE): tratar como somente leitura, com aviso (decisão do agente).

### Administração (decisão do usuário: só online para escrever)

Funcionários (`/v1/users`), Dispositivos (`/v1/devices`), Configurações e preferências (`/v1/establishment*`, `/v1/business-hours`) e Relatórios exportados (`/v1/reports/exports`):
- leitura offline pelos dados sincronizados (usuários, estabelecimento) ou pelo último resultado salvo;
- botões de criar/editar/apagar desligados offline, com o motivo visível; online, chamam a API direto.

### Relatórios

Calculados **localmente** sobre vendas e itens sincronizados (as mesmas métricas do `ChartsPage` do web). Exportar Excel/PDF chama a API (online).

### Tempo real

Com o PowerSync, as mudanças chegam pelo stream do próprio sync; o app **não** abre o SSE `/v1/events` (decisão do agente; abrir os dois duplicaria tráfego e bateria).

## Performance (decisão do usuário: foco total; alvo 4 GB de RAM)

Critérios, medidos no emulador `Pixel_7_Pro` e, antes do primeiro APK, num aparelho real de 4 GB:
- abertura a frio **< 1 s** com Baseline Profile, já logado;
- listas (pedidos, vendas, catálogo, OS) com **< 5% de frames lentos** no Macrobenchmark;
- RSS em uso **< 150 MB**;
- APK release com R8 e recursos encolhidos; registrar o tamanho a cada etapa e explicar qualquer crescimento grande;
- nenhuma consulta ou chamada de rede na thread principal; consultas paginadas ou limitadas nas listas grandes (vendas);
- sem serviço em primeiro plano nem wakelock: o sync roda com o app aberto e, fechado, só via WorkManager com rede.

## Impressão, atualização e instalação por cima do RN

Seguem o plano de 2026-10-10 sem mudança:
- **Impressão Bluetooth ESC/POS:** a impressora escolhida é configuração **do aparelho** (DataStore), não sincroniza; a tabela `TB_PRINTERS` do baseline não é usada pela API Go. Portar `useBLE.ts`, `hooks/formatarVendaImpressao.ts` e `constants/printerWidths.ts`; mesmo cupom, testes de snapshot com os cupons do RN; permissões por versão do Android; `print_logs` sobe pelo sync; cota FREE de 30 por dia. Funcionamento físico só vale com teste em impressora real.
- **Atualização do APK** via `latest.json` no R2, conferindo o SHA-256 antes de instalar e bloqueando abaixo de `minSupportedVersionCode`.
- **Mesmo `applicationId`** (`com.torugotozzo.TozzoUk`) e a **mesma chave do EAS**, que o usuário baixa antes do primeiro APK; `versionCode` acima do último do RN; aviso para sincronizar o RN antes de atualizar.

## Ordem de trabalho

Cada etapa termina com testes passando, o app rodando no emulador contra `dev-api.tozzo.uk` e uma revisão do usuário.

1. **Base:** correção do bug de suspensão na API; projeto em `kotlin/`, CI (lint, testes, build), tema e componentes de base, gaveta com a regra de módulos, i18n, login, vínculo do aparelho a um usuário, PowerSync com as tabelas que já existem, selo de sync e tela de recusas.
2. **Comida:** sync por papel na API (COOK e DRIVER), colunas de entrega que faltam; telas Vender, Pedidos, Cozinha, Entregas, Vendas, Produtos e tipos.
3. **Serviços:** ampliação do sync na API (download e upload de serviços, OS/orçamentos, itens, eventos e vendas de serviço) e as telas Serviços, Orçamentos e Ordens de serviço.
4. **Agenda:** ampliação do sync da agenda e a tela.
5. **Gestão:** Relatórios locais, Funcionários, Dispositivos e Configurações (online).
6. **Entrega:** impressão Bluetooth, atualização do APK, Baseline Profile e Macrobenchmark, chave do EAS e primeiro APK.

## O que fica para o builder

- Esquema local de cada tabela nova do PowerSync (nomes em `snake_case`, como os que já existem).
- Organização de pacotes, nomes de classes e composables.
- Layout de cada tela no celular, seguindo o conteúdo e os estados da página do web.
- Mensagens das recusas novas (com tradução nos 6 idiomas).
- Quando algo do web não fizer sentido no celular, propor ao usuário em vez de decidir sozinho.

## Decisões do agente (para o usuário conferir)

- Pasta `kotlin/` no `TozzoBurger`.
- `minSdk 26`.
- COOK e DRIVER sem gaveta.
- Agrupamento Operação / Cadastro / Gestão e a ordem dos itens.
- Tela inicial = Vender para FOOD; primeiro módulo de Operação nos outros perfis.
- Sem SSE no app: o próprio sync traz as mudanças.
- ID de aparelho novo, sem ler o do RN (`tozzo_device_id_v1` no SecureStore do Expo). Na dev, o dono remove o aparelho antigo em Dispositivos se bater no limite do plano. **Pendência para o plano de migração da produção.**
- Ordem das etapas.
