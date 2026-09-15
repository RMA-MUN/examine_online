/** 成绩分析演示数据：照抄参考 `frontend_design/analytics.html` 内联 DATA（dsa/eng 两档）。 */

export type AnalyticsExamKey = 'dsa' | 'eng';

export interface AnalyticsKpi {
  avg: string;
  pass: string;
  max: string;
  min: string;
  range: string;
  sd: string;
  full: string;
}

export interface AnalyticsBin {
  l: string;
  n: number;
}

export interface AnalyticsClass {
  n: string;
  avg: number;
  pass: number;
  n2: number;
}

export interface AnalyticsKnow {
  n: string;
  v: number;
}

export interface AnalyticsQuestion {
  no: number;
  type: string;
  p: number;
  d: number;
  avg: string;
  full: number;
}

export interface AnalyticsExamData {
  meta: string;
  kpi: AnalyticsKpi;
  total: number;
  bins: AnalyticsBin[];
  classes: AnalyticsClass[];
  know: AnalyticsKnow[];
  questions: AnalyticsQuestion[];
}

export const MOCK_ANALYTICS: Record<AnalyticsExamKey, AnalyticsExamData> = {
  dsa: {
    meta: '计科 2401–2402 · 120 人 · 2026-09-15',
    kpi: { avg: '75.7', pass: '86.7', max: '98', min: '21', range: '77', sd: '15.0', full: '100' },
    total: 120,
    bins: [
      { l: '0–39', n: 2 }, { l: '40–49', n: 5 }, { l: '50–59', n: 9 }, { l: '60–69', n: 19 },
      { l: '70–79', n: 34 }, { l: '80–89', n: 31 }, { l: '90–100', n: 20 },
    ],
    classes: [
      { n: '计科 2401', avg: 78.2, pass: 90.0, n2: 60 },
      { n: '计科 2402', avg: 73.1, pass: 83.3, n2: 60 },
    ],
    know: [
      { n: '线性表与链表', v: 86 }, { n: '排序算法', v: 78 }, { n: '栈与队列', v: 71 },
      { n: '查找算法', v: 69 }, { n: '树与二叉树', v: 64 }, { n: '图与遍历', v: 52 },
    ],
    questions: [
      { no: 4, type: '单选', p: 0.41, d: 0.55, avg: '2.1', full: 5 },
      { no: 2, type: '单选', p: 0.53, d: 0.47, avg: '2.7', full: 5 },
      { no: 11, type: '多选', p: 0.58, d: 0.51, avg: '3.5', full: 6 },
      { no: 14, type: '简答', p: 0.62, d: 0.48, avg: '18.6', full: 30 },
      { no: 10, type: '多选', p: 0.66, d: 0.44, avg: '4.0', full: 6 },
      { no: 9, type: '多选', p: 0.72, d: 0.38, avg: '4.3', full: 6 },
      { no: 12, type: '填空', p: 0.74, d: 0.35, avg: '4.4', full: 6 },
      { no: 13, type: '填空', p: 0.81, d: 0.32, avg: '4.9', full: 6 },
      { no: 1, type: '单选', p: 0.88, d: 0.21, avg: '4.4', full: 5 },
    ],
  },
  eng: {
    meta: '2024 级本科 · 410 人 · 2026-09-15',
    kpi: { avg: '76.3', pass: '87.3', max: '99', min: '32', range: '67', sd: '14.2', full: '100' },
    total: 410,
    bins: [
      { l: '0–39', n: 6 }, { l: '40–49', n: 14 }, { l: '50–59', n: 32 }, { l: '60–69', n: 71 },
      { l: '70–79', n: 108 }, { l: '80–89', n: 96 }, { l: '90–100', n: 83 },
    ],
    classes: [
      { n: '英语 A 班', avg: 81.4, pass: 94.1, n2: 136 },
      { n: '英语 B 班', avg: 75.6, pass: 87.0, n2: 154 },
      { n: '英语 C 班', avg: 70.2, pass: 79.6, n2: 120 },
    ],
    know: [
      { n: '听力理解', v: 82 }, { n: '阅读理解', v: 79 }, { n: '词汇与语法', v: 74 },
      { n: '完形填空', v: 66 }, { n: '写作', v: 61 },
    ],
    questions: [
      { no: 45, type: '写作', p: 0.61, d: 0.42, avg: '12.2', full: 20 },
      { no: 33, type: '完形', p: 0.66, d: 0.40, avg: '6.6', full: 10 },
      { no: 21, type: '阅读', p: 0.74, d: 0.31, avg: '7.4', full: 10 },
      { no: 6, type: '听力', p: 0.77, d: 0.29, avg: '3.9', full: 5 },
      { no: 41, type: '阅读', p: 0.79, d: 0.35, avg: '15.8', full: 20 },
      { no: 12, type: '词汇', p: 0.83, d: 0.24, avg: '4.2', full: 5 },
    ],
  },
};

export const ANALYTICS_EXAMS: Array<{ value: AnalyticsExamKey; label: string }> = [
  { value: 'dsa', label: '《数据结构与算法》期中考试' },
  { value: 'eng', label: '《大学英语（三）》期末机考' },
];
