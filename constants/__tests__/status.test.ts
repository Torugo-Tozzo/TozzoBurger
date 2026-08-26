import { getStatusColor, getStatusLabel } from '@/constants/status';

describe('getStatusColor', () => {
  it('returns correct color for each known status', () => {
    expect(getStatusColor('OPEN')).toBe('#dc2626');
    expect(getStatusColor('IN_PREPARATION')).toBe('#d97706');
    expect(getStatusColor('DELIVERING')).toBe('#2563eb');
    expect(getStatusColor('CLOSED')).toBe('#6b7280');
  });

  it('falls back to OPEN color for unknown status', () => {
    expect(getStatusColor('UNKNOWN')).toBe('#dc2626');
  });
});

describe('getStatusLabel', () => {
  it('returns correct label for known status', () => {
    expect(getStatusLabel('IN_PREPARATION')).toBe('In preparation');
  });

  it('returns the raw value for unknown status', () => {
    expect(getStatusLabel('XYZ')).toBe('Open');
  });
});
