# App Kotlin — Etapa 1 (Base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um app Android em Kotlin que faz login na `dev-api.tozzo.uk`, vincula o aparelho a um usuário, baixa os dados pelo PowerSync, abre offline e mostra a gaveta com os módulos do perfil — mais a correção do bug de suspensão na API.

**Architecture:** um módulo Gradle `app` em `TozzoBurger/kotlin/`, pacotes por responsabilidade (`core/network`, `core/session`, `core/sync`, `domain`, `ui`, `feature/*`). MVVM com `ViewModel` + `StateFlow`; Hilt para DI; o banco local é o do PowerSync e toda tela lê dele. A regra de módulos é portada do web com os mesmos testes.

**Tech Stack:** Kotlin 2.4.10, AGP 9.3.1, Gradle 9.7, Jetpack Compose (BOM) + Material 3, Navigation Compose, Hilt (KSP), Retrofit + OkHttp + kotlinx.serialization, PowerSync `com.powersync:core:1.15.1`, DataStore + Tink, JUnit 5, Turbine, MockWebServer, Robolectric + Compose UI Test, ktlint, detekt.

**Spec:** `TozzoBurger/docs/superpowers/specs/2026-10-20-app-kotlin-design.md` (ler antes de começar). Referência de código: o spike do PowerSync em `api-tozzo.uk/deploy/powersync/spike/android/app/src/main/java/uk/tozzo/spike/MainActivity.kt`.

## Global Constraints

- Código em `TozzoBurger/kotlin/`, branch `dev`. **Não tocar** em `TozzoBurger/android/` (projeto nativo do RN) nem no código RN.
- Commits locais por task; **sem push** sem pedido do usuário. `git add <arquivos>`, nunca `-A`. Os dois repos têm mudanças do usuário não commitadas (`TozzoBurger`: `docs/pendencias-alinhamento-api-web.md`, `CLAUDE.md`; `api-tozzo.uk`: `TODO.md`, `bench/*`, etc.): não incluir nem reverter.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dependências só MIT, BSD, ISC, Apache-2.0 ou MPL-2.0. Nada fora da Tech Stack acima sem perguntar ao usuário.
- `minSdk 26`, `compileSdk 37`, `targetSdk 36`, JVM target 17. Ambiente: `source /home/torugo/TozzoUk/dev-env.sh` antes de todo comando Gradle/adb.
- `applicationId = "com.torugotozzo.TozzoUk"`; build `debug` com `applicationIdSuffix = ".debug"` para conviver com o RN instalado. `namespace = "uk.tozzo.app"`.
- URL da API num `buildConfigField("String", "API_BASE_URL", …)`: `"https://dev-api.tozzo.uk"` em debug e release (por enquanto). Nunca fixa no código.
- Código em inglês, textos de interface só em `strings.xml`, nos 6 idiomas: `values/` (en, padrão), `values-pt-rBR/`, `values-es/`, `values-fr/`, `values-hi/`, `values-zh/`. Toda string nova entra nos 6 arquivos.
- Visual (tokens do web `front-tozzo.uk/src/index.css`): claro = fundo `#FFFFFF`, texto/primário `#000000`, `muted` `#F5F5F5`, `muted-foreground` `#454545`, borda `#000000` de 1 dp, raio 8 dp, destrutivo `hsl(0 84.2% 60.2%)`; escuro = fundo `#161616`, texto/primário `#FFFFFF`, `muted` `#2D2D2D`, `muted-foreground` `#BABABA`, borda `#FFFFFF`. Estados: sucesso `#10B981`, aviso `#F59E0B`, perigo `#EF4444`, info `#3B82F6`.
- Nenhum I/O (rede, banco, DataStore) na thread principal. Release com R8 (`isMinifyEnabled = true`, `isShrinkResources = true`).
- O app **não** abre o SSE `/v1/events`.

## Review Focus

- App morto no meio do primeiro sync → ao reabrir volta para a tela de primeiro sync, nunca para a gaveta com banco vazio (teste no Task 9).
- Rede volta depois de um tempo offline com token vencido → o app chama `connect()` de novo e o upload pendente sobe (o SDK não retenta sozinho; teste no Task 7).
- Login de **outro** usuário num aparelho já vinculado → recusado sem registrar o aparelho na API, e a sessão aberta no servidor é encerrada (teste no Task 6).
- Rede cai no meio de um upload → o lote não é completado e volta com o mesmo `opId`; uma op recusada é gravada em `sync_rejections` **antes** de completar o lote (testes no Task 7).
- "Desvincular este aparelho" com op pendente ou offline → botão desligado com o motivo; nada é apagado (teste no Task 9).

---

### Task 1: API — falha de pagamento volta para o FREE

Repo `api-tozzo.uk`, branch `dev`. Ler `api-tozzo.uk/AGENTS.md` e `TESTING.md` antes.

