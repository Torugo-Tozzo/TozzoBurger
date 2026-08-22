## TozzoBurger mobile audit context

**Scope:** `C:/RN/TozzoBurger` as of 2026-08-22. This dossier is Phase 1 context building only: structure, assumptions, dependencies, and open questions for later audit work.

**Repository shape:**
- Router/UI entrypoints live under `app/`, with the root composition in `app/_layout.tsx` (startup, DB provider, auth provider, auto-sync provider, cart provider, route gating at `L33-L106`).
- Durable business state is local SQLite, created and migrated by `initializeDatabase()` in `database/initializeDatabase.ts` (`L3-L187`).
- Authentication state spans SecureStore plus `TB_USUARIO` / `TB_SCHEMA`, coordinated in `context/AuthContext.tsx` (`L27-L226`).
- Background synchronization is split between the scheduler in `context/AutoSyncContext.tsx` (`L22-L148`), the in-memory lock in `database/syncGuard.ts` (`L14-L58`), and the push/pull engine in `database/useSyncDatabase.ts` (`L15-L468`).
- User-driven local writes are concentrated in `database/useProductDatabase.ts`, `database/usePedidoDatabase.ts`, and `database/useVendaDatabse.ts`.
- UI refresh after local writes or pulled changes is edge-triggered by `markChanged()` / `getChangedAt()` in `database/tableWatermark.ts` (`L1-L18`) and consumed by hooks like `useShouldReload()` and `useProductList()` (`hooks/useShouldReload.ts L4-L25`, `hooks/useProductList.ts L20-L142`).
- Printer integration is a separate boundary through `useBLE.ts` (`L1-L137`) and printer metadata in `TB_IMPRESSORAS` via `database/usePrinterDatabase.ts` (`L4-L67`).

**External entrypoints and actors:**
- App startup reaches `RootLayout` on every launch, which mounts `SQLiteProvider` with `initializeDatabase` and blocks route rendering until fonts and auth state are ready (`app/_layout.tsx L33-L64`).
- Login requests enter through `LoginScreen.handleLogin()` and then `AuthContext.login()` (`app/login.tsx L17-L37`, `context/AuthContext.tsx L106-L213`).
- Cart checkout enters through `ContaModal.finalizarCompra()` and `ContaModal.gerarPedido()` (`app/modais/contaModal.tsx L72-L121`).
- Order editing / order-to-sale conversion enters through `PedidoModal.handleSave()` and `PedidoModal.handleGerarVenda()` (`app/modais/pedidoModal.tsx L86-L128`).
- Background sync also enters through OS app-state resume, connectivity regain, and explicit pull-to-refresh or sync-button actions (`context/AutoSyncContext.tsx L104-L136`, `hooks/useSyncRefresh.ts L9-L30`, `components/SyncIndicator.tsx L43-L87`).
- Printer output enters through `HistoricoScreen.handlePrint()` and `ContaHistoricoModal.handlePrint()`, both of which call `sendMessageToDevice()` (`app/(tabs)/historico.tsx L133-L150`, `app/modais/contaHistoricoModal.tsx L128-L144`, `useBLE.ts L85-L135`).

**Actors and trust:**
- Authenticated operator (`GARÇOM` / `CAIXA` style user in the mobile app): `semi-trusted`. The app uses their local selections and text input directly to create products, orders, and sales (`app/modais/contaModal.tsx L72-L121`, `app/modais/pedidoModal.tsx L86-L128`).
- Authenticated `CLIENTE`: `semi-trusted`. The app gates some UI affordances by `user.role`, but local role checks are only UI choices inside this repo (`app/(tabs)/pedidos.tsx L48-L49`, `app/modais/contaModal.tsx L97-L105`, `app/modais/pedidoModal.tsx L33-L40`).
- Remote API: `semi-trusted`. The mobile app treats `/usuarios/me`, `/sincronizacao/push`, `/sincronizacao/pull`, and `/vendas` as the source for server identity and pulled state, but their implementation is outside this repo (`services/api.ts L22-L142`).
- Local SQLite database: `trusted` as the app’s durable state container, but it is only as correct as the write paths that populate it (`database/initializeDatabase.ts L24-L182`).
- Bluetooth printer and BLE stack: `unclear`. The app assumes a writable characteristic exists and that chunked base64 writes produce a valid print job (`useBLE.ts L99-L130`).
- OS lifecycle/network signals: `unclear`. `AppState` and `NetInfo` events are trusted to trigger sync opportunities (`context/AutoSyncContext.tsx L104-L136`).

