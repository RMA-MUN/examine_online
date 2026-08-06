import type { Mock, MockedFunction } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExamManage from './index';
import { getExams } from '../../../api/exams';
import type { ApiResponse, Paginated } from '../../../types/api';
import type { Exam } from '../../../types/exam';

vi.mock('../../../api/exams', () => ({
  getExams: vi.fn(),
  deleteExam: vi.fn(),
  publishExam: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockGetExams = getExams as Mock;

const exam: Exam = {
  id: 1,
  course_id: 1,
  title: '测试考试',
  description: null,
  start_time: '2026-08-01 10:00:00',
  end_time: '2026-08-01 12:00:00',
  duration: 60,
  total_score: 100,
  pass_score: 60,
  random_order: true,
  max_switch: 3,
  status: 'draft',
  created_at: '2026-08-01 09:00:00',
};

describe('ExamManage', () => {
  beforeEach(() => {
    mockGetExams.mockResolvedValue({
      data: { items: [exam], total: 1, page: 1, page_size: 10 },
    } as ApiResponse<Paginated<Exam>>);
  });

  it('渲染下载模板按钮与说明文字', async () => {
    render(
      <MemoryRouter>
        <ExamManage />
      </MemoryRouter>
    );

    expect(await screen.findByText('下载模板')).not.toBeNull();
    expect(screen.getByText(/模板说明：按模板填写题目后/)).not.toBeNull();
  });
});