**Files:**
- Modify: `api-tozzo.uk/internal/billing/events.go` (case `eventInvoiceFailed`)
- Modify: `api-tozzo.uk/internal/billing/webhook_test.go` (`TestWebhookPaymentFailedSuspends`)
- Modify: `api-tozzo.uk/internal/db/queries/billing.sql` e `internal/db/sqlc/billing.sql.go` (remover `SuspendEstablishment` se ficar sem uso; regerar com `go tool sqlc generate`)
- Modify: `api-tozzo.uk/docs/superpowers/plans/migracao-go/fase-07-cobranca.md` (linhas 111 e 132: a falha de pagamento passa a ir para FREE + ACTIVE, decisão do usuário de 2026-10-20)

- [ ] **Step 1:** Renomear o teste para `TestWebhookPaymentFailedReturnsToFree` e trocar a expectativa:

```go
receive(t, a, fixture(t, "invoice_payment_failed", tm.Est.ID, "cus_1"))
expectState(t, a, tm.Est.ID, "FREE", "ACTIVE", at(a.Clock.Now()))   // usar o relógio de teste que o pacote já usa
expectState(t, a, other.Est.ID, "PAGO", "ACTIVE", nil)
```

E um caso extra no mesmo teste: estabelecimento `SUSPENDED` (dado antigo) que recebe `invoice_payment_failed` termina `FREE` + `ACTIVE`.

- [ ] **Step 2:** `TEST_DATABASE_URL='postgres://test:test@127.0.0.1:5435/postgres?sslmode=disable' go test ./internal/billing/ -run TestWebhookPaymentFailed -v` → FAIL (status `SUSPENDED`). Se o Postgres de teste não estiver de pé, seguir o `TESTING.md` do repo para subir.
- [ ] **Step 3:** No case `eventInvoiceFailed`, depois do `byCustomer` e do retorno para `DELETED`, chamar `q.EndSubscription(ctx, sqlc.EndSubscriptionParams{ID: est.ID, ExpiresAt: &now})` com `now := p.clock.Now()`. Se `SuspendEstablishment` ficar sem uso, apagar a query e regerar o sqlc.
- [ ] **Step 4:** `go test -race ./internal/billing/...` → PASS; `go vet ./... && go tool staticcheck ./...` → sem saída.
- [ ] **Step 5:** Atualizar `fase-07-cobranca.md` e commitar só os arquivos do task:

```bash
git add internal/billing/events.go internal/billing/webhook_test.go internal/db/queries/billing.sql internal/db/sqlc/billing.sql.go docs/superpowers/plans/migracao-go/fase-07-cobranca.md
git commit -m "fix(billing): failed payment returns the establishment to FREE"
```

---

### Task 2: Projeto Gradle, qualidade e CI

**Files:**
- Create: `kotlin/settings.gradle.kts`, `kotlin/build.gradle.kts`, `kotlin/gradle.properties`, `kotlin/gradle/libs.versions.toml`
- Create: `kotlin/gradle/wrapper/gradle-wrapper.properties` (Gradle 9.7, `distributionSha256Sum` preenchido), `kotlin/gradle/wrapper/gradle-wrapper.jar` (copiar de `TozzoBurger/android/gradle/wrapper/`; o jar é o mesmo entre versões), `kotlin/gradlew`, `kotlin/gradlew.bat`
- Create: `kotlin/app/build.gradle.kts`, `kotlin/app/proguard-rules.pro`, `kotlin/app/src/main/AndroidManifest.xml`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/TozzoApp.kt` (`@HiltAndroidApp`), `kotlin/app/src/main/java/uk/tozzo/app/MainActivity.kt` (`@AndroidEntryPoint`, `setContent { }` vazio por enquanto, `enableEdgeToEdge()`)
- Create: `kotlin/config/detekt.yml`, `kotlin/.editorconfig`, `kotlin/.gitignore` (`build/`, `.gradle/`, `local.properties`, `.idea/`, `*.iml`, `*.jks`, `*.keystore`)
- Create: `.github/workflows/android-kotlin.yml`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/BuildConfigTest.kt`

**Interfaces:**
- Produces: `BuildConfig.API_BASE_URL: String`; plugins e bibliotecas no catálogo `libs` usados por todos os tasks seguintes.

- [ ] **Step 1:** Escrever `BuildConfigTest.apiBaseUrlPointsToDev()`: `assertEquals("https://dev-api.tozzo.uk", BuildConfig.API_BASE_URL)`.
- [ ] **Step 2:** Montar o projeto (Global Constraints valem aqui: versões, SDKs, `applicationId`, sufixo debug, R8 no release). Permissões no manifest: `INTERNET`, `ACCESS_NETWORK_STATE`. Testes JUnit 5 (`useJUnitPlatform()`) com Robolectric via junit-vintage. ktlint (`org.jlleitschuh.gradle.ktlint`) e detekt aplicados no `app`.
- [ ] **Step 3:** `cd kotlin && ./gradlew :app:testDebugUnitTest ktlintCheck detekt :app:lintDebug :app:assembleDebug` → BUILD SUCCESSFUL, teste passando. Se o AGP pedir JDK mais novo que o 17 do `dev-env.sh`, **parar e avisar o usuário** antes de instalar.
- [ ] **Step 4:** Workflow `android-kotlin.yml`: dispara em `push`/`pull_request` na `dev` com `paths: ['kotlin/**', '.github/workflows/android-kotlin.yml']`; `ubuntu-latest`, JDK 17 (`actions/setup-java`, temurin), cache do Gradle, `working-directory: kotlin`, roda o mesmo comando do Step 3.
- [ ] **Step 5:** Commit (`feat(kotlin): scaffold Android app project`).

