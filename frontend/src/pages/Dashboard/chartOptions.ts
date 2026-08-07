import type { EChartsOption } from 'echarts';
import type {
  AdminDashboardData,
  StudentDashboardData,
  TeacherDashboardData,
} from '../../types/dashboard';
import type { UserRole } from '../../types/user';
import { getChartTheme } from '../../theme/chartTheme';
import type { ChartTheme } from '../../theme/chartTheme';

/**
 * 图表配置构建器。
 *
 * 配色规则（勿凭手感改动，改后需重跑 dataviz 校验）：
 * - 名义分类（课程、班级、考试名）：单序列一律用 categorical[0]，
 *   不按数值深浅上色——柱长已经表达了大小，再用颜色重复编码是浪费通道。
 * - 有序数据（考试状态生命周期、成绩区间）：单色相由浅到深的色阶。
 * - 语义好坏（及格率、待批改、切屏）：用 status 令牌，不占用身份色。
 */

const BAR_MAX_WIDTH = 24;

const roleLabels: Record<UserRole, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
};

/** 身份色按角色固定绑定，筛选或排序都不会让颜色跟着换人 */
const roleColorIndex: Record<UserRole, number> = { student: 0, teacher: 1, admin: 2 };

/** 考试状态的生命周期顺序，决定它在有序色阶中的位置 */
const examStatusOrder = ['draft', 'published', 'ongoing', 'finished'] as const;

const adminStatusText: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  ongoing: '进行中',
  finished: '已结束',
};

const axisLabelStyle = (theme: ChartTheme) => ({
  color: theme.axisLabel,
  fontSize: 12,
});

const tooltipStyle = (theme: ChartTheme) => ({
  backgroundColor: theme.tooltipBg,
  borderColor: theme.tooltipBorder,
  borderWidth: 1,
  padding: [8, 12] as [number, number],
  textStyle: { color: theme.tooltipText, fontSize: 12 },
  extraCssText: 'box-shadow: 0 6px 16px rgba(0,0,0,0.08); border-radius: 8px;',
});

/** 类目轴标签：条目多时旋转，网格留白同步加大，避免标签被裁切 */
const rotateLabel = (count: number) => ({ interval: 0, rotate: count > 6 ? 30 : 0 });

const categoryAxis = (theme: ChartTheme, data: string[], rotate = true) => ({
  type: 'category' as const,
  data,
  axisLabel: {
    ...axisLabelStyle(theme),
    ...(rotate ? rotateLabel(data.length) : { interval: 0 }),
  },
  axisLine: { lineStyle: { color: theme.axisLine } },
  axisTick: { show: false },
});

const valueAxis = (theme: ChartTheme, extra: Record<string, unknown> = {}) => ({
  type: 'value' as const,
  axisLabel: axisLabelStyle(theme),
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: theme.splitLine, type: 'solid' as const } },
  ...extra,
});

/**
 * containLabel 让 ECharts 按实际标签尺寸预留空间，
 * 中文长标题旋转后也不会顶到容器外（固定 bottom 会裁掉 x 轴）。
 */
const cartesianBase = (theme: ChartTheme): EChartsOption => ({
  animationDuration: 450,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle(theme) },
  grid: { left: 16, right: 24, top: 32, bottom: 8, containLabel: true },
  textStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' },
});

/** 纵向柱：细柱、顶端 4px 圆角、底边贴基线 */
const columnSeries = (name: string, data: number[], color: string) => ({
  name,
  type: 'bar' as const,
  data,
  barMaxWidth: BAR_MAX_WIDTH,
  itemStyle: { color, borderRadius: [4, 4, 0, 0] as [number, number, number, number] },
});

/** 横向条：右端圆角 */
const barSeries = (name: string, data: number[], color: string) => ({
  name,
  type: 'bar' as const,
  data,
  barMaxWidth: BAR_MAX_WIDTH,
  itemStyle: { color, borderRadius: [0, 4, 4, 0] as [number, number, number, number] },
});

/** 有序色阶按位置取色，位置数超出色阶时取最深一级 */
const rampColor = (ramp: string[], index: number) => ramp[Math.min(index, ramp.length - 1)];

