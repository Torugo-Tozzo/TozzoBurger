import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_PRINTER_WIDTH,
  PRINTER_WIDTH_PRESETS,
  PrinterWidthPreset,
} from '@/constants/printerWidths';

export const PRINTER_WIDTH_PREFERENCE_KEY = '@tozzoburger/printerWidth';

function isValidPreset(value: unknown): value is PrinterWidthPreset {
  return typeof value === 'string' && (PRINTER_WIDTH_PRESETS as readonly string[]).includes(value);
}

export async function getPrinterWidth(): Promise<PrinterWidthPreset> {
  try {
    const stored = await AsyncStorage.getItem(PRINTER_WIDTH_PREFERENCE_KEY);
    return isValidPreset(stored) ? stored : DEFAULT_PRINTER_WIDTH;
  } catch {
    return DEFAULT_PRINTER_WIDTH;
  }
}

export async function setPrinterWidth(value: unknown): Promise<PrinterWidthPreset> {
  const preset = isValidPreset(value) ? value : DEFAULT_PRINTER_WIDTH;
  await AsyncStorage.setItem(PRINTER_WIDTH_PREFERENCE_KEY, preset);
  return preset;
}
