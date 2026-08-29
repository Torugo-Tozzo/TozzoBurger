import { useEffect, useState } from 'react';

import { getEstablishment, type Establishment } from '@/services/api';

type EstablishmentId = string | number;

type Options = {
  token: string | null | undefined;
  role: string | null | undefined;
  establishmentId: EstablishmentId | null | undefined;
  knownEstablishment?: Establishment | null;
};

export type CategoryOnboardingAccess = {
  establishment: Establishment | null;
  checking: boolean;
  allowed: boolean;
  shouldRedirect: boolean;
  markCategoryConfigured: (category: Establishment['category']) => void;
};

export function useCategoryOnboardingAccess({
  token,
  role,
  establishmentId,
  knownEstablishment,
}: Options): CategoryOnboardingAccess {
  const isOwner = role === 'OWNER';
  const eligible = Boolean(token && isOwner && establishmentId !== null && establishmentId !== undefined);
  const hasKnownEstablishment = knownEstablishment !== undefined;
  const [establishment, setEstablishment] = useState<Establishment | null>(knownEstablishment ?? null);
  const [checking, setChecking] = useState(eligible && !hasKnownEstablishment);

  useEffect(() => {
    let mounted = true;

    if (hasKnownEstablishment) {
      setEstablishment(knownEstablishment ?? null);
      setChecking(false);
      return () => {
        mounted = false;
      };
    }

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
  }, [eligible, establishmentId, hasKnownEstablishment, knownEstablishment, token]);

  const hasEstablishmentId = establishment?.id !== null && establishment?.id !== undefined;
  const allowed = eligible && !checking && establishment?.category === null && hasEstablishmentId;
  const markCategoryConfigured = (category: Establishment['category']) => {
    setEstablishment((current) => current ? { ...current, category } : current);
  };

  return {
    establishment,
    checking,
    allowed,
    shouldRedirect: !checking && !allowed,
    markCategoryConfigured,
  };
}
