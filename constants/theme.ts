import { ProductTypeId } from './productTypeIds';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 0,
  md: 10,
  lg: 0,
  full: 0,
};

export const type = {
  caption: 12,
  bodySm: 14,
  body: 16,
  subtitle: 18,
  title: 20,
  heading: 24,
};

export const tipoColors: Record<string, string> = {
  [ProductTypeId.BURGER]: '#ef4444',
  [ProductTypeId.ARTISAN_BURGER]: '#f59e0b',
  [ProductTypeId.CHICKEN]: '#10b981',
  [ProductTypeId.HOT_DOG]: '#3b82f6',
  [ProductTypeId.DRINK]: '#8b5cf6',
  [ProductTypeId.FRENCH_FRIES]: '#ec4899',
  [ProductTypeId.ADD_ON]: '#14b8a6',
  [ProductTypeId.OTHER]: '#06b6d4',
};
