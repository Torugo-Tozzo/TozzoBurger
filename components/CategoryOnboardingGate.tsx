import React, { useEffect, useState } from 'react';

import OnboardingScreen from '@/app/onboarding';
import { useAuth } from '@/context/AuthContext';
import { getEstablishment, type Establishment } from '@/services/api';
import type { EstablishmentCategory } from '@/database/watermelon/categorySeeds';

type Props = {
  children: React.ReactNode;
};

export default function CategoryOnboardingGate({ children }: Props) {
  const { token, user } = useAuth();
  const role = user?.role;
  const establishmentId = user?.establishmentId;
  const isOwner = role === 'OWNER';
  const eligible = Boolean(token && isOwner && establishmentId !== null && establishmentId !== undefined);
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!eligible || !token) {
      setEstablishment(null);
      setChecking(false);
      return () => {
        mounted = false;
      };
    }

    setChecking(true);
    setEstablishment(null);
    getEstablishment(token)
      .then((nextEstablishment) => {
        if (mounted) setEstablishment(nextEstablishment);
      })
      .catch((error) => {
        if (mounted) {
          console.warn('Could not load establishment category', error);
          setEstablishment(null);
        }
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, [eligible, establishmentId, token]);

  if (
    eligible
    && !checking
    && establishment?.category === null
    && establishment.id !== null
    && establishment.id !== undefined
  ) {
    return (
      <OnboardingScreen
        token={token}
        establishmentId={establishment.id}
        onCompleted={(category: EstablishmentCategory) => {
          setEstablishment((current) => current ? { ...current, category } : current);
        }}
      />
    );
  }

  return <>{children}</>;
}