export const buildStudentScoreOption = (
  data: StudentDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  tooltip: {
    trigger: 'item',
    ...tooltipStyle(theme),
    formatter: (params) => {
      const item = Array.isArray(params) ? params[0] : params;
      const record = data.recent_records[item?.dataIndex ?? 0];
      if (!record) return '';
      const passed = record.score >= record.pass_score;
      return [
        `<strong>${record.exam_title}</strong>`,
        `得分：${record.score}`,
        `及格线：${record.pass_score}`,
        passed ? '已通过' : '未通过',
      ].join('<br/>');
    },
  },
  legend: {
    data: ['得分', '及格线'],
    top: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 16,
    textStyle: axisLabelStyle(theme),
  },
  xAxis: categoryAxis(
    theme,
    data.recent_records.map((record) => record.exam_title),
    false
  ),
  yAxis: valueAxis(theme, { min: 0 }),
  series: [
    columnSeries('得分', data.recent_records.map((r) => r.score), theme.categorical[0]),
    // 及格线是参照阈值而非并列指标，弱化处理让得分成为视觉主角
    {
      ...columnSeries('及格线', data.recent_records.map((r) => r.pass_score), theme.splitLine),
      itemStyle: {
        color: theme.axisLine,
        borderRadius: [4, 4, 0, 0] as [number, number, number, number],
      },
    },
  ],
});

export const buildStudentPassRateOption = (
  data: StudentDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => {
  const passRate = Math.max(0, Math.min(100, data.stats.pass_rate));
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}%', ...tooltipStyle(theme) },
    series: [
      {
        type: 'pie',
        radius: ['62%', '80%'],
        // 环形只有两段且互补，描边分隔即可，不需要图例
        itemStyle: { borderColor: theme.surface, borderWidth: 2 },
        label: {
          show: true,
          position: 'center',
          formatter: `${passRate}%`,
          fontSize: 28,
          fontWeight: 600,
          color: theme.tooltipText,
        },
        data: [
          { value: passRate, name: '通过率', itemStyle: { color: theme.status.good } },
          {
            value: 100 - passRate,
            name: '未通过',
            itemStyle: { color: theme.status.goodTrack },
            label: { show: false },
          },
        ],
      },
    ],
  };
};

export const buildTeacherPendingOption = (
  data: TeacherDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle(theme) },
  xAxis: valueAxis(theme, { minInterval: 1 }),
  yAxis: {
    type: 'category',
    data: data.pending_grading.map((item) => item.exam_title),
    axisLabel: axisLabelStyle(theme),
    axisLine: { lineStyle: { color: theme.axisLine } },
    axisTick: { show: false },
  },
  series: [
    barSeries(
      '待批改题目',
      data.pending_grading.map((item) => item.pending_count),
      theme.status.warning
    ),
  ],
});

export const buildTeacherRecentExamOption = (
  data: TeacherDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => {
  const exams = [...data.recent_exams].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  return {
    animationDuration: 450,
    textStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' },
    grid: { left: 16, right: 32, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(theme),
      formatter: (params) => {
        const item = Array.isArray(params) ? params[0] : params;
        const value = Array.isArray(item?.value) ? item.value : [];
        const status = adminStatusText[String(value[2] ?? '')] || value[2] || '';
        return [`<strong>${value[1] ?? ''}</strong>`, `${value[0] ?? ''}`, `状态：${status}`].join(
          '<br/>'
        );
      },
    },
    xAxis: {
      type: 'time',
      axisLabel: axisLabelStyle(theme),
      axisLine: { lineStyle: { color: theme.axisLine } },
      splitLine: { lineStyle: { color: theme.splitLine, type: 'solid' } },
    },
    yAxis: {
      type: 'category',
      data: exams.map((exam) => exam.title),
      axisLabel: axisLabelStyle(theme),
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisTick: { show: false },
    },
    series: [
      {
        name: '考试时间',
        type: 'scatter',
        symbolSize: 12,
        encode: { x: 0, y: 1 },
        data: exams.map((exam) => [exam.start_time, exam.title, exam.status]),
        // 2px 表面色描边，标记重叠时仍能分辨
        itemStyle: {
          color: theme.categorical[0],
          borderColor: theme.surface,
          borderWidth: 2,
        },
      },
    ],
  };
};

export const buildAdminRoleOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', ...tooltipStyle(theme) },
  legend: {
    bottom: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 16,
    textStyle: axisLabelStyle(theme),
  },
  series: [
    {
      type: 'pie',
      radius: ['52%', '74%'],
      itemStyle: { borderColor: theme.surface, borderWidth: 2 },
      label: { formatter: '{b}\n{c}', color: theme.axisLabel, fontSize: 12 },
      labelLine: { lineStyle: { color: theme.axisLine } },
      data: data.role_distribution.map((item) => ({
        value: item.count,
        name: roleLabels[item.role] ?? item.role,
        itemStyle: { color: theme.categorical[roleColorIndex[item.role] ?? 0] },
      })),
    },
  ],
});

