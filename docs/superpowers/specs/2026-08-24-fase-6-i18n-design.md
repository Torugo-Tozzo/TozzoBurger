# Fase 6 — inglês como base, internacionalização e RTL

> Status: brainstorm concluído e spec pronto para aprovação. Este documento
> não representa implementação. A rodada que o produziu não altera código,
> migration, banco, branch ou commit.

## 1. Decisões executivas

### 1.1 O que muda

O TozzoBurger passa a ter inglês como idioma de código e de schema interno, e
as duas interfaces passam a oferecer exatamente estes sete locales:

    en, pt-BR, es, fr, zh, hi, ar

"zh" representa mandarim simplificado para esta fase; "ar" representa árabe
padrão moderno e ativa RTL. Os três repositórios continuam independentes:

- C:/RN/api/api-tozzo.uk: Prisma, domínio interno, adaptadores de contrato e API;
- C:/RN/front/front-tozzo.uk: dashboard React/Vite, seus bundles e RTL web;
- C:/RN/TozzoBurger: domínio local/offline, SQLite, bundles e RTL mobile.

O spec fica em TozzoBurger/docs/superpowers/specs/ porque esse repositório
contém o cliente offline mais sensível ao rename e já é a raiz dos specs de
produto que atravessam os três repositórios. O plano correspondente fica em
TozzoBurger/docs/superpowers/plans/.

### 1.2 Biblioteca de i18n

Decisão: usar i18next + react-i18next tanto no dashboard quanto no app
React Native.

- i18next fornece a mesma API de chaves, namespaces, fallback, interpolation e
  plurals nos dois clientes.
- react-i18next é o binding React/React Native; não será usado um sistema
  diferente para cada UI.
- O front usa um detector pequeno próprio baseado em localStorage e
  navigator.languages, para não introduzir um plugin de browser só para
  resolver sete valores conhecidos.
- O mobile usa expo-localization para ler o locale do dispositivo e
  AsyncStorage para uma preferência escolhida no app.
- Os recursos são empacotados localmente. Não haverá backend remoto de
  traduções, download de dicionário em runtime ou dependência de internet
  para o app offline iniciar.
- en é o fallback obrigatório e também define a forma canônica das chaves.

Essa escolha é compatível com a recomendação oficial de instalar o par
i18next/react-i18next e com o suporte do binding a React Native. Namespaces
serão usados para separar common, auth, navigation, orders, sales, products,
employees, charts, settings, sync, printer, status e errors, em vez de manter
um JSON monolítico.

Não será criado um pacote/repositório compartilhado só para dicionários. Os
repositórios têm package managers, builds, CI e superfícies de UI diferentes;
um arquivo comum acoplado por caminho local seria frágil no Docker do front e
no Metro do mobile. O que será compartilhado é a convenção de chaves, o
namespace common e o comportamento de fallback. Cada cliente terá seus
bundles versionados e seu próprio gate de completude. Alterações de chaves
comuns serão feitas nos dois repositórios na mesma task do plano.

### 1.3 O que não será traduzido

Não se traduz automaticamente dado de negócio persistido:

- nome do estabelecimento;
- nome, ingredientes e preço de produto;
- nome de cliente digitado no pedido/venda;
- descrições de tipos cadastrados pelo usuário;
- produtos de demonstração do trailer e seus ingredientes.

Esses textos são conteúdo do estabelecimento, não chrome da interface. Os
identificadores de código, estados, mensagens de UI, mensagens de validação,
logs e nomes de seed serão migrados para inglês. Os tipos padrão do catálogo
terão labels traduzidos a partir de seus IDs estáveis no namespace catalog;
um tipo customizado continuará exibindo a descrição gravada pelo usuário.

### 1.4 Contrato HTTP e sincronização

URLs públicas e o contrato legado em português ficam estáveis nesta fase:
"/usuarios", "/produtos", "/pedidos", "/vendas" e
"/sincronizacao/{push,pull}" não serão renomeados. Isso é uma decisão de
compatibilidade, não uma exceção acidental ao rename interno.

O domínio interno da API será inglês. A borda HTTP terá DTOs explícitos que:

1. aceitam o formato legado atual;
2. aceitam o formato inglês durante a transição quando isso for útil;
3. normalizam para o domínio inglês;
4. serializam a resposta legada que o app antigo conhece.

