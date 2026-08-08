const primaryLight = '#000';
const primaryDark = '#fff';

export default {
  light: {
    background: '#fff',
    surface: '#f9f9f9',
    surfaceHeader: '#fafafa',
    border: '#e2e2e2',
    text: '#000',
    textMuted: '#666',
    primary: primaryLight,
    tint: primaryLight,
    tabIconDefault: '#666',
    tabIconSelected: primaryLight,
  },
  dark: {
    background: '#000',
    surface: '#333',
    surfaceHeader: '#0d0d0d',
    border: '#333',
    text: '#fff',
    textMuted: '#ccc',
    primary: primaryDark,
    tint: primaryDark,
    tabIconDefault: '#999',
    tabIconSelected: primaryDark,
  },
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  },
};