/** 考试状态是生命周期（草稿→已发布→进行中→已结束），用有序色阶而非彩虹色 */
export const buildAdminExamStatusOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', ...tooltipStyle(theme) },
  legend: {
    bottom: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 16,
    textStyle: axisLabelStyle(theme),
  },
  series: [
    {
      type: 'pie',
      radius: ['52%', '74%'],
      itemStyle: { borderColor: theme.surface, borderWidth: 2 },
      label: { formatter: '{b}\n{c}', color: theme.axisLabel, fontSize: 12 },
      labelLine: { lineStyle: { color: theme.axisLine } },
      data: data.exam_status_distribution.map((item) => {
        const order = examStatusOrder.indexOf(item.status as (typeof examStatusOrder)[number]);
        return {
          name: adminStatusText[item.status] || item.status,
          value: item.count,
          itemStyle: {
            color: rampColor(theme.ordinal4, order === -1 ? theme.ordinal4.length - 1 : order),
          },
        };
      }),
    },
  ],
});

export const buildAdminCourseExamOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.exams_per_course.map((item) => item.course_name)),
  yAxis: valueAxis(theme, { minInterval: 1 }),
  series: [
    columnSeries(
      '考试数量',
      data.exams_per_course.map((item) => item.count),
      theme.categorical[0]
    ),
  ],
});

export const buildAdminExamAvgOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.exam_avg_scores.map((item) => item.exam_title)),
  yAxis: valueAxis(theme, { min: 0 }),
  series: [
    columnSeries(
      '平均分',
      data.exam_avg_scores.map((item) => item.avg_score),
      theme.categorical[0]
    ),
  ],
});

/** 及格率语义上有好坏之分，用状态色而非身份色 */
export const buildAdminExamPassRateOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.exam_pass_rates.map((item) => item.exam_title)),
  yAxis: valueAxis(theme, { min: 0, max: 100, axisLabel: { ...axisLabelStyle(theme), formatter: '{value}%' } }),
  series: [
    columnSeries(
      '及格率',
      data.exam_pass_rates.map((item) => item.pass_rate),
      theme.status.good
    ),
  ],
});

/** 成绩区间是有序桶，色阶随分数升高加深 */
export const buildAdminScoreDistOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.score_distribution.map((item) => item.label), false),
  yAxis: valueAxis(theme, { minInterval: 1 }),
  series: [
    {
      name: '人数',
      type: 'bar',
      barMaxWidth: BAR_MAX_WIDTH,
      data: data.score_distribution.map((item, index) => ({
        value: item.count,
        itemStyle: {
          color: rampColor(theme.ordinal5, index),
          borderRadius: [4, 4, 0, 0] as [number, number, number, number],
        },
      })),
    },
  ],
});

export const buildAdminExamParticipationOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.exam_participation.map((item) => item.exam_title)),
  yAxis: valueAxis(theme, { minInterval: 1 }),
  series: [
    columnSeries(
      '参与人数',
      data.exam_participation.map((item) => item.count),
      theme.categorical[0]
    ),
  ],
});

export const buildAdminPendingOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.pending_grading_by_exam.map((item) => item.exam_title)),
  yAxis: valueAxis(theme, { minInterval: 1 }),
  series: [
    columnSeries(
      '待批改题数',
      data.pending_grading_by_exam.map((item) => item.pending_count),
      theme.status.warning
    ),
  ],
});

/** 切屏次数是作弊风险信号，用告警色表达其含义 */
export const buildAdminSwitchOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.switch_counts_by_exam.map((item) => item.exam_title)),
  yAxis: valueAxis(theme, { minInterval: 1 }),
  series: [
    columnSeries(
      '切屏次数',
      data.switch_counts_by_exam.map((item) => item.switch_count),
      theme.status.danger
    ),
  ],
});

export const buildAdminClassDistOption = (
  data: AdminDashboardData,
  theme: ChartTheme = getChartTheme()
): EChartsOption => ({
  ...cartesianBase(theme),
  xAxis: categoryAxis(theme, data.class_student_distribution.map((item) => item.class_name)),
  yAxis: valueAxis(theme, { minInterval: 1 }),
  series: [
    columnSeries(
      '学生人数',
      data.class_student_distribution.map((item) => item.count),
      theme.categorical[0]
    ),
  ],
});
