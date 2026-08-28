# Task 9 — Review

Diff revisado: `efc1eb1..db6fd1e` (`04f2172` implementação e `db6fd1e` relatório do worker).

## Spec compliance

✅ Objetivo — `app/onboarding.tsx:91-165` implementa seleção de categoria, edição da lista e confirmação; `components/CategoryOnboardingGate.tsx:53-71` integra o primeiro acesso.

✅ Arquivos — `database/watermelon/categorySeeds.ts:1-23`, `app/onboarding.tsx:31-167`, `components/CategoryOnboardingGate.tsx:12-72` e `app/_layout.tsx:121-132` cobrem os arquivos novos e a integração pós-login; `services/api.ts:176-262` adiciona os clientes necessários.

✅ Passo 1 — `database/watermelon/categorySeeds.ts:1-18` define exatamente as seis categorias e listas não vazias, coerentes e sem duplicatas; `getCategorySeed` retorna cópia nova em `:21-23`.

✅ Passo 2 — `app/onboarding.tsx:96-163` mostra as seis opções, carrega os seeds, permite adicionar texto não vazio e remover itens; `:76-81` passa a lista editada ao fluxo de confirmação.

✅ Passo 3 — `services/api.ts:176-191` usa `GET /estabelecimentos`; `:199-224` usa `PATCH /establishments/:id` com `{ category }`; `:232-256` usa `POST /tipos` com `{ description, color }`; `services/categoryOnboarding.ts:20-29` faz um POST por item confirmado.

✅ Passo 4 — `app/__tests__/onboarding.test.tsx:68-113` adiciona, remove e confirma verificando que o item removido não gera POST; `services/__tests__/categoryOnboarding.test.ts:33-70` verifica ordem, normalização e sync.

✅ Passo 5 — verificado diretamente: suíte focada 6/6 suítes e 30/30 testes, suíte completa 37/37 e 155/155 testes com 1 snapshot, `node scripts/check-i18n.mjs` passou e `tsc --noEmit` não encontrou erros.

❌ Critério `category === null` — o gate normal só retorna onboarding quando a condição estrita é verdadeira em `components/CategoryOnboardingGate.tsx:53-59` e atualiza a categoria em memória após sucesso em `:64-66`, mas a rota direta `app/onboarding.tsx:31-39,91-165` não consulta a categoria e pode exibir onboarding mesmo quando ela já está configurada.

❌ Ruling RBAC `OWNER`-only — o caminho normal está protegido por `components/CategoryOnboardingGate.tsx:13-27`, que não faz sequer o GET para não-`OWNER`. Porém `app/onboarding.tsx` é também uma rota e, em `:36-39` e `:67-89`, não verifica `user.role` antes de renderizar ou confirmar. O fluxo de redirecionamento em `app/_layout.tsx:100-109` só trata autenticação e `/login`; não bloqueia um usuário autenticado que abra `/onboarding` diretamente. Isso viola o ruling para `MANAGER` e pode executar PATCH seguido de POSTs 403.

✅ Sync pós-confirmação — `services/categoryOnboarding.ts:32-35` chama `runWithLock` e passa `token` e `establishmentId` para `synchronizeWithServer` somente depois dos POSTs.

✅ Isolamento/local — T9 não faz query, criação ou atualização direta no WatermelonDB: `services/categoryOnboarding.ts:1-35` usa somente API, lock e sync. O `establishmentId` é usado no PATCH e no sync (`:20`, `:32-35`); não foi criado cache local de onboarding.

✅ Textos — os nove textos estão presentes nos seis locales, por exemplo `i18n/locales/en/common.json:43-51`, e a cobertura fechada está em `i18n/__tests__/index.test.ts:96-115`.

## Falha parcial não-atômica (avaliação)

**Aceitar como limitação documentada — Minor/não-bloqueante, isoladamente.**

Se o PATCH funcionar e algum POST posterior falhar, a exceção do loop sequencial em `services/categoryOnboarding.ts:20-29` chega ao `catch` de `app/onboarding.tsx:83-87`. O usuário vê a mensagem localizada genérica de erro; `saving` volta a `false`, então pode tentar novamente ou trocar a categoria. O gate continua substituindo o shell pela tela (`components/CategoryOnboardingGate.tsx:53-71`), sem botão de cancelar/voltar ao app; portanto não há saída normal durante essa sessão, apenas retry/troca de categoria ou fechamento e reabertura. Como o PATCH já salvou a categoria, uma sessão futura não mostra o onboarding.

Há risco real de duplicação: um retry reenvia a lista inteira em `services/categoryOnboarding.ts:20-29`, inclusive os itens cujos POSTs já tiveram sucesso; uma falha do sync depois de todos os POSTs também deixa o mesmo risco. Não há checkpoint nem idempotência no contrato fornecido.

Reordenar para POST antes do PATCH não resolve: uma falha tardia deixa os POSTs anteriores para serem duplicados no retry, e uma falha do PATCH depois de todos os POSTs deixaria tipos criados com a categoria ainda pendente. Dado que o contrato não oferece transação/lote/idempotência e considerando a premissa informada de que o `OWNER` pode completar manualmente tipos faltantes na gestão existente, isso é uma limitação recuperável e não bloqueia a task por si só.

## Achados

- [Important] O `OWNER`-only está protegido apenas pelo gate, não pela própria rota/tela — `app/onboarding.tsx:31-39,67-89`; `app/_layout.tsx:100-109,121-132` — um `MANAGER` autenticado que abrir `/onboarding` diretamente pode renderizar a tela e confirmar; o PATCH é permitido para `MANAGER`, mas os POSTs de tipos retornam 403, reproduzindo justamente o estado parcial que o ruling deveria impedir. O teste `app/__tests__/onboarding.test.tsx:173-190` cobre apenas o gate e não esse entrypoint.
- [Minor] A confirmação não é retomável/idempotente em falha parcial — `services/categoryOnboarding.ts:20-35`; `app/onboarding.tsx:73-87` — erro é informado e a tentativa pode ser repetida, mas itens já criados são reenviados e podem duplicar. Limitação aceita conforme a seção acima; não há endpoint transacional/idempotente no escopo.

## Veredito

**Reprovado — exige correção do bypass de RBAC `OWNER`-only antes da aprovação.** A falha não-atômica foi aceita como Minor isoladamente; o achado Important da rota direta é independente e viola um ruling obrigatório.