---

### Task 3: Tema e componentes de base

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/ui/theme/{Color.kt,Theme.kt,Type.kt}`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/ui/components/{TozzoButton.kt,TozzoTextField.kt,TozzoCard.kt,ConfirmDialog.kt,EmptyState.kt,LoadingState.kt}`
- Create: `kotlin/app/src/debug/java/uk/tozzo/app/ui/catalog/UiCatalogScreen.kt` (só no debug)
- Test: `kotlin/app/src/test/java/uk/tozzo/app/ui/UiCatalogTest.kt` (Robolectric + Compose UI Test)

**Interfaces:**
- Produces: `@Composable fun TozzoTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit)`; `object TozzoColors { val success; val warning; val danger; val info }`; `enum class ButtonVariant { Primary, Outline, Destructive, Ghost }`; `@Composable fun TozzoButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, variant: ButtonVariant = ButtonVariant.Primary, enabled: Boolean = true, loading: Boolean = false)`; `@Composable fun TozzoTextField(value: String, onValueChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, error: String? = null, keyboardOptions: KeyboardOptions = KeyboardOptions.Default, visualTransformation: VisualTransformation = VisualTransformation.None)`; `@Composable fun TozzoCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit)`; `@Composable fun ConfirmDialog(title: String, message: String, confirmText: String, onConfirm: () -> Unit, onDismiss: () -> Unit, destructive: Boolean = false)`; `@Composable fun EmptyState(title: String, message: String? = null, action: (@Composable () -> Unit)? = null)`; `@Composable fun LoadingState(message: String? = null)`.

- [ ] **Step 1:** `UiCatalogTest`: renderiza `UiCatalogScreen()` em claro e escuro e confere com `onNodeWithText` que aparecem um botão de cada variante, um campo com erro, um card, um `EmptyState`; `TozzoButton(loading = true)` não dispara `onClick`.
- [ ] **Step 2:** Rodar → FAIL (não compila).
- [ ] **Step 3:** Implementar com os tokens dos Global Constraints: `MaterialTheme` com `ColorScheme` próprio (sem cores dinâmicas do Android 12), contorno de 1 dp na cor da borda em card e campo, raio 8 dp. Fonte do sistema.
- [ ] **Step 4:** `./gradlew :app:testDebugUnitTest --tests '*UiCatalogTest*'` → PASS.
- [ ] **Step 5:** Commit (`feat(kotlin): add theme and base components`).

---

### Task 4: Regra de módulos e textos da navegação

Port de `front-tozzo.uk/src/domain/businessPreferences.ts` com os mesmos testes de `businessPreferences.test.ts`.

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/domain/Modules.kt`
- Create: `kotlin/app/src/main/res/values{,-pt-rBR,-es,-fr,-hi,-zh}/strings.xml`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/domain/ModulesTest.kt`, `kotlin/app/src/test/java/uk/tozzo/app/StringsParityTest.kt`

**Interfaces:**
- Produces:
  - `enum class Role { OWNER, MANAGER, EMPLOYEE, COOK, DRIVER, CUSTOMER; companion object { fun parse(raw: String?): Role? } }`
  - `enum class BusinessProfile { FOOD, STORE, SERVICES }`
  - `enum class BusinessModule { ORDERS, KITCHEN, DELIVERIES, INGREDIENT_INVENTORY, SALES, PRODUCTS, STORE_INVENTORY, SERVICES, ESTIMATES, SERVICE_ORDERS, EMPLOYEES, SCHEDULE, DEVICES, REPORTS, SETTINGS }`
  - `data class EstablishmentModules(val category: String?, val businessProfiles: List<BusinessProfile>?, val visibleModules: List<BusinessModule>?)`
  - `fun canAccessModule(role: Role?, module: BusinessModule): Boolean`
  - `fun resolveNavigationModules(role: Role?, establishment: EstablishmentModules?): List<BusinessModule>`
  - `fun suggestedBusinessModules(profiles: List<BusinessProfile>): List<BusinessModule>`
  - `enum class AppDestination { SELL, ORDERS, KITCHEN, DELIVERIES, SALES, SERVICE_ORDERS, ESTIMATES, PRODUCTS, SERVICES, SCHEDULE, REPORTS, EMPLOYEES, DEVICES, SETTINGS }`
  - `enum class NavGroup { OPERATION, CATALOG, MANAGEMENT, FOOTER }`
  - `data class NavItem(val destination: AppDestination, val group: NavGroup, @StringRes val label: Int)`
  - `fun navigationItems(modules: List<BusinessModule>): List<NavItem>` — `SALES` gera dois itens: `SELL` (Operação, primeiro) e `SALES`; ordem e grupos da tabela "Agrupamento" do spec; `SETTINGS` no `FOOTER`.
  - `fun startDestination(modules: List<BusinessModule>): AppDestination?` — `SELL` se houver `SALES` e o perfil tiver FOOD ou for legado; senão o primeiro item de `OPERATION`; senão o primeiro item; `null` se a lista estiver vazia.
  - `fun needsWebSetup(role: Role?, establishment: EstablishmentModules?): Boolean` — porte de `needsOnboarding` de `front-tozzo.uk/src/layouts/DashboardLayout.tsx` (só OWNER; sem perfis e sem categoria, ou lista de perfis vazia).

