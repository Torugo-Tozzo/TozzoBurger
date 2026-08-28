# Task 9 — Re-review (fix round 1)

## Finding da revisão original
- [Important] Bypass de RBAC/categoria pela rota direta: ADDRESSED — `useCategoryOnboardingAccess` só considera o acesso elegível quando há token, `role === 'OWNER'` e `establishmentId` (`hooks/useCategoryOnboardingAccess.ts:28-29`); para usuário não-`OWNER`, a rota não faz o GET (`hooks/useCategoryOnboardingAccess.ts:45-50`), não renderiza a tela (`app/onboarding.tsx:111`) e redireciona para `/(tabs)` (`app/onboarding.tsx:59-64`). Para `OWNER`, o GET é aguardado (`hooks/useCategoryOnboardingAccess.ts:53-67`) e `allowed` exige estritamente `establishment?.category === null` (`hooks/useCategoryOnboardingAccess.ts:74-75`); categoria já configurada deixa `allowed` falso, mantendo a tela desmontada e acionando o redirecionamento (`hooks/useCategoryOnboardingAccess.ts:84`, `app/onboarding.tsx:59-64`). Os testes regressivos cobrem os dois cenários: `MANAGER` na rota direta em `app/__tests__/onboarding.test.tsx:122-138` e `OWNER` com categoria configurada em `app/__tests__/onboarding.test.tsx:141-154`. A suíte focada passou com 7 testes e o TypeScript passou sem erros.

## Quebras novas no diff de correção
Nenhuma.

## Veredito
Todos endereçados.