O app novo usará tipos ingleses internamente e converterá o wire legado em um
único arquivo de adapter, em vez de espalhar "nome", "criado_por", "pedidos"
e equivalentes pelo domínio. O mesmo vale para role, status e IDs de
relacionamento.

Em particular, o endpoint de sync precisa continuar aceitando o payload antigo
com "produtos", "pedidos", "vendas", "criado_por", "deleted_at" e demais
campos atuais. O pull continuará podendo ser consumido por builds antigos. A
resposta terá códigos de descarte estáveis para "ignorados"; texto de UI será
responsabilidade do cliente. Um eventual contrato HTTP totalmente inglês
fica para uma API versionada futura, fora da Fase 6.

## 2. Rename canônico do schema Prisma

O rename é semântico e preserva os dados. A nomenclatura física mantém os
prefixos TB_ e RL_ já usados pelo banco, mas troca os nomes de negócio para
inglês:

| Prisma atual | Prisma final | tabela física atual | tabela física final |
|---|---|---|---|
| Estabelecimento | Establishment | TB_ESTABELECIMENTOS | TB_ESTABLISHMENTS |
| Usuario | User | TB_USUARIOS | TB_USERS |
| TipoProduto | ProductType | TB_TP_PRODUTO | TB_PRODUCT_TYPES |
| Produto | Product | TB_PRODUTOS | TB_PRODUCTS |
| Venda | Sale | TB_VENDAS | TB_SALES |
| ItemVenda | SaleItem | RL_VENDA_PRODUTO | RL_SALE_PRODUCT |
| Impressora | Printer | TB_IMPRESSORAS | TB_PRINTERS |
| Pedido | Order | TB_PEDIDOS | TB_ORDERS |
| ItemPedido | OrderItem | RL_PEDIDO_PRODUTO | RL_ORDER_PRODUCT |
| Dispositivo | Device | TB_DISPOSITIVOS | TB_DEVICES |

O enum StatusEstabelecimento vira EstablishmentStatus com valores ACTIVE,
PENDING_PAYMENT e SUSPENDED.

### 2.1 Colunas e relações

As colunas que já são inglesas permanecem como estão. As principais trocas
físicas e de propriedades Prisma são:

| Português | Inglês |
|---|---|
| nomeFantasia | tradeName |
| nome | name |
| telefone | phone |
| senha | passwordHash |
| estabelecimentoId | establishmentId |
| descricao | description |
| tipoProdutoId | productTypeId |
| tipoProduto | productType |
| origemProdutoId | sourceProductId |
| preco | price |
| ingredientes | ingredients |
| horario em venda | soldAt |
| horario em pedido | openedAt |
| cliente | customerName |
| excluida | isCancelled |
| usuarioVendedorId | sellerId |
| vendedor | seller |
| pedidoId | orderId |
| vendaId | saleId |
| produtoId | productId |
| quantidade | quantity |
| precoHistorico em item de venda | unitPriceAtSale |
| precoHistorico em item de pedido | unitPriceAtOrder |
| membros | members |
| produtos | products |
| vendas | sales |
| pedidos | orders |
| impressoras | printers |
| dispositivos | devices |
| itensVenda | saleItems |
| itensPedido | orderItems |
| itens | items |

Os nomes dos índices e constraints também serão renomeados para inglês para
que o schema gerado não volte a introduzir nomenclatura portuguesa. A
semântica de FK, soft delete, ON DELETE e timestamps não muda nesta fase.

### 2.2 Valores persistidos de máquina

Os valores abaixo também deixam de ser português. O migration fará UPDATE
sobre valores conhecidos, sem traduzir texto de negócio:

| Área | Atual | Final |
|---|---|---|
| role | DONO | OWNER |
| role | GERENTE | MANAGER |
| role | FUNCIONARIO | EMPLOYEE |
| role | CLIENTE | CUSTOMER |
| order status | ABERTO | OPEN |
| order status | EM_PREPARO | IN_PREPARATION |
| order status | ENTREGANDO | DELIVERING |
| order status | FECHADO | CLOSED |
| sync filter | NAO_FECHADOS | NOT_CLOSED internamente |