- [ ] **Step 1:** `ModulesTest`: portar **cada** `it(...)` de `businessPreferences.test.ts` com as mesmas listas esperadas (a categoria legada `"HAMBURGUERIA"` vira `category = "HAMBURGUERIA"`, perfis `null`). Mais: `navigationItems` de um FOOD completo começa com `SELL, ORDERS, KITCHEN, DELIVERIES, SALES` no grupo `OPERATION` e termina com `SETTINGS` no `FOOTER`; `startDestination` = `SELL` para FOOD e `SERVICE_ORDERS` para `SERVICES` puro; `needsWebSetup(OWNER, EstablishmentModules(null, emptyList(), null))` = true e `needsWebSetup(MANAGER, …)` = false; `Role.parse("x")` = null.
- [ ] **Step 2:** `StringsParityTest`: lê os 6 `strings.xml` de `src/main/res` e falha se algum não tiver exatamente o mesmo conjunto de chaves que `values/strings.xml`. Vale para todo o projeto daqui em diante.
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4:** Implementar. Rótulos dos módulos copiados das chaves `navigation.*` dos locales do web (`front-tozzo.uk/src/i18n/locales/{en,pt-BR,es,fr,hi,zh}.json`): `nav_orders`←`orders`, `nav_kitchen`←`kitchen`, `nav_deliveries`←`deliveries`, `nav_sales`←`sales`, `nav_products`←`products`, `nav_services`←`serviceCatalog`, `nav_estimates`←`estimates`, `nav_service_orders`←`services`, `nav_employees`←`employees`, `nav_schedule`←`schedule`, `nav_devices`←`devices`, `nav_reports`←`reports`, `nav_settings`←`settings`, `action_logout`←`logout`. Novas: `nav_sell` (Vender / Sell / Vender / Vendre / बेचें / 收银), `nav_group_operation` (Operação / Operation / Operación / Opérations / संचालन / 运营), `nav_group_catalog` (Cadastro / Catalog / Catálogo / Catalogue / सूची / 目录), `nav_group_management` (Gestão / Management / Gestión / Gestion / प्रबंधन / 管理), `app_name` = "Tozzo".
- [ ] **Step 5:** `./gradlew :app:testDebugUnitTest --tests '*ModulesTest*' --tests '*StringsParityTest*'` → PASS.
- [ ] **Step 6:** Commit (`feat(kotlin): port module visibility rules and navigation strings`).

---

