/** 总览控制台演示数据：照抄参考 `frontend_design/index.html`，后端扩展字段落地前只读 mock（Task 8）。 */

export type OverviewRangeKey = 'today' | 'week' | 'term';

export interface OverviewKpi {
  running: string;
  online: string;
  peak: string;
  pending: string;
  eta: string;
  alerts: string;
}

/** Segmented 三档：照抄参考 index.html 内联 RANGE。 */
export const OVERVIEW_RANGE: Record<OverviewRangeKey, OverviewKpi> = {
  today: { running: '3', online: '428', peak: '512', pending: '1,246', eta: '4.5', alerts: '2' },
  week: { running: '21', online: '1,864', peak: '2,140', pending: '5,830', eta: '19.5', alerts: '11' },
  term: { running: '96', online: '7,412', peak: '8,905', pending: '24,116', eta: '82', alerts: '43' },
};

export type ExamStatus = 'running' | 'pending' | 'finished';

export interface OverviewExam {
  title: string;
  meta: string;
  clazz: string;
  time: string;
  progress: number;
  online: number;
  total: number;
  status: ExamStatus;
  statusText: string;
}

export interface GradingProgress {
  title: string;
  done: number;
  total: number;
  percent: number;
}

export type FeedLevel = 'danger' | 'warn' | 'info' | 'ok';

export interface FeedEntry {
  level: FeedLevel;
  icon: string;
  title: string;
  meta: string;
}

export const MOCK_OVERVIEW = {
  running: 3,
  online: 428,
  peak: 512,
  pending: 1246,
  eta: 4.5,
  alerts: 2,
  exams: [
    {
      title: '《数据结构与算法》期中考试',
      meta: '闭卷 · 60 题 · 100 分',
      clazz: '计科 2401–2402',
      time: '14:00–16:00',
      progress: 68,
      online: 118,
      total: 120,
      status: 'running',
      statusText: '进行中',
    },
    {
      title: '《大学英语（三）》期末机考',
      meta: '含听力段 · 45 题 · 100 分',
      clazz: '2024 级本科',
      time: '14:30–16:00',
      progress: 42,
      online: 286,
      total: 410,
      status: 'running',
      statusText: '进行中',
    },
    {
      title: '《线性代数》随堂测验',
      meta: '随堂 · 20 题 · 50 分',
      clazz: '电信 2403',
      time: '15:00–15:45',
      progress: 0,
      online: 0,
      total: 24,
      status: 'pending',
      statusText: '待开始',
    },
    {
      title: '《计算机网络》补考',
      meta: '闭卷 · 50 题 · 100 分',
      clazz: '补考名单',
      time: '09:00–10:30',
      progress: 100,
      online: 46,
      total: 46,
      status: 'finished',
      statusText: '已结束',
    },
  ] as OverviewExam[],
  grading: [
    { title: '《计算机网络》补考 · 客观题自动判分', done: 46, total: 46, percent: 100 },
    { title: '《数据结构与算法》期中 · 主观题双评', done: 214, total: 1140, percent: 19 },
    { title: '《大学英语（三）》期末 · 作文批阅', done: 86, total: 410, percent: 21 },
    { title: '《线性代数》随堂测验 · 未开始', done: 0, total: 24, percent: 0 },
  ] as GradingProgress[],
  feed: [
    {
      level: 'danger',
      icon: '!',
      title: '考生 20240317 切屏次数达 6 次，超过阈值 5 次',
      meta: '《数据结构与算法》期中 · 15:21:04 · 巡考未确认',
    },
    {
      level: 'warn',
      icon: '!',
      title: '3 名考生人脸比对失败，已触发二次核验',
      meta: '《大学英语（三）》期末机考 · 15:18:42',
    },
    {
      level: 'info',
      icon: 'i',
      title: '《数据结构与算法》交卷高峰临近，阅卷队列已扩容至 12 人',
      meta: '系统提示 · 15:12:10',
    },
    {
      level: 'ok',
      icon: '✓',
      title: '《计算机网络》补考成绩已发布，46 份成绩单推送完成',
      meta: '自动任务 · 10:34:57',
    },
  ] as FeedEntry[],
};
