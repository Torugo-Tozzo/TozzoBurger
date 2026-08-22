import { getAppLoadingMessage } from '@/components/AppLoadingScreen';

describe('getAppLoadingMessage', () => {
  it('retorna status de sessão durante a reidratação', () => {
    expect(getAppLoadingMessage('authenticating')).toBe('Verificando sua sessão...');
  });

  it('retorna status de inicialização do shell', () => {
    expect(getAppLoadingMessage('initializing')).toBe('Preparando o aplicativo...');
  });

  it('retorna status de preparação após o perfil', () => {
    expect(getAppLoadingMessage('preparing')).toBe('Preparando seus dados...');
  });
});