### Task 5: Cliente HTTP, tokens e refresh

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/core/network/{ApiModels.kt,AuthApi.kt,DeviceApi.kt,SyncApi.kt,ApiProblem.kt,NetworkModule.kt,AuthInterceptor.kt,TokenAuthenticator.kt}`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/core/session/{SecureStore.kt,TokenStore.kt}`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/core/network/TokenAuthenticatorTest.kt`, `.../core/network/ApiProblemTest.kt`

**Interfaces:**
- Produces (modelos `@Serializable`, nomes de campos iguais ao `/v1`; contrato em `api-tozzo.uk/api/openapi.yaml`):
  - `data class LoginRequest(val email: String, val password: String, val client: String = "android", val deviceName: String?)`
  - `data class RefreshRequest(val refreshToken: String)`; `data class LogoutRequest(val allSessions: Boolean = false)`
  - `data class SessionBody(val accessToken: String, val accessTokenExpiresAt: String, val refreshToken: String? = null, val user: Me)`
  - `data class Me(val id: String, val name: String, val email: String, val role: String, val locale: String?, val establishment: MeEstablishment)`
  - `data class MeEstablishment(val id: String, val tradeName: String, val status: String, val plan: String, val category: String?, val businessProfiles: List<String>?, val visibleModules: List<String>?, val preferencesRevision: Int)`
  - `data class RegisterDeviceRequest(val id: String, val info: DeviceInfo)`; `data class DeviceInfo(val model: String, val androidVersion: Int, val appVersion: String)`
  - `data class SyncTokenBody(val token: String, val endpoint: String, val expiresAt: String)`
  - `data class UploadRequest(val deviceId: String, val ops: List<JsonObject>)`; `data class UploadResult(val opId: String, val status: String, val code: String? = null, val detail: String? = null)`; `data class UploadResponse(val results: List<UploadResult>)`
  - `interface AuthApi { @POST("/v1/auth/login") suspend fun login(@Body body: LoginRequest): SessionBody; @POST("/v1/auth/refresh") suspend fun refresh(@Body body: RefreshRequest): SessionBody; @POST("/v1/auth/logout") suspend fun logout(@Body body: LogoutRequest); @GET("/v1/me") suspend fun me(): Me }`
  - `interface DeviceApi { @POST("/v1/devices") suspend fun register(@Body body: RegisterDeviceRequest) }`
  - `interface SyncApi { @POST("/v1/sync/token") suspend fun token(): SyncTokenBody; @POST("/v1/sync/upload") suspend fun upload(@Body body: UploadRequest): UploadResponse }`
  - `data class ApiProblem(val status: Int, val code: String, val title: String, val detail: String?) `; `class ApiException(val problem: ApiProblem) : IOException()`; `fun Throwable.toApiProblem(): ApiProblem?` (lê `HttpException` com corpo `application/problem+json`)
  - `interface SecureStore { suspend fun get(key: String): String?; suspend fun put(key: String, value: String?); suspend fun clear() }` — impl `TinkSecureStore` (DataStore Preferences, valores cifrados com AEAD do Tink, chave no Android Keystore)
  - `class TokenStore(secure: SecureStore) { @Volatile var accessToken: String?; suspend fun refreshToken(): String?; suspend fun save(session: SessionBody); suspend fun clear() }` — access token só em memória; refresh no `SecureStore`
  - `sealed interface SessionEvent { data object Revoked : SessionEvent; data object EstablishmentDeleted : SessionEvent; data object PaymentRequired : SessionEvent }`; `class SessionEvents { val events: SharedFlow<SessionEvent>; fun emit(e: SessionEvent) }`
  - `class TokenAuthenticator(tokenStore: TokenStore, authApiProvider: Provider<AuthApi>, events: SessionEvents) : okhttp3.Authenticator`

- [ ] **Step 1:** `TokenAuthenticatorTest` com MockWebServer:
  - `concurrentUnauthorizedRefreshesOnce`: 5 requisições em paralelo recebem `401` `{"code":"INVALID_TOKEN"}`; o servidor conta **1** `POST /v1/auth/refresh`; as 5 repetem com o access novo e recebem 200.
  - `refreshTokenSavedBeforeRetry`: o `SecureStore` falso registra a ordem; o refresh novo é gravado antes da requisição repetida chegar ao servidor.
  - `revokedSessionEmitsEventAndStops`: refresh responde `401` `{"code":"SESSION_REVOKED"}` → `SessionEvent.Revoked` emitido (Turbine), nenhuma repetição, refresh token apagado.
  - `nonTokenUnauthorizedIsNotRefreshed`: `401` com `INVALID_CREDENTIALS` (login) não dispara refresh.
- [ ] **Step 2:** `ApiProblemTest`: corpo `{"title":"…","status":402,"code":"PAYMENT_REQUIRED"}` vira `ApiProblem(402, "PAYMENT_REQUIRED", …)`; corpo vazio → `null`.
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4:** Implementar. O `Authenticator` usa um `Mutex` (`runBlocking` dentro do `authenticate` é aceitável aqui: roda numa thread do OkHttp): se o access atual já é diferente do que falhou, só repete; senão faz o refresh. Desiste depois de 1 tentativa por requisição (`response.priorResponse != null`). `AuthInterceptor` coloca `Authorization: Bearer` em tudo menos `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/google`. Timeouts: conexão 15 s, leitura 30 s.
- [ ] **Step 5:** Rodar os dois testes → PASS.
- [ ] **Step 6:** Commit (`feat(kotlin): add API client with single-flight token refresh`).

---

### Task 6: Login e vínculo do aparelho

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/core/session/{DeviceIdentity.kt,DeviceBinding.kt,SessionRepository.kt}`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/core/session/SessionRepositoryTest.kt`

**Interfaces:**
- Consumes: `AuthApi`, `DeviceApi`, `TokenStore`, `SecureStore`, `Role`, `EstablishmentModules`, `needsWebSetup` (Tasks 4–5).
- Produces:
  - `class DeviceIdentity(secure: SecureStore) { suspend fun id(): String }` — UUID v4 gerado uma vez e guardado (chave `device_id`)
  - `data class Binding(val userId: String, val establishmentId: String, val role: Role, val userName: String, val establishmentName: String, val modules: EstablishmentModules, val plan: String)` — `@Serializable`, guardado como JSON no `SecureStore` (chave `binding`)
  - `class DeviceBinding(secure: SecureStore) { val current: StateFlow<Binding?>; suspend fun load(); suspend fun save(b: Binding); suspend fun clear() }`
  - `sealed interface LoginResult { data class Success(val binding: Binding); data object InvalidCredentials; data object EmailNotVerified; data object OtherUserBound; data object NoAccess; data object RoleNotYetSupported; data object NeedsWebSetup; data class DeviceLimitReached(val limit: Int?); data object EstablishmentDeleted; data object Offline; data class Failed(val problem: ApiProblem?) }`
  - `class SessionRepository(...) { suspend fun login(email: String, password: String): LoginResult; suspend fun refreshBindingFromServer(): Result<Binding> ; suspend fun signOutKeepingData() }`

Regras do `login` (nesta ordem):
1. `AuthApi.login` (`deviceName = Build.MODEL`). `INVALID_CREDENTIALS` → `InvalidCredentials`; `EMAIL_NOT_VERIFIED` → `EmailNotVerified`; `IOException` sem resposta → `Offline`.
2. Se existe `Binding` e `binding.userId != session.user.id` → `AuthApi.logout(LogoutRequest())` com o access novo, não salva nada, → `OtherUserBound`.
3. `role == CUSTOMER` → logout, `NoAccess`. `role in (COOK, DRIVER)` → logout, `RoleNotYetSupported` (a API ainda não deixa esses papéis sincronizarem; a etapa 2 troca isso).
4. `establishment.status == "DELETED"` → `EstablishmentDeleted`. `needsWebSetup(...)` → logout, `NeedsWebSetup`.
5. `TokenStore.save(session)`; `DeviceApi.register(id, info)`. `DEVICE_LIMIT_REACHED` → `TokenStore.clear()`, logout, `DeviceLimitReached(limit)` (o `limit` vem no corpo do problema).
6. Salvar `Binding` → `Success`.

- [ ] **Step 1:** `SessionRepositoryTest` (MockWebServer + `SecureStore` em memória), um teste por linha da regra acima, incluindo:
  - `otherUserOnBoundDeviceIsRejected`: binding do usuário A, login do B → `OtherUserBound`; o servidor recebeu `POST /v1/auth/logout` e **nenhum** `POST /v1/devices`; binding continua o de A.
  - `sameUserAfterRevokeKeepsBinding`: binding de A, login de A → `Success`, binding igual.
  - `deviceIdIsStable`: duas chamadas a `DeviceIdentity.id()` devolvem o mesmo valor, e o corpo do `POST /v1/devices` usa esse id.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit (`feat(kotlin): add login and one-user device binding`).

---

### Task 7: PowerSync, upload e recusas

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/core/sync/{LocalSchema.kt,TozzoDatabase.kt,UploadMapper.kt,TozzoConnector.kt,SyncController.kt,ConnectivityWatcher.kt,SyncModule.kt}`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/core/sync/{UploadMapperTest.kt,UploadProcessorTest.kt,SyncControllerTest.kt}`

**Interfaces:**
- Consumes: `SyncApi`, `DeviceIdentity`, `SessionEvents` (Tasks 5–6).
- Produces:
  - `val localSchema: Schema` — as tabelas do spike (`product_types`, `products`, `orders`, `order_items`, `sales` com `items_json`, `sale_items`, `print_logs`, `users`) + `sync_rejections` **local-only** (`Table.localOnly`) com colunas `op_id`, `table_name`, `row_id`, `op`, `code`, `detail`, `created_at`.
  - `data class PendingOp(val clientId: Int, val op: String, val table: String, val id: String, val data: Map<String, Any?>?)` (abstração do `CrudEntry`, para testar sem o SDK)
  - `object UploadMapper { fun opId(deviceId: String, clientId: Int): String; fun toJson(op: PendingOp, deviceId: String): JsonObject? }` — `null` para `sale_items`; `is_*` 0/1 → boolean; `items_json` sai do `data` e entra como `items` no `sales` PUT; `opId` = `UUID.nameUUIDFromBytes("$deviceId:$clientId")`
  - `interface RejectionSink { suspend fun record(op: PendingOp, opId: String, result: UploadResult) }`
  - `class UploadProcessor(api: SyncApi, sink: RejectionSink, deviceId: suspend () -> String) { suspend fun process(ops: List<PendingOp>) }` — chamado pelo `uploadData` do connector com lotes de 200; lança exceção se o HTTP falhar (o connector então **não** chama `complete`)
  - `enum class SyncState { OFFLINE, SYNCING, SYNCED, FIRST_SYNC_PENDING }`
  - `class SyncController { val state: StateFlow<SyncState>; val rejectionCount: Flow<Int>; val pendingOpCount: Flow<Int>; val hasSynced: Flow<Boolean>; suspend fun start(); suspend fun stop(); suspend fun clearLocalData() }`
  - `class ConnectivityWatcher(context) { val online: StateFlow<Boolean> }`

- [ ] **Step 1:** `UploadMapperTest`: `is_cancelled = 0L` vira `false`; `sales` PUT leva `items` (array) e não leva `items_json`; `sale_items` → `null`; `opId` igual para o mesmo par e diferente para outro `clientId`.
- [ ] **Step 2:** `UploadProcessorTest` (MockWebServer + sink falso):
  - `rejectedOpIsRecordedBeforeReturn`: resposta com um `rejected` (`code`, `detail`) → `sink.record` chamado com esse `opId` antes de `process` retornar.
  - `httpFailureThrowsAndRecordsNothing`: servidor fecha a conexão → `process` lança, sink vazio.
  - `retryUsesSameOpIds`: duas chamadas com as mesmas ops mandam os mesmos `opId`.
- [ ] **Step 3:** `SyncControllerTest`: com um `ConnectivityWatcher` falso, a transição `online false → true` chama `connect()` (fake do banco) uma vez; offline o estado é `OFFLINE`.
- [ ] **Step 4:** Rodar → FAIL. **Step 5:** Implementar. `fetchCredentials` usa `SyncApi.token()`; um `ApiException` 410 emite `SessionEvent.EstablishmentDeleted` e um 402 emite `SessionEvent.PaymentRequired`. O banco abre num `Dispatchers.IO`, nome `tozzo.db`. `clearLocalData()` = `disconnectAndClear()`. **Step 6:** Rodar → PASS.
- [ ] **Step 7:** Commit (`feat(kotlin): add PowerSync database, upload and rejections`).

---

### Task 8: Telas de entrada — login, primeiro sync e avisos

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/feature/login/{LoginScreen.kt,LoginViewModel.kt}`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/feature/firstsync/{FirstSyncScreen.kt,FirstSyncViewModel.kt}`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/feature/notice/NoticeScreen.kt` (mensagem + botão: "termine a configuração no site", "sem acesso", "papel ainda não disponível", "estabelecimento excluído")
- Modify: os 6 `strings.xml`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/feature/login/LoginViewModelTest.kt`, `kotlin/app/src/test/java/uk/tozzo/app/feature/login/LoginScreenTest.kt`

**Interfaces:**
- Consumes: `SessionRepository.login`, `LoginResult`, `SyncController` (Tasks 6–7).
- Produces: `data class LoginUiState(val email: String = "", val password: String = "", val loading: Boolean = false, val error: Int? /* @StringRes */ = null, val notice: Notice? = null)`; `enum class Notice { NEEDS_WEB_SETUP, NO_ACCESS, ROLE_NOT_YET_SUPPORTED, ESTABLISHMENT_DELETED }`; `class LoginViewModel { val state: StateFlow<LoginUiState>; fun onEmail(v: String); fun onPassword(v: String); fun submit() }`; evento de saída `LoginViewModel.loggedIn: Flow<Unit>`.

- [ ] **Step 1:** `LoginViewModelTest` (Turbine, repositório falso): `submit` liga `loading` e desliga; cada `LoginResult` vira o erro ou `notice` certo (`InvalidCredentials` → `R.string.login_error_credentials`, `OtherUserBound` → `R.string.login_error_other_user`, `DeviceLimitReached` → `R.string.login_error_device_limit`, `Offline` → `R.string.login_error_offline`, `NeedsWebSetup` → `Notice.NEEDS_WEB_SETUP`…); `Success` emite `loggedIn`; email vazio não chama o repositório.
- [ ] **Step 2:** `LoginScreenTest` (Robolectric): digitar email e senha e tocar em entrar chama `submit`; o link "criar conta" abre `Intent.ACTION_VIEW` para `https://dev.tozzo.uk/register` e "esqueci a senha" para `https://dev.tozzo.uk/forgot-password` (`buildConfigField` `WEB_BASE_URL`; antes de fixar o valor, conferir qual domínio serve o web Solid da dev hoje — `https://dev.tozzo.uk` ou `https://app-dev.tozzo.uk` — abrindo os dois).
- [ ] **Step 3:** Rodar → FAIL. **Step 4:** Implementar. Tela de login: marca Tozzo, campos, botão, os dois links. **Sem** botão do Google nesta etapa (precisa do client Android no Console; fica para a etapa 6). `FirstSyncScreen`: `LoadingState` com o texto do progresso e, se offline, a mensagem "conecte-se à internet para baixar os dados" sem sair da tela. **Step 5:** Rodar → PASS.
- [ ] **Step 6:** Commit (`feat(kotlin): add login, first sync and notice screens`).

