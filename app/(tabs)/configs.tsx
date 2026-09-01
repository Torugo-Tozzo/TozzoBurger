import React, { useState, useEffect } from 'react';
import { Alert, ActivityIndicator, TextInput, StyleSheet, ScrollView, RefreshControl, Linking, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Picker } from '@react-native-picker/picker';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { usePrinterDatabase } from '@/database/usePrinterDatabase'; // Importando o hook de banco de dados
import { listNearbyDevices, connectToDevice, disconnectFromDevice } from '@/useBLE'; // Importando os métodos de BLE
import { useAuth } from '@/context/AuthContext';
import Constants from 'expo-constants';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { useTranslation } from 'react-i18next';
import { radius, spacing } from '@/constants/theme';
import {
  AppLocale,
  LOCALE_NATIVE_NAMES,
  normalizeLocale,
  setLocale,
  SUPPORTED_LOCALES,
} from '@/i18n';
import { PRINTER_WIDTH_PRESETS, PrinterWidthPreset } from '@/constants/printerWidths';
import { getPrinterWidth, setPrinterWidth } from '@/services/printerPreferences';
import * as api from '@/services/api';
import { usePrintLogDatabase } from '@/database/usePrintLogDatabase';
import { getReportCountThisMonth } from '@/services/reportQuota';
import { PRINT_DAILY_LIMIT, REPORT_MONTHLY_LIMIT } from '@/constants/planLimits';

