import type { AdminDashboardData, StudentDashboardData, TeacherDashboardData } from '../../types/dashboard';
import {
  buildAdminRoleOption,
  buildStudentPassRateOption,
  buildStudentScoreOption,
  buildTeacherPendingOption,
  buildTeacherRecentExamOption,
} from './chartOptions';

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

test('admin role option keeps labels and colors tied to roles', () => {
  const admin: AdminDashboardData = {
    role: 'admin',
    stats: { student_count: 4, teacher_count: 2, admin_count: 1, exam_count: 3 },
    role_distribution: [
      { role: 'teacher', count: 2 },
      { role: 'admin', count: 1 },
      { role: 'student', count: 4 },
    ],
    recent_users: [],
  };
  const option = buildAdminRoleOption(admin) as any;
  expect(
    option.series[0].data.map((item: any) => [item.name, item.itemStyle.color])
  ).toEqual([
    ['教师', '#EB6834'],
    ['管理员', '#1BAF7A'],
    ['学生', '#2A78D6'],
  ]);
});