---

### Task 9: Shell — roteamento, gaveta, selo de sync, configurações e recusas

**Files:**
- Create: `kotlin/app/src/main/java/uk/tozzo/app/feature/shell/{AppRouter.kt,RootViewModel.kt,ShellScreen.kt,AppDrawer.kt,SyncBadge.kt,ModulePlaceholderScreen.kt}`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/feature/settings/{SettingsScreen.kt,SettingsViewModel.kt}`
- Create: `kotlin/app/src/main/java/uk/tozzo/app/feature/rejections/{RejectionsScreen.kt,RejectionsViewModel.kt}`
- Modify: `MainActivity.kt` (monta `TozzoTheme { AppRouter() }`), os 6 `strings.xml`
- Test: `kotlin/app/src/test/java/uk/tozzo/app/feature/shell/RootViewModelTest.kt`, `.../feature/settings/SettingsViewModelTest.kt`, `.../feature/shell/ShellScreenTest.kt`

**Interfaces:**
- Consumes: `DeviceBinding`, `SyncController`, `SessionEvents`, `navigationItems`, `startDestination` (Tasks 4–7).
- Produces: `sealed interface RootState { data object Loading; data object Login; data object FirstSync; data class Ready(val binding: Binding, val start: AppDestination); data class Blocked(val notice: Notice) }`; `class RootViewModel { val state: StateFlow<RootState> }`; `data class SettingsUiState(val canUnbind: Boolean, val unbindBlockedReason: Int? /* @StringRes */, val userName: String, val establishmentName: String)`; `class SettingsViewModel { fun unbind() }`.

Regras do `RootViewModel`:
- sem `Binding` → `Login`;
- com `Binding` e `hasSynced == false` → `FirstSync` (mesmo depois de matar o app no meio);
- com `Binding` e `hasSynced == true` → `Ready` **sem esperar rede**;
- `SessionEvent.Revoked` → `Login` mantendo o banco e o binding (só o mesmo usuário entra);
- `SessionEvent.EstablishmentDeleted` → `SyncController.clearLocalData()`, `DeviceBinding.clear()`, `Blocked(ESTABLISHMENT_DELETED)`;
- `SessionEvent.PaymentRequired` → continua `Ready`, com um aviso fixo no topo (somente leitura vale a partir da etapa 2, quando houver telas que escrevem).

- [ ] **Step 1:** `RootViewModelTest`: um teste por regra acima; em especial `killedDuringFirstSyncReturnsToFirstSync` (binding salvo, `hasSynced` falso → `FirstSync`) e `readyWithoutNetwork` (offline, binding e `hasSynced` verdadeiro → `Ready`).
- [ ] **Step 2:** `SettingsViewModelTest`: `pendingOpCount > 0` → `canUnbind = false` com `R.string.unbind_blocked_pending`; offline → `false` com `R.string.unbind_blocked_offline`; online e sem pendência → `unbind()` chama `clearLocalData()`, `DeviceBinding.clear()`, `TokenStore.clear()`, `AuthApi.logout` (falha de rede no logout não impede).
- [ ] **Step 3:** `ShellScreenTest` (Robolectric): com módulos de um FOOD completo, abrir a gaveta mostra os títulos dos grupos e `Vender` primeiro; tocar em `Pedidos` fecha a gaveta e mostra o título `Pedidos`; o selo mostra o texto do estado (`Sincronizado`, `Offline`, `N recusas`); tocar no selo com recusas abre `RejectionsScreen`.
- [ ] **Step 4:** Rodar → FAIL. **Step 5:** Implementar. Gaveta = `ModalNavigationDrawer` (gesto de borda ligado), cabeçalho com "Tozzo", nome do estabelecimento e papel; itens de `navigationItems`; `SETTINGS` no rodapé. Cada módulo ainda não feito abre `ModulePlaceholderScreen` ("disponível em breve"). `Settings`: nome, estabelecimento, versão do app e "Desvincular este aparelho" com `ConfirmDialog` destrutivo. `Rejections`: lista de `sync_rejections` (tabela, código, `detail`, data), mais recente primeiro, via `db.watch`. Navigation Compose com uma rota por `AppDestination`. **Step 6:** Rodar → PASS.
- [ ] **Step 7:** `./gradlew :app:testDebugUnitTest ktlintCheck detekt :app:lintDebug` → tudo verde.
- [ ] **Step 8:** Commit (`feat(kotlin): add app shell with drawer, sync badge and settings`).

---

### Task 10: Validação no emulador contra a dev

Sem código novo, salvo correções do que falhar aqui (cada correção com teste, no task dono do código).

- [ ] **Step 1:** Pedir ao usuário um login de teste da dev (dono de um estabelecimento FOOD com produtos). **Não** gravar a senha em arquivo nem em log.
- [ ] **Step 2:** `source /home/torugo/TozzoUk/dev-env.sh && emulator -avd Pixel_7_Pro -no-snapshot-save &` ; `adb wait-for-device`; `cd kotlin && ./gradlew :app:installDebug`.
- [ ] **Step 3:** Roteiro, conferindo cada item com screenshot (`adb exec-out screencap -p`):
  1. primeira abertura cai no login;
  2. login → tela de primeiro sync → gaveta com os módulos do perfil, `Vender` como início, selo `Sincronizado`;
  3. contar as linhas locais (`adb shell run-as com.torugotozzo.TozzoUk.debug sqlite3 …` ou log de debug) e comparar com `GET /v1/products` da mesma conta;
  4. `adb shell svc wifi disable && adb shell svc data disable`, matar e reabrir o app → abre direto na gaveta, selo `Offline`;
  5. religar a rede → selo volta a `Sincronizado`;
  6. Configurações → "Desvincular" → volta ao login; um login com **outro** usuário funciona depois disso;
  7. sem desvincular, tentar login com outro usuário → mensagem de aparelho vinculado.
- [ ] **Step 4:** Medir e anotar: abertura a frio já logado (`adb shell am start -W -n com.torugotozzo.TozzoUk.debug/uk.tozzo.app.MainActivity`, campo `TotalTime`, 5 vezes, mediana; build debug, sem Baseline Profile — só referência) e RSS (`adb shell dumpsys meminfo com.torugotozzo.TozzoUk.debug`, `TOTAL PSS`). Tamanho do APK release (`./gradlew :app:assembleRelease` com a chave de debug só para medir).
- [ ] **Step 5:** Registrar o resultado no fim do spec, numa seção "Registro de execução — etapa 1" (data, o que passou, números, pendências), e commitar (`docs: record Kotlin app stage 1`).

---

## Fora desta etapa (para o usuário saber)

- **Login com Google:** precisa do client Android no Google Cloud Console (pacote + SHA-1 da chave). Vai para a etapa 6, junto com a chave do EAS. O spec previa no primeiro acesso; nesta etapa só email e senha.
- **COOK e DRIVER:** nesta etapa recebem a mensagem "papel ainda não disponível no app". A etapa 2 libera o sync por papel na API e troca isso.
- Somente leitura com `402` só tem efeito quando houver telas que escrevem (etapa 2).
