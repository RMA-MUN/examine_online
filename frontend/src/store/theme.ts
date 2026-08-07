import { create } from 'zustand';
import type { ThemeMode } from '../theme/chartTheme';

const STORAGE_KEY = 'theme-mode';

/**
 * 初始主题优先级：用户上次的显式选择 > 系统偏好 > 亮色。
 * 读取放在模块加载期，避免首屏先渲染亮色再跳成暗色。
 */
const readInitialMode = (): ThemeMode => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

/** 令 CSS 变量与 antd 算法保持同步：根节点属性驱动整套变量切换 */
export const applyThemeMode = (mode: ThemeMode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readInitialMode(),

  setMode: (mode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    applyThemeMode(mode);
    set({ mode });
  },

  toggle: () => {
    get().setMode(get().mode === 'dark' ? 'light' : 'dark');
  },
}));

export default useThemeStore;
