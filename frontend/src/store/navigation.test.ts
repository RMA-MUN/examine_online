import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, filterByRole } from './navigation';

describe('navigation', () => {
  it('学生看不到阅卷/监控/题库/管理', () => {
    const keys = filterByRole(NAV_ITEMS, 'student').map((i) => i.key);
    expect(keys).toContain('overview');
    expect(keys).toContain('student-exam');
    expect(keys).not.toContain('grading');
    expect(keys).not.toContain('proctoring');
    expect(keys).not.toContain('question-bank');
    expect(keys).not.toContain('admin');
  });
  it('admin 全见', () => {
    expect(filterByRole(NAV_ITEMS, 'admin').length).toBe(NAV_ITEMS.length);
  });
});
