import { getAppLoadingMessage } from '@/components/AppLoadingScreen';

describe('getAppLoadingMessage', () => {
  it('returns the English fallback for session hydration', () => {
    expect(getAppLoadingMessage('authenticating')).toBe('Checking your session…');
  });

  it('returns the English fallback for shell initialization', () => {
    expect(getAppLoadingMessage('initializing')).toBe('Preparing the app…');
  });

  it('returns the English fallback after the profile loads', () => {
    expect(getAppLoadingMessage('preparing')).toBe('Preparing your data…');
  });
});
