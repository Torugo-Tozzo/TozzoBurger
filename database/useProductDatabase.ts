import { Q } from '@nozbe/watermelondb';
import type { Clause } from '@nozbe/watermelondb/QueryDescription';

import { useAuth } from '../context/AuthContext';
import type { Product as ProductData } from './types/Product';
import { markChanged } from './tableWatermark';
import { database } from './watermelon/database';
import ProductModel from './watermelon/models/Product';
import ProductTypeModel from './watermelon/models/ProductType';

type ProductInput = ProductData & {
  establishmentId?: string | number | null;
};

function toProductData(product: ProductModel): ProductData {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    productTypeId: product.productTypeId,
    sourceProductId: product.sourceProductId,
    ingredients: product.ingredients,
    updated_at: product.updatedAt.getTime(),
    deleted_at: null,
    sync_status: product.syncStatus === 'synced' ? 'synced' : 'pending',
  };
}

function productCollection() {
  return database.get<ProductModel>('products');
}

function activeProductTypeClause() {
  return Q.on('product_types', Q.where('is_active', true));
}

function asEstablishmentId(value: string | number | null | undefined): string {
  return value == null || value === '' ? '' : String(value);
}

function normalizeEstablishmentId(value: string | number | null | undefined): string | null {
  const normalized = asEstablishmentId(value);
  return normalized === '' ? null : normalized;
}

async function findProduct(id: string, establishmentId: string | null): Promise<ProductModel | null> {
  if (!establishmentId) return null;

  const [product] = await productCollection()
    .query(Q.where('id', id), Q.where('establishment_id', establishmentId))
    .fetch();
  return product ?? null;
}

export function useProductDatabase() {
  const { user } = useAuth();
  const currentEstablishmentId = normalizeEstablishmentId(user?.establishmentId);

  async function create(data: Omit<ProductData, 'id' | 'updated_at'>) {
    const input = data as ProductInput;
    if (!currentEstablishmentId) {
      throw new Error('Cannot create a product without an authenticated establishment');
    }

    const now = new Date();
    const product = await database.write(() => productCollection().create((record) => {
      record.name = input.name;
      record.price = input.price;
      record.productTypeId = input.productTypeId == null ? null : String(input.productTypeId);
      record.sourceProductId = input.sourceProductId ?? null;
      record.ingredients = input.ingredients ?? null;
      record.establishmentId = currentEstablishmentId;
      record.createdAt = now;
      record.updatedAt = now;
    }));

    markChanged('products');
    return { id: product.id };
  }

  async function createFromSync(data: ProductData) {
    const input = data as ProductInput & { created_at?: number };
    const updatedAt = Number.isFinite(input.updated_at) ? input.updated_at : Date.now();
    const createdAt = Number.isFinite(input.created_at) ? input.created_at : updatedAt;
    const products = productCollection();
    const preparedProduct = products.prepareCreateFromDirtyRaw({
      id: input.id,
      _status: 'synced',
      _changed: '',
      name: input.name,
      price: input.price,
      product_type_id: input.productTypeId == null ? null : String(input.productTypeId),
      source_product_id: input.sourceProductId ?? null,
      ingredients: input.ingredients ?? null,
      establishment_id: asEstablishmentId(input.establishmentId) || currentEstablishmentId || '',
      created_at: createdAt,
      updated_at: updatedAt,
    });

    await database.write(() => database.batch(preparedProduct));
    markChanged('products');
    return { id: input.id };
  }

  async function searchByName(name: string, limit?: number, offset?: number) {
    if (!currentEstablishmentId) return [];

    const clauses: Clause[] = [
      Q.where('establishment_id', currentEstablishmentId),
      activeProductTypeClause(),
      Q.where('name', Q.like(`%${Q.sanitizeLikeString(name)}%`)),
    ];

    if (limit !== undefined) {
      clauses.push(Q.sortBy('name', Q.asc), Q.sortBy('id', Q.asc), Q.take(limit), Q.skip(offset ?? 0));
    }

    const products = await productCollection().query(...clauses).fetch();
    return products.map(toProductData);
  }

  async function update(data: Omit<ProductData, 'updated_at'>) {
    const product = await findProduct(data.id, currentEstablishmentId);

    if (product) {
      await database.write(() => product.update((record) => {
        record.name = data.name;
        record.price = data.price;
        record.productTypeId = data.productTypeId == null ? null : String(data.productTypeId);
        record.ingredients = data.ingredients ?? null;
      }));
    }

    markChanged('products');
  }

  async function remove(id: string) {
    const product = await findProduct(id, currentEstablishmentId);

    if (product) {
      await database.write(() => product.markAsDeleted());
    }

    markChanged('products');
  }

  async function show(id: string) {
    const product = await findProduct(id, currentEstablishmentId);
    return product ? toProductData(product) : null;
  }

  async function showAdd(id: string) {
    return show(id);
  }

  async function getProductTypes() {
    const productTypes = await database
      .get<ProductTypeModel>('product_types')
      .query(Q.where('is_active', true), Q.sortBy('description', Q.asc))
      .fetch();

    return productTypes.map((productType) => ({
      id: productType.id,
      description: productType.description,
    }));
  }

  async function filterByProductType(productTypeId: string, limit: number, offset: number): Promise<ProductData[]> {
    if (!currentEstablishmentId) return [];

    const products = await productCollection()
      .query(
        Q.where('establishment_id', currentEstablishmentId),
        activeProductTypeClause(),
        Q.where('product_type_id', productTypeId),
        Q.sortBy('name', Q.asc),
        Q.sortBy('id', Q.asc),
        Q.take(limit),
        Q.skip(offset),
      )
      .fetch();

    return products.map(toProductData);
  }

  async function searchBySourceProductId(productId: string): Promise<ProductData[]> {
    if (!currentEstablishmentId) return [];

    const products = await productCollection()
      .query(
        Q.where('establishment_id', currentEstablishmentId),
        activeProductTypeClause(),
        Q.where('source_product_id', productId),
      )
      .fetch();

    return products.map(toProductData);
  }

  return {
    create,
    createFromSync,
    searchByName,
    update,
    remove,
    show,
    getProductTypes,
    filterByProductType,
    searchBySourceProductId,
    /** @deprecated Use getProductTypes. */
    getTipoProdutos: getProductTypes,
    /** @deprecated Use filterByProductType. */
    filterByTipo: filterByProductType,
    /** @deprecated Use searchBySourceProductId. */
    searchOrigemProdutoId: searchBySourceProductId,
    showAdd,
  };
}
