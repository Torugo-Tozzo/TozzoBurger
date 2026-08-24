import type { OrderStatus } from '@/database/types/Order';

const statusFromLegacy: Record<string, OrderStatus> = {
  ABERTO: 'OPEN',
  OPEN: 'OPEN',
  EM_PREPARO: 'IN_PREPARATION',
  IN_PREPARATION: 'IN_PREPARATION',
  ENTREGANDO: 'DELIVERING',
  DELIVERING: 'DELIVERING',
  FECHADO: 'CLOSED',
  CLOSED: 'CLOSED',
  NAO_FECHADOS: 'NOT_CLOSED',
  NOT_CLOSED: 'NOT_CLOSED',
};

const statusToLegacy: Record<OrderStatus, string> = {
  OPEN: 'ABERTO',
  IN_PREPARATION: 'EM_PREPARO',
  DELIVERING: 'ENTREGANDO',
  CLOSED: 'FECHADO',
  NOT_CLOSED: 'NAO_FECHADOS',
};

const roleFromLegacy: Record<string, string> = {
  DONO: 'OWNER',
  OWNER: 'OWNER',
  GERENTE: 'MANAGER',
  MANAGER: 'MANAGER',
  FUNCIONARIO: 'EMPLOYEE',
  EMPLOYEE: 'EMPLOYEE',
  CLIENTE: 'CUSTOMER',
  CUSTOMER: 'CUSTOMER',
};

const asString = (value: unknown): string | undefined => value == null ? undefined : String(value);

export function normalizeOrderStatus(value: unknown): OrderStatus {
  return statusFromLegacy[String(value ?? '').trim().toUpperCase()] ?? 'OPEN';
}

function mapItemFromWire(item: any) {
  return {
    id: asString(item?.id),
    productId: asString(item?.productId ?? item?.produtoId) ?? '',
    quantity: Number(item?.quantity ?? item?.quantidade ?? 0),
  };
}

function mapItemToWire(item: any) {
  return {
    ...(item?.id == null ? {} : { id: String(item.id) }),
    produtoId: String(item?.productId ?? item?.produtoId),
    quantidade: Number(item?.quantity ?? item?.quantidade ?? 0),
  };
}

export function fromLegacyProduct(value: any) {
  return {
    ...value,
    id: asString(value?.id) ?? '',
    name: value?.name ?? value?.nome ?? '',
    price: Number(value?.price ?? value?.preco ?? 0),
    productTypeId: value?.productTypeId ?? value?.tipoProdutoId ?? null,
    sourceProductId: value?.sourceProductId ?? value?.origemProdutoId ?? null,
    ingredients: value?.ingredients ?? value?.ingredientes ?? null,
    updated_at: value?.updated_at ?? value?.updatedAt ?? Date.now(),
    deleted_at: value?.deleted_at ?? value?.deletedAt ?? null,
  };
}

export function fromLegacyOrder(value: any) {
  return {
    ...value,
    id: asString(value?.id) ?? '',
    total: Number(value?.total ?? 0),
    openedAt: value?.openedAt ?? value?.horario ?? new Date().toISOString(),
    customerName: value?.customerName ?? value?.cliente ?? null,
    status: normalizeOrderStatus(value?.status),
    createdBy: value?.createdBy ?? value?.criado_por ?? value?.usuarioVendedorId ?? value?.vendedor?.id ?? null,
    createdByName: value?.createdByName ?? value?.criado_por_nome ?? value?.vendedor?.nome ?? value?.vendedor?.name ?? null,
    updated_at: value?.updated_at ?? value?.updatedAt ?? Date.now(),
    deleted_at: value?.deleted_at ?? value?.deletedAt ?? null,
    items: (value?.items ?? value?.itens ?? value?.orderItems ?? value?.itensPedido ?? []).map(mapItemFromWire),
  };
}

export function fromLegacySale(value: any) {
  return {
    ...value,
    id: asString(value?.id) ?? '',
    total: Number(value?.total ?? 0),
    soldAt: value?.soldAt ?? value?.horario ?? new Date().toISOString(),
    customerName: value?.customerName ?? value?.cliente ?? null,
    isCancelled: value?.isCancelled === true || value?.isCancelled === 1 || value?.isCancelled === '1' || value?.excluida === true || value?.excluida === 1,
    createdBy: value?.createdBy ?? value?.criado_por ?? value?.usuarioVendedorId ?? value?.vendedor?.id ?? null,
    createdByName: value?.createdByName ?? value?.criado_por_nome ?? value?.vendedor?.nome ?? value?.vendedor?.name ?? null,
    updated_at: value?.updated_at ?? value?.updatedAt ?? Date.now(),
    deleted_at: value?.deleted_at ?? value?.deletedAt ?? null,
    items: (value?.items ?? value?.itens ?? value?.saleItems ?? value?.itensVenda ?? []).map(mapItemFromWire),
  };
}