Durante a transição, o auth normaliza claims antigos e novos. Tokens antigos
com roles portuguesas não devem derrubar o RBAC; tokens novos podem carregar o
valor legado na borda até todos os clientes terem sido atualizados. O domínio
sempre trabalha com OWNER, MANAGER, EMPLOYEE e CUSTOMER.

Os nomes dos membros da enumeração de tipos de produto também serão ingleses
(BURGER, ARTISAN_BURGER, CHICKEN, DRINK, FRENCH_FRIES, ADD_ON, OTHER etc.),
mas seus IDs numéricos e descrições gravadas em português serão preservados.

## 3. Estratégia de migration Prisma/Postgres

Não será usado prisma db push, prisma migrate dev sobre um rename não
reconhecido, reset ou migration gerada que interprete rename como
DROP TABLE/CREATE TABLE.

A migration futura será escrita explicitamente, depois revisada, com esta
ordem:

1. exportar/snapshot do banco de dev e registrar contagens por tabela;
2. renomear o tipo enum, seus valores, tabelas e colunas com ALTER TYPE RENAME,
   ALTER TYPE RENAME VALUE, ALTER TABLE RENAME TO e ALTER TABLE RENAME COLUMN;
3. renomear índices e constraints, sem remover/recriar FK ou índice por
   conveniência;
4. atualizar somente roles e status persistidos conhecidos;
5. ajustar defaults do enum e validar que continuam corretos;
6. marcar a migration como aplicada somente após a validação dos invariantes;
7. executar prisma generate e comparar o diff do schema com a migration.

A migration de rename não deve conter DROP, TRUNCATE, DELETE de dados de
negócio, CREATE TABLE paralelo para copiar dados ou mudança de cardinalidade.
Os testes usarão um Postgres efêmero: aplicar migrations antigas, inserir
registros representativos de todos os relacionamentos/status, aplicar a
migration nova e provar contagens, valores, FKs, índices e leitura pelo novo
Prisma Client. O banco real de dev/homolog só entra em uma rodada posterior,
com aprovação explícita, snapshot verificável e janela de observação.

Rollback operacional é restauração do snapshot, não uma promessa de
prisma migrate down. O plano deverá ter um runbook de abortar antes do
deploy da API, restaurar o snapshot se a validação falhar e só então retomar.

### 3.1 SQLite do mobile

O banco local também será renomeado para não deixar o domínio em português:

| SQLite atual | SQLite final |
|---|---|
| TB_PRODUTOS | TB_PRODUCTS |
| TB_TP_PRODUTO | TB_PRODUCT_TYPES |
| TB_VENDAS | TB_SALES |
| TB_PEDIDOS | TB_ORDERS |
| RL_VENDA_PRODUTO | RL_SALE_PRODUCT |
| RL_PEDIDO_PRODUTO | RL_ORDER_PRODUCT |
| TB_IMPRESSORAS | TB_PRINTERS |
| TB_USUARIO | TB_USERS |
| TB_ESTABELECIMENTO | TB_ESTABLISHMENTS |

O SCHEMA_VERSION será incrementado. A inicialização detectará o schema antigo
e fará ALTER TABLE RENAME TO/COLUMN em transação, preservando a fila offline,
IDs, watermarks e registros ainda não sincronizados. A nova instalação já
nascerá com os nomes finais. Nenhuma operação de sync poderá assumir que o
usuário abriu o app online durante o upgrade.

## 4. Nomenclatura de código e módulos

Depois do schema, o rename atravessa os três repositórios:

| Atual na API | Final |
|---|---|
| modules/usuarios | modules/users |
| modules/estabelecimentos | modules/establishments |
| modules/produtos | modules/products |
| modules/pedidos | modules/orders |
| modules/vendas | modules/sales |
| modules/sincronizacao | modules/sync |
| modules/dispositivos | modules/devices |
| modules/graficos | modules/charts |
| modules/tipos | modules/product-types |

Controllers, routes, regras, tipos, testes, imports, variáveis, comentários
operacionais e nomes de arquivos seguem a mesma transformação. auth, events,
payments e o diretório raiz types já são ingleses e não serão renomeados por
estética.

No front e no mobile, tipos e hooks passam a usar User, Establishment,
Product, Order, Sale, Printer, ProductType e Sync. Nomes de rota de tela que
são parte da navegação pública, como /dashboard/orders, já estão em inglês e
permanecem. O path HTTP legado em português permanece somente na camada de
serviço/adapter.

