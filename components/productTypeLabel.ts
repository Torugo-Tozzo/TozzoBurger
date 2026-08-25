type Translate = (key: string, options?: Record<string, unknown>) => string;

const STANDARD_PRODUCT_TYPE_KEYS: Record<number, string> = {
  1: 'catalog.burger',
  2: 'catalog.artisanalBurger',
  3: 'catalog.chicken',
  4: 'catalog.hotDog',
  5: 'catalog.drink',
  6: 'catalog.fries',
  7: 'catalog.extra',
  8: 'catalog.other',
  9: 'catalog.pizza',
  10: 'catalog.sushi',
};

/** Translate only stable built-in category IDs; persisted custom descriptions stay untouched. */
export function getProductTypeLabel(id: number, description: string | undefined, t: Translate): string {
  const key = STANDARD_PRODUCT_TYPE_KEYS[id];
  if (key) return t(key);
  if (description) return description;
  return t('catalog.typeLabel', { id });
}