export function fromLegacyUser(value: any) {
  return {
    ...value,
    id: value?.id,
    name: value?.name ?? value?.nome ?? '',
    phone: value?.phone ?? value?.telefone ?? null,
    establishmentId: value?.establishmentId ?? value?.estabelecimentoId ?? null,
    establishmentName: value?.establishmentName ?? value?.nomeEstabelecimento ?? value?.estabelecimento?.nomeFantasia ?? null,
    role: roleFromLegacy[String(value?.role ?? '').trim().toUpperCase()] ?? 'EMPLOYEE',
  };
}

export function toLegacySyncPayload(value: any) {
  const products = (value?.products ?? value?.produtos ?? []).map((product: any) => ({
    id: String(product.id),
    nome: product.name ?? product.nome ?? '',
    preco: Number(product.price ?? product.preco ?? 0),
    tipoProdutoId: product.productTypeId ?? product.tipoProdutoId ?? null,
    origemProdutoId: product.sourceProductId ?? product.origemProdutoId ?? null,
    ingredientes: product.ingredients ?? product.ingredientes ?? null,
    updated_at: product.updated_at ?? product.updatedAt,
    deleted_at: product.deleted_at ?? product.deletedAt,
  }));
  const orders = (value?.orders ?? value?.pedidos ?? []).map((order: any) => ({
    id: String(order.id),
    total: Number(order.total ?? 0),
    horario: order.openedAt ?? order.horario,
    cliente: order.customerName ?? order.cliente ?? null,
    status: statusToLegacy[normalizeOrderStatus(order.status)],
    criado_por: order.createdBy ?? order.criado_por ?? null,
    criado_por_nome: order.createdByName ?? order.criado_por_nome ?? null,
    updated_at: order.updated_at ?? order.updatedAt,
    deleted_at: order.deleted_at ?? order.deletedAt,
    itens: (order.items ?? order.itens ?? []).map(mapItemToWire),
  }));
  const sales = (value?.sales ?? value?.vendas ?? []).map((sale: any) => ({
    id: String(sale.id),
    total: Number(sale.total ?? 0),
    horario: sale.soldAt ?? sale.horario,
    cliente: sale.customerName ?? sale.cliente ?? null,
    excluida: Boolean(sale.isCancelled ?? sale.excluida),
    pedidoId: sale.orderId ?? sale.pedidoId ?? null,
    criado_por: sale.createdBy ?? sale.criado_por ?? null,
    criado_por_nome: sale.createdByName ?? sale.criado_por_nome ?? null,
    updated_at: sale.updated_at ?? sale.updatedAt,
    itens: (sale.items ?? sale.itens ?? []).map(mapItemToWire),
  }));
  return { produtos: products, pedidos: orders, vendas: sales };
}

export function fromLegacySyncResponse(value: any) {
  return {
    ...value,
    productIdMap: value?.productIdMap ?? value?.mapaProdutos ?? {},
    orderIdMap: value?.orderIdMap ?? value?.mapaPedidos ?? {},
    saleIdMap: value?.saleIdMap ?? value?.mapaVendas ?? {},
    ignored: value?.ignored ?? value?.ignorados ?? [],
    productTypes: (value?.productTypes ?? value?.tiposProduto ?? []).map((item: any) => ({
      ...item,
      description: item?.description ?? item?.descricao ?? '',
      color: item?.color ?? item?.cor ?? '#9E9E9E',
      isActive: item?.isActive ?? item?.ativo ?? true,
      updated_at: item?.updated_at ?? item?.updatedAt ?? Date.now(),
      deleted_at: item?.deleted_at ?? item?.deletedAt ?? null,
    })),
    products: (value?.products ?? value?.produtos ?? []).map(fromLegacyProduct),
    orders: (value?.orders ?? value?.pedidos ?? []).map(fromLegacyOrder),
    sales: (value?.sales ?? value?.vendas ?? []).map(fromLegacySale),
  };
}
