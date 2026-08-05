import type { EChartsOption } from 'echarts';
import type {
  AdminDashboardData,
  StudentDashboardData,
  TeacherDashboardData,
} from '../../types/dashboard';

const colors = {
  primary: '#2A78D6',
  secondary: '#86B6EF',
  success: '#0CA30C',
  warning: '#FAB219',
  neutral: '#E4E8EE',
};

const roleColors = {
  student: '#2A78D6',
  teacher: '#EB6834',
  admin: '#1BAF7A',
};

const cartesianBase: EChartsOption = {
  animationDuration: 450,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 48, right: 24, top: 36, bottom: 48 },
  textStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' },
};

export const buildStudentScoreOption = (
  data: StudentDashboardData
): EChartsOption => ({
  ...cartesianBase,
  tooltip: {
    trigger: 'item',
    formatter: (params) => {
      const item = Array.isArray(params) ? params[0] : params;
      const record = data.recent_records[item?.dataIndex ?? 0];
      return record
        ? `${record.exam_title}\n得分：${record.score}\n及格线：${record.pass_score}`
        : '';
    },
  },
  legend: { data: ['得分', '及格线'] },
  xAxis: {
    type: 'category',
    data: data.recent_records.map((record) => record.exam_title),
    axisLabel: { interval: 0, rotate: data.recent_records.length > 3 ? 20 : 0 },
  },
  yAxis: { type: 'value', min: 0 },
  series: [
    {
      name: '得分',
      type: 'bar',
      data: data.recent_records.map((record) => record.score),
      itemStyle: { color: colors.primary, borderRadius: [4, 4, 0, 0] },
    },
    {
      name: '及格线',
      type: 'bar',
      data: data.recent_records.map((record) => record.pass_score),
      itemStyle: { color: colors.warning, borderRadius: [4, 4, 0, 0] },
    },
  ],
});

export const buildStudentPassRateOption = (
  data: StudentDashboardData
): EChartsOption => {
  const passRate = Math.max(0, Math.min(100, data.stats.pass_rate));
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
    series: [
      {
        type: 'pie',
        radius: ['56%', '76%'],
        label: { show: true, position: 'center', formatter: `${passRate}%`, fontSize: 24 },
        data: [
          { value: passRate, name: '通过率', itemStyle: { color: colors.success } },
          {
            value: 100 - passRate,
            name: '未通过',
            itemStyle: { color: colors.neutral },
            label: { show: false },
          },
        ],
      },
    ],
  };
};

export const buildTeacherPendingOption = (
  data: TeacherDashboardData
): EChartsOption => ({
  ...cartesianBase,
  grid: { left: 100, right: 24, top: 24, bottom: 32 },
  xAxis: { type: 'value', minInterval: 1 },
  yAxis: {
    type: 'category',
    data: data.pending_grading.map((item) => item.exam_title),
  },
  series: [
    {
      name: '待批改题目',
      type: 'bar',
      data: data.pending_grading.map((item) => item.pending_count),
      itemStyle: { color: colors.warning, borderRadius: [0, 4, 4, 0] },
    },
  ],
});

export const buildTeacherRecentExamOption = (
  data: TeacherDashboardData
): EChartsOption => {
  const exams = [...data.recent_exams].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  return {
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      formatter: (params) => {
        const item = Array.isArray(params) ? params[0] : params;
        const value = Array.isArray(item?.value) ? item.value : [];
        return `${value[1] ?? ''}\n${value[0] ?? ''}\n状态：${value[2] ?? ''}`;
      },
    },
    grid: { left: 100, right: 24, top: 24, bottom: 48 },
    xAxis: { type: 'time' },
    yAxis: {
      type: 'category',
      data: exams.map((exam) => exam.title),
      axisTick: { show: false },
    },
    series: [
      {
        name: '考试时间',
        type: 'scatter',
        symbolSize: 12,
        encode: { x: 0, y: 1 },
        data: exams.map((exam) => [exam.start_time, exam.title, exam.status]),
        itemStyle: { color: colors.primary },
      },
    ],
  };
};

export const buildAdminRoleOption = (
  data: AdminDashboardData
): EChartsOption => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: ['48%', '72%'],
      label: { formatter: '{b}\n{c}' },
      data: data.role_distribution.map((item) => ({
        value: item.count,
        name: item.role === 'student' ? '学生' : item.role === 'teacher' ? '教师' : '管理员',
        itemStyle: { color: roleColors[item.role] },
      })),
    },
  ],
});
