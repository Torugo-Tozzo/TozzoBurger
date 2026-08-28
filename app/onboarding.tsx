import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import {
  CATEGORY_OPTIONS,
  type EstablishmentCategory,
  getCategorySeed,
} from '@/database/watermelon/categorySeeds';
import {
  completeCategoryOnboarding,
} from '@/services/categoryOnboarding';
import { Button } from '@/components/ui/Button';

type EstablishmentId = string | number;

export type OnboardingScreenProps = {
  token?: string | null;
  establishmentId?: EstablishmentId | null;
  onCompleted?: (category: EstablishmentCategory) => void;
};

export default function OnboardingScreen({
  token: tokenOverride,
  establishmentId: establishmentIdOverride,
  onCompleted,
}: OnboardingScreenProps = {}) {
  const { token: authToken, user } = useAuth();
  const { t } = useTranslation();
  const token = tokenOverride ?? authToken;
  const establishmentId = establishmentIdOverride ?? user?.establishmentId;
  const [category, setCategory] = useState<EstablishmentCategory | null>(null);
  const [productTypeDescriptions, setProductTypeDescriptions] = useState<string[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseCategory = (nextCategory: EstablishmentCategory) => {
    setCategory(nextCategory);
    setProductTypeDescriptions(getCategorySeed(nextCategory));
    setNewDescription('');
    setError(null);
  };

  const addDescription = () => {
    const description = newDescription.trim();
    if (description.length === 0) return;

    setProductTypeDescriptions((current) => (
      current.includes(description) ? current : [...current, description]
    ));
    setNewDescription('');
  };

  const removeDescription = (index: number) => {
    setProductTypeDescriptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const confirm = async () => {
    if (!category || !token || establishmentId === null || establishmentId === undefined) {
      setError(t('common.onboardingSaveError'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await completeCategoryOnboarding({
        token,
        establishmentId,
        category,
        productTypeDescriptions,
      });
      onCompleted?.(category);
    } catch (confirmationError) {
      console.warn('Category onboarding failed', confirmationError);
      setError(t('common.onboardingSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('common.onboardingTitle')}</Text>
      <Text style={styles.subtitle}>{t('common.onboardingChooseCategory')}</Text>

      <View style={styles.categories}>
        {CATEGORY_OPTIONS.map((option) => {
          const selected = category === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={option}
              onPress={() => chooseCategory(option)}
              style={[styles.category, selected && styles.categorySelected]}
            >
              <Text style={styles.categoryText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      {category && (
        <View style={styles.editor}>
          <Text style={styles.sectionTitle}>{t('common.onboardingSuggestedTypes')}</Text>
          {productTypeDescriptions.map((description, index) => (
            <View key={`${description}-${index}`} style={styles.typeRow}>
              <Text style={styles.typeText}>{description}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`onboarding.removeType:${description}`}
                onPress={() => removeDescription(index)}
                style={styles.removeButton}
              >
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="onboarding.typeInput"
              placeholder={t('common.onboardingTypePlaceholder')}
              value={newDescription}
              onChangeText={setNewDescription}
              style={styles.input}
            />
            <Button
              accessibilityLabel="onboarding.addType"
              title={t('common.onboardingAddType')}
              onPress={addDescription}
              variant="outline"
              style={styles.addButton}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            accessibilityLabel="onboarding.confirm"
            title={saving ? t('common.onboardingSaving') : t('common.onboardingConfirm')}
            onPress={confirm}
            loading={saving}
            disabled={saving}
            style={styles.confirmButton}
          />
          <Button
            accessibilityLabel="onboarding.changeCategory"
            title={t('common.onboardingChangeCategory')}
            onPress={() => setCategory(null)}
            variant="outline"
            disabled={saving}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
  },
  categories: {
    gap: 10,
  },
  category: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 8,
    padding: 14,
  },
  categorySelected: {
    backgroundColor: '#e8e8e8',
  },
  categoryText: {
    color: '#000',
    fontWeight: '600',
  },
  editor: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#000',
  },
  typeRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#999',
  },
  typeText: {
    color: '#000',
    fontSize: 16,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeText: {
    color: '#ef4444',
    fontSize: 24,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#000',
  },
  addButton: {
    minHeight: 48,
  },
  confirmButton: {
    marginTop: 20,
    marginBottom: 10,
  },
  error: {
    color: '#b91c1c',
    marginTop: 12,
  },
});
