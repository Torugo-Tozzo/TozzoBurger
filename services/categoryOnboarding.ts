import type { EstablishmentCategory } from '@/database/watermelon/categorySeeds';
import { createProductType, updateEstablishmentCategory } from '@/services/api';
import { runWithLock } from '@/database/syncGuard';

export const DEFAULT_PRODUCT_TYPE_COLOR = '#9E9E9E';

export type CompleteCategoryOnboardingInput = {
  token: string;
  establishmentId: string | number;
  category: EstablishmentCategory;
  productTypeDescriptions: readonly string[];
};

export async function completeCategoryOnboarding({
  token,
  establishmentId,
  category,
  productTypeDescriptions,
}: CompleteCategoryOnboardingInput): Promise<void> {
  await updateEstablishmentCategory(token, establishmentId, category);

  for (const rawDescription of productTypeDescriptions) {
    const description = rawDescription.trim();
    if (description.length === 0) continue;

    await createProductType(token, {
      description,
      color: DEFAULT_PRODUCT_TYPE_COLOR,
    });
  }

  await runWithLock(async () => {
    const { synchronizeWithServer } = require('@/database/watermelon/sync') as typeof import('@/database/watermelon/sync');
    return synchronizeWithServer(token, establishmentId);
  });
}
