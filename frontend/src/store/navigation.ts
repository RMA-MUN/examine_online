export type Role = 'student' | 'teacher' | 'admin';

export interface NavItem {
  key: string; label: string; group: string | null;
  path: string; icon: string; roles: Role[];
}
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: '总览控制台', group: null, path: '/dashboard', icon: 'dashboard', roles: ['student', 'teacher', 'admin'] },
  { key: 'student-exam', label: '学生考试端', group: '考试运行', path: '/exams', icon: 'exam', roles: ['student', 'teacher', 'admin'] },
  { key: 'grading', label: '教师阅卷端', group: '考试运行', path: '/grading', icon: 'grading', roles: ['teacher', 'admin'] },
  { key: 'proctoring', label: '考试监控与防作弊', group: '考试运行', path: '/proctoring', icon: 'eye', roles: ['teacher', 'admin'] },
  { key: 'question-bank', label: '题库与组卷', group: '教学管理', path: '/question-bank', icon: 'bank', roles: ['teacher', 'admin'] },
  { key: 'analytics', label: '成绩分析与报表', group: '教学管理', path: '/analytics', icon: 'chart', roles: ['teacher', 'admin'] },
  { key: 'admin', label: '系统管理', group: '系统', path: '/admin', icon: 'setting', roles: ['admin'] },
];
export function filterByRole(items: NavItem[], role: Role): NavItem[] {
  return items.filter((i) => i.roles.includes(role));
}
