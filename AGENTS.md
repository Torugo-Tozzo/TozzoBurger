# TozzoBurger — instruções para agentes

## Contexto

Aplicativo Expo 54 / React Native 0.81 / React 19 com TypeScript, Expo Router, WatermelonDB e impressão Bluetooth. API: `../api-tozzo.uk`; web: `../front-tozzo.uk`. Cada pasta é um repositório independente.
Planos compartilhados pertencem ao repositório privado da API: `../api-tozzo.uk/proximas-etapas/README.md`. A entrega de pagamento/cozinha de setembro de 2026 tem implementação **somente web + API**; neste app, apenas documentação e verificações de compatibilidade, salvo nova instrução.
O guia de trabalho compartilhado fica em `../api-tozzo.uk/skills/tozzo-development/SKILL.md`; leia a referência pertinente à tarefa.

## Mapa

- `app/(tabs)/`, `app/modais/`: telas Expo Router.
- `context/`, `hooks/`, `services/`: estado e integração.
- `services/api.ts`, `services/legacyWire.ts`: contratos com a API.
- `database/watermelon/`: schema, models e sincronização offline.
- `database/syncGuard.ts`: exclusão mútua de sincronização.
- `i18n/`: traduções.
- `patches/`: patches de dependências nativas aplicados no postinstall.
- `useBLE.ts`: integração Bluetooth.

## Comandos

```bash
npm ci
npx jest --runInBand
npx expo start --dev-client --localhost
```

`npm test` ativa watch; para verificação automatizada use Jest com `--runInBand`. O app depende de módulos nativos e não funciona no Expo Go. Build e execução Android, quando solicitados:

```bash
source ../dev-env.sh
adb devices
adb reverse tcp:3001 tcp:3001
adb reverse tcp:9999 tcp:9999
adb reverse tcp:8081 tcp:8081
npx expo run:android --device
```

O script `../dev-env.sh` pertence ao ambiente local e pode não existir em outro checkout. Não invente caminhos globais fora dessa máquina. Sem dispositivo, relate que a execução física não foi validada.

## Regras

- Preserve o trabalho existente. Use npm/package-lock neste repo; não substitua por Bun lockfile.
- Nunca limpe SQLite/WatermelonDB para contornar conflito de sync. Mudanças de schema exigem migrations e compatibilidade com dados instalados.
- Preserve UUIDs, tombstones, marcas de alteração e isolamento por estabelecimento. Não faça duas sincronizações concorrentes.
- Dados novos da API precisam ser compatíveis com apps publicados. Campo desconhecido não autoriza apagar dados pertencentes ao servidor.
- Não regenere `android/` nem rode prebuild sem necessidade da tarefa; isso pode afetar customizações nativas.
- Não remova patches sem verificar a dependência correspondente.
- Reutilize i18n e formatadores; evite strings de interface fixas.
- Não exponha `.env`, credenciais, tokens, dumps ou dados de clientes. Nunca sobrescreva a configuração local com `.env.example`.
- Bluetooth e impressão exigem validação em hardware para afirmar funcionamento físico; bundle ou teste unitário não basta.

## Ferramentas e entrega

Use Superpowers pertinente, Serena para símbolos quando conectado e `rg` como alternativa. RTK pode resumir saídas extensas; consulte saída original ao investigar falhas. Execução sequencial é o padrão, sem delegação automática.
Leia o plano autorizado, teste o comportamento alterado e relate limitações concretas. Não transforme testes de compatibilidade em autorização para implementar funcionalidades fora do escopo mobile.