const BluetoothScreen = () => {
  const { setPrinter, getPrinter, removePrinter } = usePrinterDatabase(); // Métodos do banco de dados
  const [devices, setDevices] = useState<any[]>([]); // Dispositivos Bluetooth encontrados
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null); // Impressora conectada (UUID)
  const [isScanning, setIsScanning] = useState(false); // Estado para controlar se está escaneando

  const { user, login, logout, token } = useAuth();
  const isCliente = user?.role === 'CUSTOMER';
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [localeChanging, setLocaleChanging] = useState(false);
  const { t, i18n } = useTranslation();
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>(() => normalizeLocale(i18n.language));
  const [selectedPrinterWidth, setSelectedPrinterWidth] = useState<PrinterWidthPreset>('80mm');
  const [printerWidthChanging, setPrinterWidthChanging] = useState(false);
  const { refreshing, onRefresh } = useSyncRefresh();
  const { countPrintsToday } = usePrintLogDatabase();
  const [planInfo, setPlanInfo] = useState<{ plan: string; deviceCount: number } | null>(null);
  const [printsToday, setPrintsToday] = useState(0);
  const [reportsThisMonth, setReportsThisMonth] = useState(0);

  useEffect(() => {
    setSelectedLocale(normalizeLocale(i18n.language));
  }, [i18n.language]);

  useEffect(() => {
    getPrinterWidth().then(setSelectedPrinterWidth);
  }, []);

  useEffect(() => {
    if (!token || !user?.establishmentId) {
      setPlanInfo(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [establishment, prints, reports] = await Promise.all([
          api.getEstablishment(token),
          countPrintsToday(),
          getReportCountThisMonth(),
        ]);
        if (cancelled) return;

        setPlanInfo({
          plan: typeof establishment?.plan === 'string' ? establishment.plan : 'FREE',
          deviceCount: typeof establishment?._count === 'object' && establishment._count !== null
            && typeof (establishment._count as Record<string, unknown>).devices === 'number'
            ? (establishment._count as Record<string, number>).devices
            : 0,
        });
        setPrintsToday(prints);
        setReportsThisMonth(reports);
      } catch (err) {
        console.warn('Failed to load plan info', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, user?.establishmentId]);

  const handlePrinterWidthChange = async (value: PrinterWidthPreset) => {
    setPrinterWidthChanging(true);
    try {
      const applied = await setPrinterWidth(value);
      setSelectedPrinterWidth(applied);
    } catch (error) {
      console.error('Failed to save printer width preference:', error);
    } finally {
      setPrinterWidthChanging(false);
    }
  };

  const handleLocaleChange = async (nextLocale: AppLocale) => {
    const currentLocale = normalizeLocale(i18n.language);
    if (nextLocale === currentLocale) return;

    setLocaleChanging(true);
    try {
      const appliedLocale = await setLocale(nextLocale);
      setSelectedLocale(appliedLocale);
    } catch (error) {
      console.error('Failed to save language preference:', error);
      setSelectedLocale(normalizeLocale(i18n.language));
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setLocaleChanging(false);
    }
  };

  useEffect(() => {
    // Verifica se já existe uma impressora registrada
    const fetchPrinter = async () => {
      try {
        const printerUUID = await getPrinter(); // Obtém o UUID da impressora
        if (printerUUID && printerUUID.name) {
          setConnectedPrinter(printerUUID.name);
        }
      } catch (error) {
        console.log('Nenhuma impressora registrada.');
      }
    };

    fetchPrinter();
  }, [getPrinter]);

  // Função que escaneia os dispositivos Bluetooth
  const handleScanDevices = async () => {
    setIsScanning(true); // Inicia o carregamento
    try {
      const foundDevices = await listNearbyDevices(); // Obtém os dispositivos encontrados
      if (foundDevices.length === 0) {
        Alert.alert(t('printer.scanEmptyTitle'), t('printer.scanEmptyMessage'));
      } else {
        setDevices(foundDevices); // Atualiza a lista de dispositivos encontrados
      }
    } catch (error) {
      console.error('Erro ao escanear dispositivos:', error);
    } finally {
      setIsScanning(false); // Finaliza o carregamento
    }
  };

  // Função para conectar e registrar uma impressora
  const handleConnect = async (device: any) => {
    try {
      const connectedDevice = await connectToDevice(device.id); // Conecta ao dispositivo

      if (connectedDevice) {
        const disconnected = await disconnectFromDevice(device.id);
        if (!disconnected) return;

        // Quando o dispositivo for conectado, registra o UUID e o name
        await setPrinter(device.id, device.name); // Salva o UUID da impressora no banco de dados
        setConnectedPrinter(device.name || device.id); // Atualiza o estado com o name da impressora conectada
        setDevices([]); // Limpa a lista de dispositivos após conectar a impressora
        Alert.alert(t('common.success'), t('printer.connectedMessage'));
      }
    } catch (error) {
      console.error('Erro ao conectar:', error);
    }
  };

  // Função para remover a impressora conectada
  const handleRemovePrinter = async () => {
    try {
      await removePrinter(); // Remove o UUID da impressora do banco de dados
      setConnectedPrinter(null); // Limpa o estado
      Alert.alert(t('common.success'), t('printer.removed'));
    } catch (error) {
      console.error('Erro ao remover impressora:', error);
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      const ok = await login(email.trim(), senha);
      if (!ok) {
        Alert.alert(t('auth.loginFailedTitle'), t('auth.invalidCredentials'));
      } else {
        setEmail('');
        setSenha('');
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('auth.loginFailed'));
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background, borderColor: 'black', borderWidth: 1 }}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >

      {/* Sections: User / Printer */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }] }>
          <FontAwesome name="user" size={16} color={colors.text} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.account')}</Text>
        </View>
        <View style={styles.sectionContent}>
          {user ? (
            <View style={{ alignItems: 'center' }}>
              <FontAwesome name="user-circle" size={56} color={colors.textMuted} style={styles.userIcon} />
              <Text style={[styles.username, { color: colors.text }]}>{user.name ?? user.email}</Text>
              <View style={{ marginTop: 8 }}>
              <Button title={t('auth.logout')} onPress={() => logout()} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ marginBottom: 8, color: colors.text }}>{t('offline.availableWhenOnline')}</Text>
              <TextInput
                placeholder={t('auth.email')}
                accessibilityLabel={t('auth.email')}
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                placeholder={t('auth.password')}
                accessibilityLabel={t('auth.password')}
                value={senha}
                onChangeText={setSenha}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                secureTextEntry
              />
              <Button title={loginLoading ? t('auth.loggingIn') : t('auth.login')} onPress={handleLogin} disabled={loginLoading} loading={loginLoading} />
            </View>
          )}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }]}>
          <FontAwesome name="language" size={16} color={colors.text} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.language')}</Text>
        </View>
        <View style={styles.sectionContent}>
          <Text style={{ marginBottom: 8, color: colors.text }}>{t('settings.selectLanguage')}</Text>
          <View style={[styles.pickerFrame, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Picker
              selectedValue={selectedLocale}
              onValueChange={(value) => handleLocaleChange(value as AppLocale)}
              enabled={!localeChanging}
              accessibilityLabel={t('settings.selectLanguage')}
              style={{ color: colors.text }}
              dropdownIconColor={colors.text}
            >
              {/* Each option shows the language's own name for itself (not
                  translated into the active UI language) so a speaker of
                  that language recognizes it at a glance in the picker. */}
              {SUPPORTED_LOCALES.map((locale) => (
                <Picker.Item key={locale} label={LOCALE_NATIVE_NAMES[locale]} value={locale} />
              ))}
            </Picker>
          </View>
          <Text style={{ color: colors.textMuted, marginTop: 8 }}>
            {t('settings.currentLanguage')}: {LOCALE_NATIVE_NAMES[selectedLocale]}
          </Text>
        </View>
      </View>

      {!isCliente && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }] }>
            <FontAwesome name="print" size={16} color={colors.text} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.printer')}</Text>
          </View>
          <View style={styles.sectionContent}>
            {connectedPrinter ? (
              <View>
                <Text style={{ fontSize: 18, marginBottom: 10, color: colors.text }}>
                  {t('printer.connectedAs', { name: connectedPrinter })}
                </Text>
                <Button title={t('printer.remove')} onPress={handleRemovePrinter} variant="danger" />
              </View>
            ) : (
              <View>
                <Button title={t('printer.add')} onPress={handleScanDevices} />
              </View>
            )}
            <View style={{ marginTop: 16 }}>
              <Text style={{ marginBottom: 8, color: colors.text }}>{t('printer.paperWidth')}</Text>
              <View style={[styles.pickerFrame, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Picker
                  selectedValue={selectedPrinterWidth}
                  onValueChange={(value) => handlePrinterWidthChange(value as PrinterWidthPreset)}
                  enabled={!printerWidthChanging}
                  accessibilityLabel={t('printer.paperWidth')}
                  style={{ color: colors.text }}
                  dropdownIconColor={colors.text}
                >
                  {PRINTER_WIDTH_PRESETS.map((preset) => (
                    <Picker.Item key={preset} label={preset} value={preset} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>
        </View>
      )}

      {!isCliente && (isScanning ? (
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={t('common.loading')} />
      ) : (
        devices.map((item) => (
          <View key={item.id} style={{ marginVertical: 10 }}>
            <Text style={{ textAlign: 'center', margin: 10, color: colors.text }}>
              {item.name || t('printer.unknownDevice')}
            </Text>
            <Button title={t('printer.register')} onPress={() => handleConnect(item)} />
          </View>
        ))
      ))}

      {planInfo && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }]}>
            <FontAwesome name="credit-card" size={16} color={colors.text} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.plan.title')}</Text>
          </View>
          <View style={styles.sectionContent}>
            <Text style={{ color: colors.text }}>{t(`settings.plan.tiers.${planInfo.plan}`)}</Text>
            <Text style={{ color: colors.text }}>
              {planInfo.plan === 'FREE'
                ? t('settings.plan.printsToday', { count: printsToday, limit: PRINT_DAILY_LIMIT })
                : t('settings.plan.unlimited')}
            </Text>
            <Text style={{ color: colors.text }}>
              {planInfo.plan === 'FREE'
                ? t('settings.plan.reportsThisMonth', { count: reportsThisMonth, limit: REPORT_MONTHLY_LIMIT })
                : t('settings.plan.unlimited')}
            </Text>
            <Text style={{ color: colors.text }}>{t('settings.plan.devices', { count: planInfo.deviceCount })}</Text>
            {planInfo.plan === 'FREE' && (
              <Button
                title={t('settings.plan.upgradeButton')}
                onPress={() => WebBrowser.openBrowserAsync('https://tozzo.uk/plan')}
              />
            )}
          </View>
        </View>
      )}

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }]}>
          <FontAwesome name="life-ring" size={16} color={colors.text} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.support')}</Text>
        </View>
        <View style={styles.sectionContent}>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:suporte@tozzo.uk')}>
            <Text style={{ color: colors.text, textDecorationLine: 'underline' }}>suporte@tozzo.uk</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }]}>
          <FontAwesome name="file-text-o" size={16} color={colors.text} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.legal')}</Text>
        </View>
        <View style={styles.sectionContent}>
          <View style={{ marginBottom: 8 }}>
            <Button
              title={t('settings.privacyPolicy')}
              onPress={() => WebBrowser.openBrowserAsync('https://tozzo.uk/privacidade')}
            />
          </View>
          <Button
            title={t('settings.termsOfUse')}
            onPress={() => WebBrowser.openBrowserAsync('https://tozzo.uk/termos')}
          />
        </View>
      </View>

      <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 16 }}>
        v{Constants.expoConfig?.version ?? '?'}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4,
  },
  username: {
    fontSize: 18,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  section: {
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: radius.md,
  },
  sectionHeader: {
    padding: 12,
    backgroundColor: '#fafafa',
    borderBottomColor: 'black',
    borderBottomWidth: 1
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickerFrame: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContent: {
    padding: 12,
  },
  userIcon: {
    marginBottom: 8,
  },
});

export default BluetoothScreen;