## 5. Arquitetura de UI internacionalizada

### 5.1 Bundles e chaves

Cada cliente terá uma árvore equivalente a:

    i18n/
      locales/
        en/{common,auth,navigation,orders,sales,products,employees,charts,settings,sync,printer,status,errors,catalog}.json
        pt-BR/...
        es/...
        fr/...
        zh/...
        hi/...
        ar/...

As chaves são semânticas em inglês, como common.actions.save, nunca o texto
visível, como "Salvar". Interpolation usa {{name}}, {{count}} e plurals do
i18next; concatenação de frases em JSX não é permitida. Texto com markup usa
Trans somente quando necessário.

Cada locale deve ter exatamente as mesmas folhas de chave de en. O checker
também compara o conjunto de placeholders de cada chave; uma tradução que
perde {{count}} falha mesmo que a chave exista. Chave extra também falha,
para evitar bundles órfãos.

O runtime usa fallbackLng: en como rede de segurança, mas fallback não
substitui a checagem de CI. Em desenvolvimento, chave ausente gera log
identificável com locale e namespace; nenhuma tela nova pode ser aprovada
dependendo silenciosamente do inglês.

### 5.2 Locale, preferência e formatação

O resolvedor normaliza entradas de SO/browser para o conjunto fechado:

- en-US, en-GB → en;
- pt, pt-PT, pt-BR → pt-BR;
- qualquer es-* → es;
- qualquer fr-* → fr;
- zh-* → zh;
- hi-* → hi;
- ar-* → ar;
- desconhecido → en.

No front, a preferência manual fica em localStorage; no mobile, em
AsyncStorage, com o locale do sistema como fallback inicial. A troca de
idioma atualiza strings imediatamente. No mobile, uma troca que altera LTR ↔
RTL mostra que a direção nativa será efetivada no próximo reinício do app;
não haverá um estado que traduza para árabe mas mantenha layout LTR como se
fosse suporte completo.

Datas, horas, números, moeda e plurals usam Intl com o locale ativo. O valor
de moeda continua sendo o dado de negócio configurado hoje (BRL nesta fase),
mas símbolo, separador e agrupamento deixam de ser hardcoded. Timestamps de
sync continuam no contrato atual e no formato epoch ms do mobile; i18n não
altera persistência temporal.

### 5.3 Mensagens da API

A API não escolherá idioma por Accept-Language e não traduzirá dados do
estabelecimento. Respostas de erro terão um code estável e uma mensagem
inglesa de fallback; o front/mobile traduzirá códigos conhecidos pelo
namespace errors. O adapter aceita o formato antigo que só tinha message,
mantendo uma mensagem de fallback para endpoints ainda não normalizados. Isso
evita que a UI dependa de comparar texto português para decidir o que exibir.

## 6. RTL de verdade para ar

### 6.1 Dashboard web

O front terá um único provedor de direção que atualiza
document.documentElement com lang e dir. A auditoria do design system e das
páginas deve:

- trocar margens, paddings e posições left/right por propriedades lógicas
  (start/end, ms/me, ps/pe) quando a intenção for direcional;
- revisar flex-row, sidebars, drawer, tabs, breadcrumbs, tabelas, filtros,
  paginação, dropdowns, dialogs e toasts;
- espelhar ícones direcionais (ChevronLeft/Right, voltar/avançar) e manter
  ícones não direcionais sem espelhamento;
- usar text-start/text-end e dir=auto para texto livre;
- manter email, senha, números, IDs e campos técnicos em LTR quando essa for
  a semântica correta;
- testar o comportamento do Radix, Tailwind e componentes locais com dir no
  elemento raiz, não com uma classe isolada em cada tela.

### 6.2 App mobile

O app habilitará suporte RTL no config plugin compatível com o SDK instalado,
declarará os sete locales suportados e usará I18nManager para verificar a
direção efetiva. O design system será revisado para:

- usar start/end e tokens direcionais em vez de marginLeft, marginRight,
  paddingLeft, paddingRight e left/right fixos;
- espelhar somente ícones e animações com significado direcional;
- alinhar Text e TextInput de modo consistente, incluindo textos árabes e
  campos livres;
