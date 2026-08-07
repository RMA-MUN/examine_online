import { act } from '@testing-library/react';
import useThemeStore, { applyThemeMode } from './theme';

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    act(() => useThemeStore.getState().setMode('light'));
  });

  it('切换后写入 localStorage 并同步到根节点', () => {
    act(() => useThemeStore.getState().toggle());

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(localStorage.getItem('theme-mode')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('再次切换回到亮色', () => {
    act(() => useThemeStore.getState().toggle());
    act(() => useThemeStore.getState().toggle());

    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applyThemeMode 直接设置根节点属性', () => {
    applyThemeMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
