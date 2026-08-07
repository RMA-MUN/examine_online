import type { AdminDashboardData, StudentDashboardData, TeacherDashboardData } from '../../types/dashboard';
import {
  buildAdminClassDistOption,
  buildAdminCourseExamOption,
  buildAdminExamAvgOption,
  buildAdminExamParticipationOption,
  buildAdminExamPassRateOption,
  buildAdminExamStatusOption,
  buildAdminPendingOption,
  buildAdminRoleOption,
  buildAdminScoreDistOption,
  buildAdminSwitchOption,
  buildStudentPassRateOption,
  buildStudentScoreOption,
  buildTeacherPendingOption,
  buildTeacherRecentExamOption,
} from './chartOptions';
import { getChartTheme } from '../../theme/chartTheme';

const student: StudentDashboardData = {
  role: 'student',
  stats: { available_exams: 1, my_exam_count: 2, avg_score: 78, pass_rate: 75 },
  upcoming_exams: [],
  recent_records: [
    { id: 1, exam_id: 2, exam_title: '期末考试', score: 82, pass_score: 60, status: 'graded', submit_time: null },
  ],
};

test('student score option maps scores and pass lines', () => {
  const option = buildStudentScoreOption(student) as any;
  expect(option.xAxis.data).toEqual(['期末考试']);
  expect(option.series[0].data).toEqual([82]);
  expect(option.series[1].data).toEqual([60]);
});

test('student score option highlights a single bar and shows both values', () => {
  const option = buildStudentScoreOption(student) as any;
  expect(option.tooltip.trigger).toBe('item');
  const html = option.tooltip.formatter({ dataIndex: 0 });
  expect(html).toContain('得分：82');
  expect(html).toContain('及格线：60');
});

test('student pass rate option clamps invalid percentages', () => {
  const option = buildStudentPassRateOption({
    ...student,
    stats: { ...student.stats, pass_rate: 120 },
  }) as any;
  expect(option.series[0].data.map((item: any) => item.value)).toEqual([100, 0]);
});

const teacher: TeacherDashboardData = {
  role: 'teacher',
  stats: { published_exams: 2, pending_grading_count: 3, course_count: 1, total_records: 4 },
  pending_grading: [{ exam_id: 1, exam_title: '数据结构', pending_count: 3 }],
  recent_exams: [
    { id: 1, title: '期末考试', status: 'published', start_time: '2026-08-12T09:00:00' },
    { id: 2, title: '期中考试', status: 'finished', start_time: '2026-08-01T09:00:00' },
  ],
};

test('teacher pending option uses role data', () => {
  const option = buildTeacherPendingOption(teacher) as any;
  expect(option.yAxis.data).toEqual(['数据结构']);
  expect(option.series[0].data).toEqual([3]);
});

test('teacher recent exam option sorts the timeline and exposes dates', () => {
  const option = buildTeacherRecentExamOption(teacher) as any;
  expect(option.yAxis.data).toEqual(['期中考试', '期末考试']);
  expect(option.series[0].data).toEqual([
    ['2026-08-01T09:00:00', '期中考试', 'finished'],
    ['2026-08-12T09:00:00', '期末考试', 'published'],
  ]);
});

test('option builders keep empty datasets as empty series', () => {
  const scoreOption = buildStudentScoreOption({ ...student, recent_records: [] }) as any;
  const pendingOption = buildTeacherPendingOption({
    ...teacher,
    pending_grading: [],
  }) as any;
  const recentOption = buildTeacherRecentExamOption({ ...teacher, recent_exams: [] }) as any;

  expect(scoreOption.series.map((series: any) => series.data)).toEqual([[], []]);
  expect(pendingOption.series[0].data).toEqual([]);
  expect(recentOption.series[0].data).toEqual([]);
});

const admin: AdminDashboardData = {
  role: 'admin',
  stats: { student_count: 4, teacher_count: 2, admin_count: 1, exam_count: 3 },
  role_distribution: [
    { role: 'teacher', count: 2 },
    { role: 'admin', count: 1 },
    { role: 'student', count: 4 },
  ],
  recent_users: [],
  exam_status_distribution: [
    { status: 'published', count: 2 },
    { status: 'finished', count: 1 },
  ],
  exams_per_course: [{ course_name: '计算机网络', count: 2 }],
  exam_avg_scores: [{ exam_id: 1, exam_title: '期中考试', avg_score: 75.5 }],
  exam_pass_rates: [{ exam_id: 1, exam_title: '期中考试', pass_rate: 50 }],
  score_distribution: [
    { label: '0-59', count: 1 },
    { label: '60-69', count: 0 },
    { label: '70-79', count: 0 },
    { label: '80-89', count: 1 },
    { label: '90-100', count: 0 },
  ],
  exam_participation: [{ exam_id: 1, exam_title: '期中考试', count: 2 }],
  pending_grading_by_exam: [{ exam_id: 1, exam_title: '期中考试', pending_count: 1 }],
  switch_counts_by_exam: [{ exam_id: 1, exam_title: '期中考试', switch_count: 3 }],
  class_student_distribution: [{ class_name: '计科2401班', count: 2 }],
};

