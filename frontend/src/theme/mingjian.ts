import type { ThemeMode } from './chartTheme';

export const MINGJIAN_LIGHT = {
  primary: '#2E7D4F',
  siderBg: '#FFFFFF',
  contentBg: '#F4F6F4',
  border: '#E2E8E2',
};

export const MINGJIAN_DARK = {
  primary: '#5FB87E',
  siderBg: '#141F19',
  contentBg: '#101915',
  border: '#2E4238',
};

export function getMingjianAntdTokens(mode: ThemeMode) {
  const t = mode === 'dark' ? MINGJIAN_DARK : MINGJIAN_LIGHT;
  return {
    token: { colorPrimary: t.primary, colorInfo: t.primary, borderRadius: 8 },
    layout: { siderBg: t.siderBg },
  };
}
