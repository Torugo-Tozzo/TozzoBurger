import React from 'react';

import OnboardingScreen from '@/app/onboarding';
import { useAuth } from '@/context/AuthContext';
import { useCategoryOnboardingAccess } from '@/hooks/useCategoryOnboardingAccess';
import type { EstablishmentCategory } from '@/database/watermelon/categorySeeds';

type Props = {
  children: React.ReactNode;
};

export default function CategoryOnboardingGate({ children }: Props) {
  const { token, user } = useAuth();
  const access = useCategoryOnboardingAccess({
    token,
    role: user?.role,
    establishmentId: user?.establishmentId,
  });

  if (access.allowed && access.establishment) {
    return (
      <OnboardingScreen
        token={token}
        establishmentId={access.establishment.id}
        knownEstablishment={access.establishment}
        onCompleted={(category: EstablishmentCategory) => {
          access.markCategoryConfigured(category);
        }}
      />
    );
  }

  return <>{children}</>;
}