- manter email, senha, UUID e valores numéricos em LTR;
- revisar tab bar, cabeçalhos, modais, listas, cards, quantidade, filtros,
  histórico, impressora BLE e indicadores de sync;
- testar teclado e foco em árabe, não apenas a posição visual dos blocos.

forceRTL será usado em builds/testes de desenvolvimento e nunca como
configuração permanente de produção. O app será validado após reinício real
para garantir que a direção nativa coincide com o locale escolhido.

## 7. Completude e qualidade das traduções

Cada repositório de UI terá scripts/check-i18n.mjs e um script de pacote
i18n:check. O script:

1. lê todos os arquivos de locale/namespace (7 locales × namespaces);
2. achata as chaves de cada locale;
3. usa en como conjunto de referência;
4. falha se faltar ou sobrar qualquer chave;
5. falha se o conjunto de placeholders diferir;
6. imprime locale, namespace e chave exatos do erro.

Além do script, haverá teste unitário que cobre o checker com um bundle
incompleto e um placeholder incompatível. O pipeline executará o checker
antes da suíte normal. O teste não deve aceitar fallback como sucesso.

A cobertura de strings visíveis será feita por inventário e revisão de
git grep; texto literal permitido fica limitado a marca, conteúdo de negócio,
nomes de ícones/rotas e valores técnicos. Traduções não podem ser aprovadas
com TODO, string vazia ou cópia automática não revisada.

## 8. Critérios de aceite

### Banco e domínio

- migration manual não contém drop/recreate de tabela nem perda de dados;
- row counts, FKs, índices, defaults, soft delete e relacionamento pedido/venda
  permanecem íntegros no Postgres efêmero;
- Prisma Client gerado expõe somente os nomes ingleses definidos neste spec;
- SQLite antigo do mobile sobe para o schema novo preservando fila, produtos,
  pedidos, vendas e impressoras;
- não resta identificador português no domínio interno fora dos adapters de
  compatibilidade, migration histórica e conteúdo de negócio explicitamente
  preservado.

### Compatibilidade e sync

- build antigo do payload de sync continua sendo aceito;
- push/pull cobre produto novo/atualizado/deletado, pedido, venda, item,
  criado_por, vendedor, watermarks e ignorados;
- um item inválido é reportado e não trava os demais itens da transação;
- endpoint, autenticação, RBAC e escopo de estabelecimento permanecem
  corretos após o rename;
- respostas/erros usam adapter/código, não comparação espalhada de texto.

### UI e i18n

- front e mobile têm os sete bundles completos e passam i18n:check;
- en funciona como idioma-base, preferência persiste e locale desconhecido
  cai para en;
- textos visíveis, status, validações, toasts, accessibility labels, títulos
  nativos e mensagens de sync estão cobertos;
- datas, moeda, números e plurals mudam com o locale;
- ar altera dir, layout, alinhamento, ícones direcionais e teclado no web e no
  Android real;
- tsc --noEmit, suíte normal e builds dos três repositórios passam.

## 9. Validação obrigatória futura

| Repositório | Comandos mínimos |
|---|---|
| API | bunx prisma generate; bun test --isolate --parallel; bunx tsc --noEmit |
| Front | bun run i18n:check; bun test; bun run build |
| Mobile | node scripts/check-i18n.mjs; npx jest --watchAll=false --runInBand; npx tsc --noEmit; npx expo run:android |

A validação Android precisa abrir o app nativo em emulador ou aparelho; Metro
isolado não prova RTL, linking de expo-localization/AsyncStorage nem o
upgrade do SQLite.

## 10. Fora do escopo

- executar migration em qualquer banco nesta rodada de brainstorm;
- alterar ou traduzir dados reais de clientes/estabelecimentos;
- renomear URLs públicas ou criar API v2;
- criar um quarto repositório/package compartilhado;
- impressão web da Fase 6.9;
- recuperação de senha/2FA, fiscal, LGPD ou mudanças de domínio de fases
  posteriores;
- deploy, merge, push, PR ou promoção para main.

## Referências técnicas

- https://react.i18next.com/getting-started
- https://www.i18next.com/principles/namespaces
- https://www.i18next.com/overview/configuration-options
- https://docs.expo.dev/guides/localization/
- https://reactnative.dev/docs/i18nmanager
