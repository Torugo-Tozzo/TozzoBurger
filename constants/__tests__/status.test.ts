import { getStatusColor, getStatusLabel } from '@/constants/status';

describe('getStatusColor', () => {
  it('returns correct color for each known status', () => {
    expect(getStatusColor('ABERTO')).toBe('#dc2626');
    expect(getStatusColor('EM_PREPARO')).toBe('#d97706');
    expect(getStatusColor('ENTREGANDO')).toBe('#2563eb');
    expect(getStatusColor('FECHADO')).toBe('#6b7280');
  });

  it('falls back to FECHADO color for unknown status', () => {
    expect(getStatusColor('DESCONHECIDO')).toBe('#6b7280');
  });
});

describe('getStatusLabel', () => {
  it('returns correct label for known status', () => {
    expect(getStatusLabel('EM_PREPARO')).toBe('Em Preparo');
  });

  it('returns the raw value for unknown status', () => {
    expect(getStatusLabel('XYZ')).toBe('XYZ');
  });
});
