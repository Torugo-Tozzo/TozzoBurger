import { Q } from '@nozbe/watermelondb';
import type { Clause } from '@nozbe/watermelondb/QueryDescription';

import type { Product as ProductData } from './types/Product';
import { markChanged } from './tableWatermark';
import { database } from './watermelon/database';
import ProductModel from './watermelon/models/Product';
import ProductTypeModel from './watermelon/models/ProductType';

type ProductInput = ProductData & {
  establishmentId?: string | number | null;
};

function toLegacyNumber(value: string | null): number {
  if (value == null || value === '') return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProductData(product: ProductModel): ProductData {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    productTypeId: toLegacyNumber(product.productTypeId),
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

async function findProduct(id: string): Promise<ProductModel | null> {
  const [product] = await productCollection().query(Q.where('id', id)).fetch();
  return product ?? null;
}

function activeProductTypeClause() {
  return Q.on('product_types', Q.where('is_active', true));
}

function asEstablishmentId(data: ProductInput): string {
  const establishmentId = data.establishmentId;
  return establishmentId == null ? '' : String(establishmentId);
}

export function useProductDatabase() {
  async function create(data: Omit<ProductData, 'id' | 'updated_at'>) {
    const input = data as ProductInput;
    const now = new Date();
    const product = await database.write(() => productCollection().create((record) => {
      record.name = input.name;
      record.price = input.price;
      record.productTypeId = input.productTypeId == null ? null : String(input.productTypeId);
      record.sourceProductId = input.sourceProductId ?? null;
      record.ingredients = input.ingredients ?? null;
      record.establishmentId = asEstablishmentId(input);
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
      establishment_id: asEstablishmentId(input),
      created_at: createdAt,
      updated_at: updatedAt,
    });

    await database.write(() => database.batch(preparedProduct));
    markChanged('products');
    return { id: input.id };
  }

  async function searchByName(name: string, limit?: number, offset?: number) {
    const clauses: Clause[] = [
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
    const product = await findProduct(data.id);

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
    const product = await findProduct(id);

    if (product) {
      await database.write(() => product.markAsDeleted());
    }

    markChanged('products');
  }

  async function show(id: string) {
    const product = await findProduct(id);
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
      id: toLegacyNumber(productType.id),
      description: productType.description,
    }));
  }

  async function filterByProductType(productTypeId: number, limit: number, offset: number): Promise<ProductData[]> {
    const products = await productCollection()
      .query(
        activeProductTypeClause(),
        Q.where('product_type_id', String(productTypeId)),
        Q.sortBy('name', Q.asc),
        Q.sortBy('id', Q.asc),
        Q.take(limit),
        Q.skip(offset),
      )
      .fetch();

    return products.map(toProductData);
  }

  async function searchBySourceProductId(productId: string): Promise<ProductData[]> {
    const products = await productCollection()
      .query(activeProductTypeClause(), Q.where('source_product_id', productId))
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