**Durable and shared state:**
- `TB_SCHEMA` stores schema version, current establishment/user IDs, auto-sync toggle placeholder, and `lastSyncAt` (`database/initializeDatabase.ts L132-L182`).
- `TB_USUARIO` stores the last known local user profile (`database/initializeDatabase.ts L112-L121`; rewritten in `context/AuthContext.tsx L139-L186`).
- `TB_PRODUTOS` / `TB_TP_PRODUTO` store products and product types, including `origemProdutoId`, `updated_at`, `deleted_at`, and `sync_status` (`database/initializeDatabase.ts L24-L48`).
- `TB_PEDIDOS` / `RL_PEDIDO_PRODUTO` store local orders and order lines, with `status`, `updated_at`, `deleted_at`, `sync_status`, and creator metadata (`database/initializeDatabase.ts L66-L91`).
- `TB_VENDAS` / `RL_VENDA_PRODUTO` store local sales and sale lines, with soft-delete markers and creator metadata (`database/initializeDatabase.ts L50-L64`, `L93-L102`).
- `TB_IMPRESSORAS` stores a single registered printer under `id = 1` (`database/initializeDatabase.ts L104-L110`, `database/usePrinterDatabase.ts L8-L64`).
- In-memory shared state includes cart contents (`context/CartContext.tsx L24-L97`), table watermarks (`database/tableWatermark.ts L3-L18`), sync lock promises (`database/syncGuard.ts L1-L58`), and auto-sync status/result (`context/AutoSyncContext.tsx L25-L31`).

**Analyzed functions:**
- `initializeDatabase` in `database/initializeDatabase.ts`
- `seedTipoProduto` in `database/initializeDatabase.ts`
- `load` in `context/AuthContext.tsx`
- `login` in `context/AuthContext.tsx`
- `doSync` in `context/AutoSyncContext.tsx`
- `runWithLock` in `database/syncGuard.ts`
- `sincronizarComServidor` in `database/useSyncDatabase.ts`
- `createPedido` in `database/usePedidoDatabase.ts`
- `updatePedido` in `database/usePedidoDatabase.ts`
- `createVenda` in `database/useVendaDatabse.ts`
- `create` in `database/useProductDatabase.ts`
- `sendMessageToDevice` in `useBLE.ts`

**Cross-function invariants:**
- Local business writes that are meant to reach the server mark their row as pending and stamp `updated_at` at write time. `createPedido()` inserts `sync_status = 'pending'` and `updated_at = Date.now()` into `TB_PEDIDOS` (`database/usePedidoDatabase.ts L45-L67`), `updatePedido()` rewrites touched fields with `sync_status = 'pending'` (`L217-L245`), `createVenda()` does the same for `TB_VENDAS` (`database/useVendaDatabse.ts L21-L30`), and product creation marks `TB_PRODUTOS` pending (`database/useProductDatabase.ts L16-L25`).
- The sync engine assumes those pending rows are the authoritative outbound queue. `sincronizarComServidor()` selects products, sales, and orders where `sync_status = 'pending' OR sync_status IS NULL` before pushing (`database/useSyncDatabase.ts L23-L30`), and `AutoSyncContext.doSync()` is the main orchestrator that invokes it (`context/AutoSyncContext.tsx L47-L64`).
- `runWithLock()` serializes sync attempts across login-triggered sync, auto-sync, and manual sync so callers either become the running sync or attach to one queued follow-up (`database/syncGuard.ts L14-L35`). `AuthContext.login()` depends on that when it launches a background first sync without blocking navigation (`context/AuthContext.tsx L192-L199`), and `AutoSyncContext.doSync()` depends on the same guard when network/app-state events stack up (`context/AutoSyncContext.tsx L47-L64`).
- UI refresh is indirect. Local write functions call `markChanged()` (`database/usePedidoDatabase.ts L81-L83`, `L121-L123`, `L250-L250`, `L268-L268`; `database/useVendaDatabse.ts L44-L46`, `L85-L87`, `L130-L130`; `database/useProductDatabase.ts L27-L31`, `L56-L58`, `L102-L102`, `L118-L118`), sync pull paths also call `markChanged()` after applying remote changes (`database/useSyncDatabase.ts L221-L225`, `L274-L278`, `L340-L344`, `L412-L416`), and screens decide whether to re-query by comparing watermarks through `useShouldReload()` or by watching `lastSync` (`hooks/useShouldReload.ts L4-L25`, `hooks/useProductList.ts L110-L125`, `app/(tabs)/pedidos.tsx L66-L74`, `app/(tabs)/historico.tsx L98-L104`).
- Local identity and local business state are coupled by establishment. During login, if `/usuarios/me` reports a different `estabelecimentoId` than the row already stored in `TB_USUARIO`, the app deletes local products, orders, sales, printer, and user rows inside a transaction before writing the new user profile (`context/AuthContext.tsx L152-L179`), then reseeds product types (`L179-L179`).
- Order-to-sale transition is split across two write functions and is orchestrated by the modal caller, not by a single transactional helper. `PedidoModal.handleGerarVenda()` first calls `createVenda()` and then `updatePedido(..., STATUS_PEDIDO.FECHADO)` (`app/modais/pedidoModal.tsx L116-L123`); the local invariant that a closed order has a matching sale depends on that caller sequence rather than on one function.
- `lastSyncAt` advances only after both push and pull return non-null. `sincronizarComServidor()` updates `TB_SCHEMA.lastSyncAt` only when `syncRes` is truthy and `changes !== null` (`database/useSyncDatabase.ts L449-L458`), so later pulls depend on both halves of the round trip having completed.

