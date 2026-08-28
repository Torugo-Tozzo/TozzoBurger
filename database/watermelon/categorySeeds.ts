export const CATEGORY_OPTIONS = [
  'HAMBURGUERIA',
  'PIZZARIA',
  'SORVETERIA',
  'CAFETERIA',
  'LANCHONETE',
  'OUTRO',
] as const;

export type EstablishmentCategory = (typeof CATEGORY_OPTIONS)[number];

export const CATEGORY_SEEDS: Readonly<Record<EstablishmentCategory, readonly string[]>> = {
  HAMBURGUERIA: ['Lanches', 'Bebidas', 'Porções', 'Sobremesas'],
  PIZZARIA: ['Pizzas', 'Bebidas', 'Entradas', 'Sobremesas'],
  SORVETERIA: ['Sorvetes', 'Açaí', 'Coberturas', 'Bebidas'],
  CAFETERIA: ['Cafés', 'Bebidas', 'Salgados', 'Doces'],
  LANCHONETE: ['Lanches', 'Bebidas', 'Porções', 'Doces'],
  OUTRO: ['Produtos', 'Bebidas', 'Serviços', 'Outros'],
};

export function getCategorySeed(category: EstablishmentCategory): string[] {
  return [...CATEGORY_SEEDS[category]];
}
