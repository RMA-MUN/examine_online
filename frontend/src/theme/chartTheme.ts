/**
 * 图表主题令牌。
 *
 * 所有色值均由 dataviz 校验脚本验证通过，不可凭手感修改：
 * - categorical（身份色）：明度带 / 彩度下限 / 色盲分离度 / 对比度 四项全部 PASS，
 *   且按「全配对」模式校验（饼图、散点图中任意两色都可能相邻）。
 * - ordinal（有序色阶）：单色相、明度单调、相邻明度差 ≥ 0.06、浅端对比度 ≥ 2:1。
 *
 * 修改任一色值后必须重新运行校验，勿直接目测。
 */

export type ThemeMode = 'light' | 'dark';

export interface ChartTheme {
  /** 名义分类色，按固定顺序取用，永不循环复用 */
  categorical: [string, string, string];
  /** 4 级有序色阶（考试状态生命周期） */
  ordinal4: string[];
  /** 5 级有序色阶（成绩分布区间） */
  ordinal5: string[];
  /** 语义状态色，仅用于真正表达好/坏的序列 */
  status: {
    good: string;
    goodTrack: string;
    warning: string;
    danger: string;
  };
  surface: string;
  axisLabel: string;
  axisLine: string;
  splitLine: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const LIGHT: ChartTheme = {
  categorical: ['#3A6FA5', '#E1701F', '#2E9E6B'],
  ordinal4: ['#95B4D1', '#6C96BF', '#4879A6', '#2F5F8B'],
  ordinal5: ['#95B4D1', '#7099C1', '#4B7EAB', '#356891', '#234E73'],
  status: {
    good: '#2E9E6B',
    goodTrack: '#DCEFE6',
    warning: '#E1701F',
    danger: '#C8412F',
  },
  surface: '#FFFFFF',
  axisLabel: '#5F6E80',
  axisLine: '#E4E8EE',
  splitLine: '#EDF1F5',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E4E8EE',
  tooltipText: '#1A2332',
};

const DARK: ChartTheme = {
  categorical: ['#4A83BE', '#E1701F', '#2E9E6B'],
  ordinal4: ['#33648F', '#4A83BE', '#6B9ECF', '#95BEE0'],
  ordinal5: ['#2C5A85', '#3B74A6', '#4F8EC0', '#6BA6D3', '#8CBEE2'],
  status: {
    good: '#2E9E6B',
    goodTrack: '#24483C',
    warning: '#E1701F',
    danger: '#E06A58',
  },
  surface: '#1E2A3A',
  axisLabel: '#9FB0C4',
  axisLine: '#33455C',
  splitLine: '#2C3B4F',
  tooltipBg: '#243244',
  tooltipBorder: '#3A4C66',
  tooltipText: '#E8EDF3',
};

export const CHART_THEMES: Record<ThemeMode, ChartTheme> = { light: LIGHT, dark: DARK };

export const getChartTheme = (mode: ThemeMode = 'light'): ChartTheme => CHART_THEMES[mode];