**End-to-end flows:**
- Startup flow: `RootLayout` mounts `SQLiteProvider` with `initializeDatabase` (`app/_layout.tsx L53-L62`), then `AuthProvider` rehydrates the token and local user (`context/AuthContext.tsx L35-L104`), then `RootLayoutNav` routes to `/login` or `/(tabs)` based on `user` (`app/_layout.tsx L74-L84`).
- Login and first sync: `LoginScreen.handleLogin()` calls `AuthContext.login()` (`app/login.tsx L17-L37`), which authenticates against `/auth/login`, persists the token, fetches `/usuarios/me`, rewrites local user/schema rows, and starts a background sync through `runWithLock(() => sincronizarComServidor(...))` (`context/AuthContext.tsx L106-L199`).
- Cart to order: `ContaModal.gerarPedido()` maps cart items to `{ produtoId, quantidade }`, calls `createPedido()`, clears the in-memory cart, and fires `triggerSync()` asynchronously (`app/modais/contaModal.tsx L97-L117`).
- Cart to direct sale: `ContaModal.finalizarCompra()` maps cart items, calls `createVenda()`, clears the cart, and optionally routes to the print modal (`app/modais/contaModal.tsx L72-L95`).
- Existing order edit: `PedidoModal.load()` fetches the stored order plus product names from `TB_PRODUTOS` (`app/modais/pedidoModal.tsx L47-L75`), the user edits local state in memory, and `handleSave()` persists that through `updatePedido()` plus background sync (`L86-L98`).
- Pulled-state fanout: `sincronizarComServidor()` reads pending local rows, pushes them, pulls authoritative changes, applies upserts/deletes to local tables, updates `lastSyncAt`, and returns changes (`database/useSyncDatabase.ts L15-L468`). `AutoSyncContext.doSync()` derives `lastSync` from the returned server timestamp and records success/failure state (`context/AutoSyncContext.tsx L84-L101`), which screen hooks and `SyncIndicator` consume (`app/(tabs)/pedidos.tsx L72-L74`, `app/(tabs)/historico.tsx L98-L104`, `components/SyncIndicator.tsx L24-L41`).
- Printing flow: sale detail screens fetch the sale plus product names, then `sendMessageToDevice()` reconnects to the registered printer, scans services/characteristics, and writes base64 chunks to the first writable characteristic it finds (`app/modais/contaHistoricoModal.tsx L65-L144`, `useBLE.ts L85-L135`).

