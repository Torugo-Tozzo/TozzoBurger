# Vendas, Design System e Preparação da Play Store

## Contexto

O app mobile está na branch `feat/design-system-mobile-listas` com o primeiro
fluxo de loading/skeleton e a separação do histórico entre vendas do aparelho
e vendas do estabelecimento já iniciados. A API já aceita `page`/`limit`, mas
a tela mobile fixa a primeira página. A consulta local usa os últimos dias e
um limite fixo, sem paginação real.

O próximo lote precisa fechar esse fluxo, remover ações visuais fora do design
system e deixar o projeto tecnicamente apto a gerar um build publicável. A
integração deste lote terá como destino `dev`; `main` não faz parte deste
trabalho.

## Objetivos

1. Tornar a busca de vendas paginada de ponta a ponta, tanto para dados locais
   quanto para dados remotos.
2. Fazer todos os botões de ação do mobile usarem os componentes e tokens já
   existentes.
3. Corrigir os bloqueios técnicos de release Android e produzir a
   documentação operacional necessária para a Play Store.

## Decisões de produto

### Histórico de vendas

- A seção **Neste aparelho** consulta somente registros que existem no SQLite.
  A retenção/sincronização atual de vendas não será ampliada neste lote.
- A seção **Estabelecimento** é a fonte para histórico além da retenção local e
  consulta a API somente quando selecionada, filtrada ou atualizada.
- Ambas as seções usam página inicial de 50 itens e carregamento incremental.
- Alterar filtros, trocar seção ou executar refresh reinicia a paginação e
  substitui os itens anteriores.
- O cliente não deve exibir fechamento financeiro de uma página como se fosse a
  contagem de registros. A resposta remota terá metadados explícitos de
  paginação.

### Contrato da API

`GET /vendas` continuará retornando `vendas` e `fechamento`, e passará a
retornar também:

```ts
{
  vendas: Venda[];
  fechamento: Fechamento;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}
```

Os filtros de data, hora, cliente e faixa de total serão aplicados no servidor
com valores parametrizados. `page` e `limit` serão inteiros positivos, com
limite máximo definido no módulo para evitar consultas sem controle.

### Design system

- Ações de ícone (excluir, limpar, fechar, compartilhar) usarão `IconButton`
  ou um wrapper de ação equivalente, sempre com `accessibilityLabel`,
  `accessibilityRole="button"` e variante destrutiva quando aplicável.
- Ações de formulário de largura total usarão `Button`.
- `Pressable` continuará permitido para cards, abas, quantidade e outros
  controles que tenham semântica própria; não haverá substituição mecânica.

### Play Store

O lote implementará apenas o que pode ser versionado no código e na
documentação:

- alinhar dependências Expo e peers obrigatórios;
- remover dependências Expo que não devem ser instaladas diretamente;
- garantir build Android com `targetSdkVersion` 36 ou superior;
- revisar permissões e configuração do Bluetooth;
- manter `android.versionCode` controlado pelo EAS;
- documentar inventário de dados, Data Safety, política de privacidade,
  exclusão de conta, ficha da loja e teste fechado.

Cadastro da conta, identidade, publicação, hospedagem da política de
privacidade e recrutamento dos testers continuam sendo ações externas e não
serão simuladas pelo código.

## Arquitetura e fluxo

### Local

O banco recebe filtros e paginação como parâmetros. A consulta SQL usa
`LIMIT`/`OFFSET` e a mesma página de 50 itens; filtros dinâmicos só serão
montados a partir de fragmentos fixos e valores parametrizados. A tela mantém
`items`, `page`, `hasNextPage` e estados independentes de carregamento inicial,
refresh e próxima página.

### Remoto

O serviço HTTP envia todos os filtros e a página atual. A tela concatena uma
próxima página somente quando `hasNextPage` é verdadeiro, evita chamadas
duplicadas durante o carregamento e descarta respostas antigas quando o
usuário altera filtros ou seção.

### Erros e sincronização

Falha ao buscar a próxima página mantém os itens já exibidos, mostra o erro e
permite tentar novamente. Falha no primeiro carregamento mostra o estado de
erro/empty state já padronizado. Nenhum erro será engolido por catch vazio.

## Testes e critérios de aceite

### API

- Testes provam filtros de data/hora/cliente/total.
- Testes provam `skip`/`take`, total, `totalPages` e `hasNextPage`.
- Testes provam rejeição de paginação inválida e limite máximo.
- A suíte existente continua passando.

### Mobile

- Testes de serviço provam montagem dos parâmetros remotos e filtro/paginação
  local.
- Testes de tela ou de helpers provam reset ao trocar filtro, concatenação da
  próxima página, prevenção de duplicidade e tratamento de erro.
- A suíte Jest e `tsc --noEmit` continuam passando.
- O build nativo Android será executado com `npx expo run:android` quando um
  emulador ou aparelho estiver disponível.

### Release

- `expo-doctor` não deixa falhas relacionadas às dependências corrigidas.
- O manifesto Android gerado contém somente as permissões Bluetooth necessárias
  ao uso da impressora e o fluxo de permissão funciona em Android 12+.
- Um AAB de produção é gerado ou o bloqueio exato fica documentado com o
  próximo passo necessário.

## Fora do escopo

- Promoção ou merge em `main`.
- Publicação efetiva na Play Store.
- Alteração da política de retenção da sincronização de vendas.
- Recuperação de senha, 2FA, WebSocket/SSE ou mudanças no dashboard web.
- Criação de conteúdo jurídico final sem revisão do responsável pelo produto.

