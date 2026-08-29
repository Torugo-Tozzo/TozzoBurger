import {
  CATEGORY_OPTIONS,
  CATEGORY_SEEDS,
  getCategorySeed,
} from '@/database/watermelon/categorySeeds';

describe('category seed configuration', () => {
  it('defines the six API categories with non-empty, business-relevant suggestions', () => {
    expect(CATEGORY_OPTIONS).toEqual([
      'HAMBURGUERIA',
      'PIZZARIA',
      'SORVETERIA',
      'CAFETERIA',
      'LANCHONETE',
      'OUTRO',
    ]);

    for (const category of CATEGORY_OPTIONS) {
      expect(CATEGORY_SEEDS[category].length).toBeGreaterThan(0);
      expect(new Set(CATEGORY_SEEDS[category]).size).toBe(CATEGORY_SEEDS[category].length);
      expect(CATEGORY_SEEDS[category].every((name) => name.trim().length > 0)).toBe(true);
    }
  });

  it('returns the hamburger suggestion as a fresh editable list', () => {
    const suggestions = getCategorySeed('HAMBURGUERIA');

    expect(suggestions).toEqual(['Lanches', 'Bebidas', 'Porções', 'Sobremesas']);
    suggestions.pop();
    expect(getCategorySeed('HAMBURGUERIA')).toEqual([
      'Lanches',
      'Bebidas',
      'Porções',
      'Sobremesas',
    ]);
  });
});