test('admin role option keeps labels and colors tied to roles', () => {
  const option = buildAdminRoleOption(admin) as any;
  const light = getChartTheme('light');
  // 身份色绑定角色本身，与它在数据里的顺序无关
  expect(
    option.series[0].data.map((item: any) => [item.name, item.itemStyle.color])
  ).toEqual([
    ['教师', light.categorical[1]],
    ['管理员', light.categorical[2]],
    ['学生', light.categorical[0]],
  ]);
});

test('admin role colors follow the role, not the row order', () => {
  const reordered = buildAdminRoleOption({
    ...admin,
    role_distribution: [
      { role: 'student', count: 4 },
      { role: 'teacher', count: 2 },
      { role: 'admin', count: 1 },
    ],
  }) as any;
  const byName = Object.fromEntries(
    reordered.series[0].data.map((item: any) => [item.name, item.itemStyle.color])
  );
  const light = getChartTheme('light');
  expect(byName['学生']).toBe(light.categorical[0]);
  expect(byName['教师']).toBe(light.categorical[1]);
  expect(byName['管理员']).toBe(light.categorical[2]);
});

test('exam status slices use the ordinal ramp in lifecycle order', () => {
  const option = buildAdminExamStatusOption({
    ...admin,
    exam_status_distribution: [
      { status: 'draft', count: 1 },
      { status: 'published', count: 2 },
      { status: 'ongoing', count: 3 },
      { status: 'finished', count: 4 },
    ],
  }) as any;
  const { ordinal4 } = getChartTheme('light');
  expect(option.series[0].data.map((item: any) => item.itemStyle.color)).toEqual(ordinal4);
});

test('score distribution buckets deepen with the score range', () => {
  const option = buildAdminScoreDistOption(admin) as any;
  const { ordinal5 } = getChartTheme('light');
  expect(option.series[0].data.map((item: any) => item.itemStyle.color)).toEqual(ordinal5);
});

test('dark theme swaps every chart color to the dark palette', () => {
  const dark = getChartTheme('dark');
  const option = buildAdminCourseExamOption(admin, dark) as any;
  expect(option.series[0].itemStyle.color).toBe(dark.categorical[0]);
  expect(option.xAxis.axisLabel.color).toBe(dark.axisLabel);
});

test('admin exam status option maps status codes to Chinese labels', () => {
  const option = buildAdminExamStatusOption(admin) as any;
  expect(option.series[0].data.map((item: any) => [item.name, item.value])).toEqual([
    ['已发布', 2],
    ['已结束', 1],
  ]);
});

test('admin course exam option maps courses to counts', () => {
  const option = buildAdminCourseExamOption(admin) as any;
  expect(option.xAxis.data).toEqual(['计算机网络']);
  expect(option.series[0].data).toEqual([2]);
});

test('admin exam average option maps titles to avg scores', () => {
  const option = buildAdminExamAvgOption(admin) as any;
  expect(option.xAxis.data).toEqual(['期中考试']);
  expect(option.series[0].data).toEqual([75.5]);
});

test('admin exam pass rate option caps y axis at 100', () => {
  const option = buildAdminExamPassRateOption(admin) as any;
  expect(option.xAxis.data).toEqual(['期中考试']);
  expect(option.series[0].data).toEqual([50]);
  expect(option.yAxis.max).toBe(100);
});

test('admin score distribution option keeps all five buckets', () => {
  const option = buildAdminScoreDistOption(admin) as any;
  expect(option.xAxis.data).toEqual(['0-59', '60-69', '70-79', '80-89', '90-100']);
  expect(option.series[0].data.map((item: any) => item.value)).toEqual([1, 0, 0, 1, 0]);
});

test('admin exam participation option maps titles to counts', () => {
  const option = buildAdminExamParticipationOption(admin) as any;
  expect(option.xAxis.data).toEqual(['期中考试']);
  expect(option.series[0].data).toEqual([2]);
});

test('admin pending grading option maps exams to pending counts', () => {
  const option = buildAdminPendingOption(admin) as any;
  expect(option.xAxis.data).toEqual(['期中考试']);
  expect(option.series[0].data).toEqual([1]);
});

test('admin switch count option maps exams to switch totals', () => {
  const option = buildAdminSwitchOption(admin) as any;
  expect(option.xAxis.data).toEqual(['期中考试']);
  expect(option.series[0].data).toEqual([3]);
});

test('admin class distribution option maps classes to student counts', () => {
  const option = buildAdminClassDistOption(admin) as any;
  expect(option.xAxis.data).toEqual(['计科2401班']);
  expect(option.series[0].data).toEqual([2]);
});