**Trust boundaries:**
- Semi-trusted user input reaches local SQLite through modal actions: cart edits feed `createPedido()` / `createVenda()` / `updatePedido()` (`app/modais/contaModal.tsx L72-L121`, `app/modais/pedidoModal.tsx L86-L128`).
- Semi-trusted remote API data reaches local SQLite only through `AuthContext` (`/usuarios/me`) and `sincronizarComServidor()` (`/sincronizacao/push` + `/sincronizacao/pull`) (`context/AuthContext.tsx L43-L90`, `database/useSyncDatabase.ts L95-L168`).
- Unclear BLE devices are reached only through `sendMessageToDevice()` after printer selection is persisted in `TB_IMPRESSORAS` (`database/usePrinterDatabase.ts L8-L64`, `useBLE.ts L85-L135`).
- OS lifecycle and connectivity signals can cause writes to local DB indirectly by triggering sync (`context/AutoSyncContext.tsx L104-L136`).

**Fragility clusters:**
- Sync composition is the highest-density area. It combines outbound queue selection, relation expansion, external API assumptions, multiple local transactions, local cleanup, and the only writer of `lastSyncAt` in one function (`database/useSyncDatabase.ts L15-L468`).
- Auth bootstrap is the second cluster. Startup rehydration, local offline fallback, destructive establishment swap, schema/user coordination, and login-triggered background sync all live in one context provider (`context/AuthContext.tsx L35-L199`).
- Order/sale lifecycle is split across UI callers and DB helpers instead of one atomic domain function. The split is visible in `ContaModal` and `PedidoModal` (`app/modais/contaModal.tsx L72-L121`, `app/modais/pedidoModal.tsx L116-L123`).
- Reload behavior depends on in-memory watermarks rather than persisted subscriptions, so correctness of screen refresh rests on every relevant write path calling `markChanged()` and on each screen observing the right table set (`database/tableWatermark.ts L13-L18`, `hooks/useShouldReload.ts L4-L25`).
- Printer behavior depends on runtime BLE service layout that is not modeled locally (`useBLE.ts L99-L130`).

**Unenforced assumptions carried forward:**
- `AuthContext.load()` assumes keeping a stored token after non-auth `/usuarios/me` failure is still enough to let the rest of the app operate from local state; no local revalidation beyond reading `TB_USUARIO` is present in this repo (`context/AuthContext.tsx L57-L90`).
- `sincronizarComServidor()` assumes any server product/order/sale timestamp field is parseable either by `Date.parse()` or `Number()` so ordering comparisons work (`database/useSyncDatabase.ts L6-L13`, `L177-L183`, `L198-L201`, `L238-L241`, `L290-L293`, `L356-L359`); nothing in this repo constrains remote payload shape.
- `sendMessageToDevice()` assumes the first writable characteristic found on the connected device accepts base64 text chunks through `writeWithResponse()` and reconstructs the original print job (`useBLE.ts L102-L117`); nothing in this repo validates printer protocol compatibility.

**Open Questions:**
- unclear; need to inspect the backend sync contract for `/sincronizacao/push` and `/sincronizacao/pull`, especially exact timestamp fields, id-map behavior, and whether partial success is possible. Mobile code treats these endpoints as external black boxes (`services/api.ts L67-L114`, `database/useSyncDatabase.ts L95-L168`).
- unclear; need to inspect `expo-sqlite` transaction semantics for `execAsync('BEGIN;')` plus awaited per-row writes, because several sync and auth flows depend on those sequences being atomic (`context/AuthContext.tsx L154-L177`, `database/useSyncDatabase.ts L187-L225`, `L231-L278`, `L283-L345`, `L349-L416`).
- unclear; need to inspect whether the repo expects `horario` to remain ISO text everywhere or only for local display. DB initialization stores `horario` as `TEXT` (`database/initializeDatabase.ts L54-L55`, `L70-L71`), while `updated_at` / `lastSyncAt` are epoch integers (`L32-L33`, `L74-L75`, `L139-L139`).
- unclear; need to inspect whether a sale generated from an order should trigger immediate sync the same way `gerarPedido()` and `handleSave()` do. `PedidoModal.handleGerarVenda()` does not call `triggerSync()` (`app/modais/pedidoModal.tsx L116-L123`).
- unclear; need to inspect whether the in-memory watermark baseline should survive app restarts. `changedAt` lives only in module memory (`database/tableWatermark.ts L3-L18`).
