export const PRINTER_WIDTH_PRESETS = ['44mm', '58mm', '76mm', '80mm', '110mm'] as const;

export type PrinterWidthPreset = (typeof PRINTER_WIDTH_PRESETS)[number];

export const DEFAULT_PRINTER_WIDTH: PrinterWidthPreset = '80mm';

// Colunas por linha na fonte A (ESC/POS, 203dpi) — aproximação padrão de
// mercado. Sem impressora física de 44/76/110mm pra calibrar; ajuste fino
// futuro é mudar 1 número aqui, não redesenho.
export const PRINTER_WIDTH_COLUMNS: Record<PrinterWidthPreset, number> = {
  '44mm': 24,
  '58mm': 32,
  '76mm': 42,
  '80mm': 48,
  '110mm': 64,
};
