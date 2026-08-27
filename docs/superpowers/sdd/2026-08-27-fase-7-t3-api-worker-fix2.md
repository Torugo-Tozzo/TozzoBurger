# Fase 7 — Task 3: correção I1-R1 da API/worker

Data: 2026-08-27  
Repositório: `api-tozzo.uk`  
Branch: `feat/fase-7-sync-status-categoria`  
Base: `921d17c2657fb3c62a46f57e4be7ea7e9638b4c5`  
Commit: `6e07dca` (`fix-charts-I1-R1-exclude-soft-deleted-sale-items`)

## I1-R1 — filtros de itens tombstonados nos gráficos

As três consultas `prisma.saleItem.findMany` em `modules/charts/charts.controller.ts` agora incluem `deletedAt: null` no `where`:

- `obterGraficoTopProdutos`;
- `obterListaDetalhada`;
- geração assíncrona do relatório (`gerarRelatorio`).

Também foi confirmado por busca estática que não há consultas de `OrderItem` nem outras consultas de `SaleItem` em `modules/charts/` além dessas três.

Foi adicionado um teste de regressão em `tests/charts/charts.controller.test.ts`. O cenário cria uma venda com um item ativo (quantidade 2) e um item tombstonado (quantidade 5); o endpoint de top produtos retorna somente o ativo, com 2 unidades e faturamento 20.

O ciclo TDD foi observado:

- RED: sem o filtro, o teste retornou também `product-deleted`, com quantidade 5 e faturamento 50; exit code 1;
- GREEN: após o filtro, o teste passou com 1 pass, 0 fail e 3 expectations.

## Verificação

Comandos executados e resultados reais:

```text
bun test --isolate --parallel tests/charts/charts.controller.test.ts --test-name-pattern=conta
1 pass, 0 fail, 3 expect() calls
exit code 0

bun test --isolate --parallel tests/charts/charts.controller.test.ts
3 pass, 0 fail, 11 expect() calls
exit code 0

bun test --isolate --parallel
Primeira execução: 206 pass, 2 fail; os dois testes Postgres falharam antes da execução por
permission denied ao Docker (docker_engine) no sandbox.

Reexecução com acesso ao Docker: 208 pass, 0 fail, 563 expect() calls
Ran 208 tests across 25 files
exit code 0

bunx tsc --noEmit
sem saída
exit code 0

git diff --check
sem erros de whitespace; Git exibiu apenas os avisos normais de conversão LF/CRLF.
```

Não foi feito push nem aberto PR. Este relatório não faz parte do commit do código.
