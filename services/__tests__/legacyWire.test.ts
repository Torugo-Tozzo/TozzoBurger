import {
  fromLegacySyncResponse,
  fromLegacyUser,
  toLegacySyncPayload,
} from '../legacyWire';

describe('legacy sync wire adapter', () => {
  it('serializes canonical entities with the legacy Portuguese wire keys', () => {
    const payload = toLegacySyncPayload({
      products: [{
        id: 'product-1',
        name: 'Burger',
        price: 25,
        productTypeId: 'type-1',
        ingredients: 'bread',
        updated_at: 10,
      }],
      orders: [{
        id: 'order-1',
        total: 25,
        openedAt: '2026-08-24T12:00:00.000Z',
        customerName: 'Ana',
        status: 'CLOSED',
        items: [{ productId: 'product-1', quantity: 2 }],
      }],
      sales: [{
        id: 'sale-1',
        total: 50,
        soldAt: '2026-08-24T12:01:00.000Z',
        customerName: 'Ana',
        isCancelled: false,
        items: [{ productId: 'product-1', quantity: 2 }],
      }],
    });

    expect(payload).toEqual({
      produtos: [expect.objectContaining({ id: 'product-1', nome: 'Burger', preco: 25, tipoProdutoId: 'type-1', ingredientes: 'bread' })],
      pedidos: [expect.objectContaining({ id: 'order-1', horario: '2026-08-24T12:00:00.000Z', cliente: 'Ana', status: 'FECHADO', itens: [{ produtoId: 'product-1', quantidade: 2 }] })],
      vendas: [expect.objectContaining({ id: 'sale-1', horario: '2026-08-24T12:01:00.000Z', cliente: 'Ana', excluida: false, itens: [{ produtoId: 'product-1', quantidade: 2 }] })],
    });
  });

  it('normalizes legacy responses without translating business strings', () => {
    const response = fromLegacySyncResponse({
      produtos: [{ id: 'product-1', nome: 'X-Burger', preco: '12.5', ingredientes: 'picles' }],
      pedidos: [{ id: 'order-1', horario: '2026-08-24T12:00:00.000Z', status: 'EM_PREPARO', itens: [{ produtoId: 'product-1', quantidade: '2' }] }],
      vendas: [{ id: 'sale-1', horario: '2026-08-24T12:01:00.000Z', excluida: 1, itens: [] }],
    });

    expect(response.products[0]).toMatchObject({ id: 'product-1', name: 'X-Burger', price: 12.5, ingredients: 'picles' });
    expect(response.orders[0]).toMatchObject({ id: 'order-1', openedAt: '2026-08-24T12:00:00.000Z', status: 'IN_PREPARATION', items: [{ productId: 'product-1', quantity: 2 }] });
    expect(response.sales[0]).toMatchObject({ id: 'sale-1', soldAt: '2026-08-24T12:01:00.000Z', isCancelled: true });
  });

  it('normalizes legacy user roles before they reach RBAC', () => {
    expect(fromLegacyUser({ id: 'u1', role: 'DONO' })).toMatchObject({ role: 'OWNER' });
  });
});
