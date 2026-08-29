import { ProductTypeId } from '@/constants/productTypeIds';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const STANDARD_PRODUCT_TYPE_KEYS: Record<string, string> = {
  [ProductTypeId.BURGER]: 'catalog.burger',
  [ProductTypeId.ARTISAN_BURGER]: 'catalog.artisanalBurger',
  [ProductTypeId.CHICKEN]: 'catalog.chicken',
  [ProductTypeId.HOT_DOG]: 'catalog.hotDog',
  [ProductTypeId.DRINK]: 'catalog.drink',
  [ProductTypeId.FRENCH_FRIES]: 'catalog.fries',
  [ProductTypeId.ADD_ON]: 'catalog.extra',
  [ProductTypeId.OTHER]: 'catalog.other',
  [ProductTypeId.PIZZA]: 'catalog.pizza',
  [ProductTypeId.SUSHI]: 'catalog.sushi',
};

/** Translate only stable built-in category IDs; persisted custom descriptions stay untouched. */
export function getProductTypeLabel(id: string | null | undefined, description: string | undefined, t: Translate): string {
  const key = id ? STANDARD_PRODUCT_TYPE_KEYS[id] : undefined;
  if (key) return t(key);
  if (description) return description;
  return t('catalog.typeLabel', { id });
}
