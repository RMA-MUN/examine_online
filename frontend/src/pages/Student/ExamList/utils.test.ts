import { getExamDisplayStatus, getExamCardColor, EXAM_CARD_COLORS } from './utils';
import type { Exam } from '../../../types/exam';

const makeExam = (overrides: Partial<Exam>): Exam => ({
  id: 1,
  course_id: 1,
  title: '测试考试',
  start_time: '2026-08-10 09:00:00',
  end_time: '2026-08-10 11:00:00',
  duration: 120,
  total_score: 100,
  pass_score: 60,
  random_order: true,
  max_switch: 3,
  status: 'published',
  created_at: '2026-08-01 09:00:00',
  student_record_status: null,
  ...overrides,
});

describe('getExamDisplayStatus', () => {
  it('无记录为未参加', () => {
    expect(getExamDisplayStatus(makeExam({}))).toBe('not_taken');
  });

  it('ongoing 为进行中', () => {
    expect(getExamDisplayStatus(makeExam({ student_record_status: 'ongoing' }))).toBe('ongoing');
  });

  it('submitted 为已完成', () => {
    expect(getExamDisplayStatus(makeExam({ student_record_status: 'submitted' }))).toBe('finished');
  });

  it('graded 为已完成', () => {
    expect(getExamDisplayStatus(makeExam({ student_record_status: 'graded' }))).toBe('finished');
  });
});

describe('getExamCardColor', () => {
  it('相同标题颜色稳定', () => {
    expect(getExamCardColor('期中考试')).toBe(getExamCardColor('期中考试'));
  });

  it('不同标题可得到不同颜色', () => {
    expect(EXAM_CARD_COLORS).toContain(getExamCardColor('期中考试'));
  });
});
